using System.Diagnostics;
using System.Globalization;
using System.Text;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Cli;
using TradingAgent.Agent.Runs;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Agent;

namespace TradingAgent.App.ViewModels;

/// <summary>
/// The "Agent" card of the Diagnostics page: which model answers and whether it can, what the OKX
/// trade kit is doing, and a button that sends one harmless question through the real run.
/// </summary>
/// <remarks>
/// Until there is a chat screen this is the owner's way to check a key or a sign-in: the test prompt
/// goes the whole way (runtime, model, tool host, a market data tool) and shows what came back.
/// It asks for a price only; nothing in it can place an order.
/// </remarks>
internal sealed partial class AgentCardViewModel : ObservableObject
{
    /// <summary>What the test asks. It needs one tool call and no key of the exchange.</summary>
    public const string TestPrompt =
        "What is the current price of BTC-USDT? Look it up with a tool and answer in one sentence. Do not place any order.";

    private const int MaxEventLines = 40;

    private readonly ISettingsStore _settings;
    private readonly ISecretStore _secrets;
    private readonly ClaudeCli _cli;
    private readonly AtkService _kit;
    private readonly AgentRunner _runner;
    private readonly AgentSessionRepository _sessions;
    private readonly IAgentEvents _events;
    private readonly Action<Action> _post;
    private readonly List<string> _eventLines = [];

    /// <param name="settings">Tells the provider and the sign-in mode.</param>
    /// <param name="secrets">Tells whether an API key is saved. Never its value.</param>
    /// <param name="cli">Tells whether Claude Code is installed and signed in.</param>
    /// <param name="kit">The OKX trade kit.</param>
    /// <param name="runner">Runs the test prompt.</param>
    /// <param name="sessions">Holds the test's session, which is deleted when the test ends.</param>
    /// <param name="events">What the run reports while it goes on.</param>
    /// <param name="post">Runs an action on the screen's thread; the dispatcher when null.</param>
    public AgentCardViewModel(
        ISettingsStore settings,
        ISecretStore secrets,
        ClaudeCli cli,
        AtkService kit,
        AgentRunner runner,
        AgentSessionRepository sessions,
        IAgentEvents events,
        Action<Action>? post = null)
    {
        _settings = settings;
        _secrets = secrets;
        _cli = cli;
        _kit = kit;
        _runner = runner;
        _sessions = sessions;
        _events = events;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));

        ShowTradeKit();
        // Raised on the trade kit's own thread.
        kit.StatusChanged += (_, _) => _post(ShowTradeKit);
        settings.Changed += (_, e) =>
        {
            if (e.Key == SettingKeys.AgentProvider.Name || e.Key == SettingKeys.AgentAuthMode.Name)
            {
                _post(() => ShowProvider());
            }
        };
        ShowProvider();
    }

    /// <summary>Which provider and sign-in mode the settings choose.</summary>
    [ObservableProperty]
    public partial string Provider { get; set; } = string.Empty;

    /// <summary>Whether that choice can answer now, and what to do when it cannot.</summary>
    [ObservableProperty]
    public partial string SignIn { get; set; } = string.Empty;

    /// <summary>Shown only for the subscription mode: what that mode means for the user's sign-in.</summary>
    [ObservableProperty]
    public partial string Notice { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string TradeKit { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string TestStatus { get; set; } = string.Empty;

    /// <summary>The model's answer to the test prompt, as it arrives.</summary>
    [ObservableProperty]
    public partial string TestAnswer { get; set; } = string.Empty;

    /// <summary>The tool calls of the test, one line each.</summary>
    [ObservableProperty]
    public partial string TestEvents { get; set; } = string.Empty;

    /// <summary>
    /// Shows the provider and the sign-in mode again and, for the subscription mode, asks Claude Code
    /// whether someone is signed in. That starts a process, so it happens only when asked for.
    /// </summary>
    [RelayCommand]
    public async Task RefreshAsync()
    {
        if (ShowProvider())
        {
            return;
        }

        SignIn = "Asking Claude Code…";
        _cli.Forget();
        // Kept off the screen's thread.
        var status = await Task.Run(() => _cli.GetStatusAsync(CancellationToken.None)).ConfigureAwait(false);
        _post(() => SignIn = status.Problem ?? $"Claude Code is signed in ({status.AuthMethod ?? "method not reported"}).");
    }

    /// <summary>Sends <see cref="TestPrompt"/> through the real run and shows what comes back.</summary>
    [RelayCommand(IncludeCancelCommand = true)]
    public async Task RunTestPromptAsync(CancellationToken cancellationToken)
    {
        TestAnswer = string.Empty;
        TestEvents = string.Empty;
        _eventLines.Clear();
        TestStatus = "Asking the model…";

        var session = _sessions.Create(title: "Diagnostics test");
        using var subscription = _events.Subscribe();
        using var pumping = new CancellationTokenSource();
        var pump = PumpAsync(subscription, session.Id, pumping.Token);
        var started = Stopwatch.GetTimestamp();
        try
        {
            var result = await Task.Run(() => _runner.RunAsync(session.Id, TestPrompt, cancellationToken), CancellationToken.None).ConfigureAwait(false);
            var seconds = Stopwatch.GetElapsedTime(started).TotalSeconds;
            // The pump ends by itself at the run's last event; the wait is only for the events
            // still on their way, the cancel for a run that never sent one.
            await pump.WaitAsync(TimeSpan.FromSeconds(2), CancellationToken.None).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
            await pumping.CancelAsync().ConfigureAwait(false);
            await pump.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
            _post(() => ShowResult(result, seconds));
        }
        finally
        {
            // A test leaves nothing in the list of chats.
            _sessions.Delete(session.Id);
        }
    }

    /// <summary>Shows what the settings choose. Returns true when that is all there is to know (an API key mode).</summary>
    private bool ShowProvider()
    {
        var openAi = _settings.GetValue(SettingKeys.AgentProvider) == AgentWire.OpenAi;
        if (openAi || _settings.GetValue(SettingKeys.AgentAuthMode) == AgentWire.ApiKey)
        {
            Provider = openAi ? "OpenAI, with an API key" : "Anthropic, with an API key";
            Notice = string.Empty;
            SignIn = KeyState(_secrets.GetState(openAi ? SecretNames.OpenAiApiKey : SecretNames.AnthropicApiKey));
            return true;
        }

        Provider = "Anthropic, with a Claude subscription (Claude Code runs the model)";
        Notice = ClaudeCli.SubscriptionNotice;
        SignIn = "Not asked yet. \"Check again\" asks Claude Code whether you are signed in.";
        return false;
    }

    private static string KeyState(SecretState state) => state.Status switch
    {
        SecretStatus.Saved => state.Hint.Length > 0 ? $"An API key is saved (ends in {state.Hint})." : "An API key is saved.",
        SecretStatus.Unreadable => "The saved API key cannot be read. Save it again.",
        _ => "No API key is saved.",
    };

    private void ShowTradeKit()
    {
        var status = _kit.Status;
        var mode = status.Sandbox ? "demo" : "live";
        TradeKit = status.State switch
        {
            AtkState.Running => string.Create(
                CultureInfo.InvariantCulture,
                $"Running in {mode} mode with {status.ToolCount} tools. {(status.HasKey ? "The saved OKX key is in use." : "No OKX key is saved: public data only.")}"),
            AtkState.Starting => $"Starting in {mode} mode…",
            AtkState.Unavailable => status.Detail ?? "Not installed.",
            AtkState.Failed => $"Failed; it is started again. {status.Detail}",
            _ => "Not running.",
        };
    }

    private void ShowResult(RunResult result, double seconds)
    {
        var reply = result.Reply;
        if (result.Kind != RunResultKind.Finished || reply is null)
        {
            TestStatus = "The test could not be started.";
            return;
        }

        if (reply.Content.Length > 0)
        {
            TestAnswer = reply.Content;
        }

        TestStatus = reply.Status switch
        {
            MessageStatus.Complete => string.Create(
                CultureInfo.InvariantCulture,
                $"Answered by {reply.Model ?? "the model"} in {seconds:0.0} s: {reply.InputTokens ?? 0} tokens in, {reply.OutputTokens ?? 0} out, {reply.ToolCalls.Count} tool call(s)."),
            MessageStatus.Cancelled => "Stopped.",
            _ => reply.Error ?? "The run failed.",
        };
    }

    private async Task PumpAsync(IAgentEventSubscription subscription, string sessionId, CancellationToken cancellationToken)
    {
        await foreach (var item in subscription.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
        {
            if (item.SessionId != sessionId)
            {
                continue;
            }

            switch (item)
            {
                case TextDelta delta:
                    _post(() => TestAnswer += delta.Text);
                    break;
                case ToolCallStarted started:
                    AddEventLine($"→ {started.Call.Name} {Shorten(started.Call.ArgumentsJson)}");
                    break;
                case ToolCallFinished finished:
                    AddEventLine(string.Create(
                        CultureInfo.InvariantCulture,
                        $"← {finished.Call.Name}: {finished.Call.Status.ToString().ToLowerInvariant()} ({finished.Call.DurationMs ?? 0} ms)"));
                    break;
                case RunFinished:
                    return;
            }
        }
    }

    private void AddEventLine(string line) =>
        _post(() =>
        {
            _eventLines.Add(line);
            if (_eventLines.Count > MaxEventLines)
            {
                _eventLines.RemoveAt(0);
            }

            TestEvents = new StringBuilder().AppendJoin('\n', _eventLines).ToString();
        });

    private static string Shorten(string text) => text.Length <= 120 ? text : text[..120] + "…";
}
