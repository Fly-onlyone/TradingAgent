using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Mcp;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Tools;
using TradingAgent.Core;
using TradingAgent.Core.Hosting;
using TradingAgent.Core.Settings;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.Agent.Atk;

public enum AtkState
{
    Stopped,
    Starting,
    Running,

    /// <summary>The trade kit is not installed. Nothing will change until the user installs it.</summary>
    Unavailable,

    /// <summary>It was started and failed; another attempt follows.</summary>
    Failed,
}

/// <param name="State">What the trade kit is doing.</param>
/// <param name="Detail">Why it is not running, in words for the user; null while it runs.</param>
/// <param name="ToolCount">How many of its tools the agent can use.</param>
/// <param name="Sandbox">The mode it was started in: true for demo trading, false for the live exchange.</param>
/// <param name="HasKey">Whether it was started with an OKX key. Without one, only public data works.</param>
public sealed record AtkStatus(AtkState State, string? Detail, int ToolCount, bool Sandbox, bool HasKey);

/// <summary>
/// Runs the OKX Agent Trade Kit for as long as the app runs and offers its tools to the agent.
/// </summary>
/// <remarks>
/// One child process, restarted when it dies, when the trading mode changes and when
/// <see cref="Reload"/> is called. Its tools appear in the tool host while it runs and disappear when
/// it does not. Not disposable on purpose: the background service host stops it at exit, within the
/// host's deadline, and the job object ends the process should that be missed.
/// <para>
/// <b>Every write passes the risk gate, here.</b> <see cref="CallAsync"/> is the only code that sends
/// a tool call to the kit, and for a tool that places an order, cancels one, moves funds or changes
/// leverage it asks <see cref="IAtkGate"/> first, in line. There is no second path to the kit that
/// could leave the gate out. A writing tool the gate has no rule for is refused before the gate is
/// asked, and is not shown to the model.
/// </para>
/// </remarks>
public sealed partial class AtkService : IBackgroundService, IToolSource
{

    private static readonly TimeSpan[] _restartDelays =
        [TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(60)];

    /// <summary>How long a restart waits for calls that are under way before it stops the trade kit anyway.</summary>
    private static readonly TimeSpan _drainTimeout = TimeSpan.FromSeconds(10);

    private readonly IAtkLauncher _launcher;
    private readonly IAtkGate _gate;
    private readonly Func<OkxCredentials?> _credentials;
    private readonly ISettingsStore _settings;
    private readonly AppInfo _info;
    private readonly TimeProvider _time;
    private readonly ILogger<AtkService> _logger;
    private readonly Lock _sync = new();

    private CancellationTokenSource? _stopping;
    private Task _supervisor = Task.CompletedTask;
    private TaskCompletionSource _restart = NewSignal();
    private volatile McpClient? _client;
    private volatile ITool[] _tools = [];
    private volatile AtkStatus _status;
    private int _inFlight;
    private volatile bool _accepting;

    /// <param name="launcher">Starts the trade kit.</param>
    /// <param name="gate">Decides about every tool call that writes.</param>
    /// <param name="credentials">Returns the saved OKX key, or null. Called at each start of the kit.</param>
    /// <param name="settings">Tells the trading mode, and when it changes.</param>
    /// <param name="info">The app's version, told to the trade kit.</param>
    /// <param name="time">Clock for the waits between restarts.</param>
    /// <param name="logger">Receives state changes and failures. Never tool arguments or results.</param>
    public AtkService(
        IAtkLauncher launcher,
        IAtkGate gate,
        Func<OkxCredentials?> credentials,
        ISettingsStore settings,
        AppInfo info,
        TimeProvider time,
        ILogger<AtkService> logger)
    {
        ArgumentNullException.ThrowIfNull(launcher);
        ArgumentNullException.ThrowIfNull(gate);
        ArgumentNullException.ThrowIfNull(credentials);
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(info);
        ArgumentNullException.ThrowIfNull(time);
        ArgumentNullException.ThrowIfNull(logger);
        _launcher = launcher;
        _gate = gate;
        _credentials = credentials;
        _settings = settings;
        _info = info;
        _time = time;
        _logger = logger;
        _status = new AtkStatus(AtkState.Stopped, null, 0, settings.GetValue(SettingKeys.OkxSandbox), HasKey: false);
    }

    /// <summary>Raised after <see cref="Status"/> changed, on the thread that changed it.</summary>
    public event EventHandler? StatusChanged;

    public string Name => "OKX trade kit";

    public AtkStatus Status => _status;

    /// <summary>
    /// True while the trade kit runs and takes calls. False while it starts or restarts: calls made
    /// then are refused, not queued.
    /// </summary>
    public bool IsAccepting => _accepting && _client is not null;

    public Task StartAsync(CancellationToken stopping)
    {
        lock (_sync)
        {
            if (_stopping is not null)
            {
                return Task.CompletedTask;
            }

            _stopping = CancellationTokenSource.CreateLinkedTokenSource(stopping);
            _settings.Changed += OnSettingChanged;
            var token = _stopping.Token;
            // Not awaited: the trade kit takes seconds to start and the app must not wait for it.
            _supervisor = Task.Run(() => SuperviseAsync(token), CancellationToken.None);
        }

        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken deadline)
    {
        CancellationTokenSource? stopping;
        lock (_sync)
        {
            stopping = _stopping;
            _stopping = null;
        }

        if (stopping is null)
        {
            return;
        }

        _settings.Changed -= OnSettingChanged;
        await stopping.CancelAsync().ConfigureAwait(false);
        try
        {
            await _supervisor.WaitAsync(deadline).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // The app will not wait longer; the job object ends the process when the app exits.
        }

        stopping.Dispose();
    }

    /// <summary>
    /// Restarts the trade kit with the key and mode as they are now. Call after the user saved or
    /// removed the OKX key; a change of the trading mode restarts it by itself.
    /// </summary>
    public void Reload() => Volatile.Read(ref _restart).TrySetResult();

    public IReadOnlyList<ITool> GetTools() => _tools;

    /// <summary>Calls a tool of the trade kit by its own name (without the model-facing prefix).</summary>
    /// <param name="toolName">The kit's name of the tool.</param>
    /// <param name="input">The arguments the model gave.</param>
    /// <param name="context">The run and the tool call; the risk gate records an order under it.</param>
    /// <param name="cancellationToken">Stops waiting. An order already sent may still be carried out.</param>
    public async Task<ToolOutcome> CallAsync(string toolName, JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        var kind = AtkToolCatalog.Kind(toolName);
        if (kind == AtkToolKind.Unknown)
        {
            return ToolOutcome.Denied($"'{toolName}' is not a tool this app allows.");
        }

        var writes = AtkToolCatalog.IsWrite(kind);
        if (writes && !AtkToolCatalog.IsSupportedWrite(toolName))
        {
            return ToolOutcome.Denied($"'{toolName}' is not supported by this app yet.");
        }

        // Counted before the checks, so a restart that starts now waits for this call: a write is
        // never cut off between the gate's yes and the answer of the exchange.
        Interlocked.Increment(ref _inFlight);
        try
        {
            var client = _client;
            var status = _status;
            if (!_accepting || client is null)
            {
                return ToolOutcome.Failed(
                    status.State == AtkState.Unavailable
                        ? status.Detail ?? "The OKX trade kit is not installed."
                        : "The OKX trade kit is starting or restarting. Try again in a few seconds.");
            }

            var arguments = input;
            if (writes)
            {
                // The kit trades in the mode it was started in. When the setting says otherwise, a
                // restart is on its way, and an order now would go to the wrong exchange.
                if (status.Sandbox != _settings.GetValue(SettingKeys.OkxSandbox))
                {
                    return ToolOutcome.Denied("The trading mode is being changed. Try again in a few seconds.");
                }

                var decision = await AskGateAsync(toolName, input, context, cancellationToken).ConfigureAwait(false);
                if (!decision.Allowed)
                {
                    return ToolOutcome.Denied(decision.Reason ?? "The risk gate refused the action.");
                }

                arguments = decision.Input ?? input;
            }

            try
            {
                var result = await client.CallToolAsync(toolName, arguments.GetRawText(), cancellationToken).ConfigureAwait(false);
                if (!result.IsError)
                {
                    return new ToolOutcome(result.Text);
                }

                // Without a key the kit's own advice is to sign in with OKX's command line tool,
                // which is not how this app is given a key.
                return ToolOutcome.Failed(
                    status.HasKey ? result.Text : result.Text + "\n\nNo OKX API key is saved in this app. The user saves one in the app's settings.");
            }
            catch (McpException ex)
            {
                return ToolOutcome.Failed(writes
                    ? ex.Message + " It is not known whether OKX carried the action out. Read the open orders and the balance before trying again."
                    : ex.Message);
            }
        }
        finally
        {
            Interlocked.Decrement(ref _inFlight);
        }
    }

    /// <summary>Asks the gate. A gate that throws has allowed nothing.</summary>
    private async Task<GateDecision> AskGateAsync(string toolName, JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        try
        {
            return await _gate.CheckAsync(toolName, input, context, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
        {
            LogGateThrew(_logger, toolName, ex);
            return GateDecision.Deny("The safety check could not be completed, so the action was refused.");
        }
    }
    private static TaskCompletionSource NewSignal() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    private void OnSettingChanged(object? sender, SettingChangedEventArgs e)
    {
        if (e.Key == SettingKeys.OkxSandbox.Name)
        {
            Reload();
        }
    }

    private async Task SuperviseAsync(CancellationToken stopping)
    {
        var failures = 0;
        while (!stopping.IsCancellationRequested)
        {
            var restart = Volatile.Read(ref _restart);
            var credentials = _credentials();
            var options = new AtkLaunchOptions(_settings.GetValue(SettingKeys.OkxSandbox), AtkToolCatalog.DefaultModules, ReadOnly: false, credentials);
            var hasKey = credentials is not null;
            try
            {
                SetStatus(new AtkStatus(AtkState.Starting, null, 0, options.Sandbox, hasKey));
                var transport = await _launcher.LaunchAsync(options, stopping).ConfigureAwait(false);
                var client = new McpClient(transport, _logger);
                try
                {
                    var server = await client.InitializeAsync("trading-agent", _info.Version, stopping).ConfigureAwait(false);
                    var offered = await client.ListToolsAsync(stopping).ConfigureAwait(false);

                    var tools = Curate(offered);
                    _tools = tools;
                    _client = client;
                    _accepting = true;
                    failures = 0;
                    LogRunning(_logger, server, tools.Length, offered.Count);
                    SetStatus(new AtkStatus(AtkState.Running, null, tools.Length, options.Sandbox, hasKey));

                    var ended = await Task.WhenAny(client.Closed, restart.Task, Task.Delay(Timeout.InfiniteTimeSpan, stopping)).ConfigureAwait(false);
                    if (ended == client.Closed && !stopping.IsCancellationRequested)
                    {
                        throw new McpException("The OKX trade kit stopped unexpectedly.");
                    }

                    await DrainAsync().ConfigureAwait(false);
                }
                finally
                {
                    _accepting = false;
                    _client = null;
                    _tools = [];
                    await client.DisposeAsync().ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) when (stopping.IsCancellationRequested)
            {
                break;
            }
            catch (AtkUnavailableException ex)
            {
                LogUnavailable(_logger, ex.Message);
                SetStatus(new AtkStatus(AtkState.Unavailable, ex.Message, 0, options.Sandbox, hasKey));
                // Trying again would find the same: wait until the user changes something.
                await WaitAsync(restart.Task, Timeout.InfiniteTimeSpan, stopping).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is McpException or IOException or UnauthorizedAccessException or InvalidOperationException)
            {
                var delay = _restartDelays[Math.Min(failures, _restartDelays.Length - 1)];
                failures++;
                LogFailed(_logger, delay.TotalSeconds, ex);
                SetStatus(new AtkStatus(AtkState.Failed, ex.Message, 0, options.Sandbox, hasKey));
                await WaitAsync(restart.Task, delay, stopping).ConfigureAwait(false);
            }

            if (restart.Task.IsCompleted)
            {
                // Replaced only here, so a request made during a restart is not lost: it completes
                // the signal the next pass waits on.
                Interlocked.CompareExchange(ref _restart, NewSignal(), restart);
            }
        }

        SetStatus(_status with { State = AtkState.Stopped, Detail = null, ToolCount = 0 });
    }

    /// <summary>Refuses new calls and waits for the ones under way, so a restart does not cut a call in half.</summary>
    private async Task DrainAsync()
    {
        _accepting = false;
        var deadline = _time.GetUtcNow() + _drainTimeout;
        while (Volatile.Read(ref _inFlight) > 0 && _time.GetUtcNow() < deadline)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(50), _time).ConfigureAwait(false);
        }
    }

    private async Task WaitAsync(Task signal, TimeSpan delay, CancellationToken stopping)
    {
        try
        {
            await Task.WhenAny(signal, Task.Delay(delay, _time, stopping)).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Stopping; the loop sees it.
        }
    }

    /// <summary>
    /// The offered tools the agent may use: those the inventory lists as reading (unless the kit
    /// marks them as writing), and the writing tools the risk gate has a rule for.
    /// </summary>
    private ITool[] Curate(IReadOnlyList<McpTool> offered)
    {
        var tools = new List<ITool>();
        foreach (var tool in offered)
        {
            var kind = AtkToolCatalog.Kind(tool.Name);
            if (kind == AtkToolKind.Unknown)
            {
                if (!AtkToolCatalog.IsExcluded(tool.Name))
                {
                    // Logged, so a new version of the trade kit that adds tools is noticed.
                    LogNotInInventory(_logger, tool.Name);
                }
            }
            else if (kind == AtkToolKind.Read)
            {
                if (tool.ReadOnly == false)
                {
                    // The inventory says it reads, the kit says it writes: the kit changed under the
                    // inventory. The stricter reading wins.
                    LogInventoryDisagrees(_logger, tool.Name);
                    continue;
                }

                tools.Add(new AtkTool(this, tool));
            }
            else if (AtkToolCatalog.IsSupportedWrite(tool.Name))
            {
                tools.Add(new AtkTool(this, tool));
            }
        }

        return [.. tools];
    }

    private void SetStatus(AtkStatus status)
    {
        _status = status;
        StatusChanged?.Invoke(this, EventArgs.Empty);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "The OKX trade kit is running ({Server}): {Used} of its {Offered} tools are available to the agent.")]
    private static partial void LogRunning(ILogger logger, string server, int used, int offered);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The OKX trade kit offers a tool that is not in this app's inventory; it is hidden: {Tool}")]
    private static partial void LogNotInInventory(ILogger logger, string tool);

    [LoggerMessage(Level = LogLevel.Error, Message = "The OKX trade kit marks a tool as writing that this app's inventory lists as reading; it is hidden: {Tool}")]
    private static partial void LogInventoryDisagrees(ILogger logger, string tool);

    [LoggerMessage(Level = LogLevel.Error, Message = "The risk gate threw on {Tool}; the action was refused.")]
    private static partial void LogGateThrew(ILogger logger, string tool, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The OKX trade kit is not available: {Reason}")]
    private static partial void LogUnavailable(ILogger logger, string reason);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The OKX trade kit failed; next attempt in {Seconds} s.")]
    private static partial void LogFailed(ILogger logger, double seconds, Exception exception);

    /// <summary>A trade kit tool as the agent's tool host sees it.</summary>
    private sealed class AtkTool(AtkService service, McpTool tool) : ITool
    {
        // OpenAI caps a function description at this length; the kit's longest is a little over it.
        private const int MaxDescriptionLength = 1024;

        public ToolDefinition Definition { get; } = new(
            AtkToolCatalog.ModelName(tool.Name),
            tool.Description.Length <= MaxDescriptionLength ? tool.Description : tool.Description[..MaxDescriptionLength],
            tool.InputSchemaJson);

        public Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken) =>
            service.CallAsync(tool.Name, input, context, cancellationToken);
    }
}
