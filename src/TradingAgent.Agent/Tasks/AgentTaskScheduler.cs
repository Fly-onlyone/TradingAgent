using System.Collections.Concurrent;
using System.Text;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Runs;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Hosting;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Tasks;
using TradingAgent.Data.Agent;
using TradingAgent.Data.Notifications;
using TradingAgent.Data.Tasks;

namespace TradingAgent.Agent.Tasks;

/// <summary>
/// Runs the scheduled tasks when their time comes. Each run is an agent run in a session of its own,
/// so the chat screen shows it like any other conversation.
/// </summary>
/// <remarks>
/// A task the user did not allow to trade cannot trade: the session of its run is blocked at the risk
/// gate, which no prompt can talk its way past. Tasks run one after another, so that two runs never
/// compete for the same model sign-in.
/// </remarks>
public sealed partial class AgentTaskScheduler(
    AgentTaskRepository tasks,
    AgentSessionRepository sessions,
    AgentRunner runner,
    IAgentEvents events,
    NotificationService notifications,
    SessionWriteBlocks blocks,
    ISettingsStore settings,
    TimeProvider time,
    ILogger<AgentTaskScheduler> logger)
    : IBackgroundService, IDisposable
{
    /// <summary>How often the scheduler looks for tasks whose time has come.</summary>
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    private readonly ConcurrentDictionary<string, byte> _running = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _oneAtATime = new(1, 1);
    private CancellationTokenSource? _stop;
    private Task? _loop;

    /// <summary>Raised after a task ran, was skipped, or changed state. Not on the UI thread.</summary>
    public event EventHandler? TasksChanged;

    public string Name => "Task scheduler";

    public Task StartAsync(CancellationToken stopping)
    {
        _stop = CancellationTokenSource.CreateLinkedTokenSource(stopping);
        _loop = Task.Run(() => LoopAsync(_stop.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken deadline)
    {
        if (_stop is not null)
        {
            await _stop.CancelAsync().ConfigureAwait(false);
        }

        if (_loop is not null)
        {
            await _loop.WaitAsync(deadline).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
        }
    }

    public void Dispose()
    {
        _oneAtATime.Dispose();
        _stop?.Dispose();
    }

    public bool IsRunning(string taskId) => _running.ContainsKey(taskId);

    /// <summary>Runs every task whose time has come. Returns how many ran.</summary>
    public async Task<int> RunDueAsync(CancellationToken cancellationToken)
    {
        var ran = 0;
        foreach (var task in tasks.Due())
        {
            if (await RunAsync(task, cancellationToken).ConfigureAwait(false))
            {
                ran++;
            }
        }

        return ran;
    }

    /// <summary>Runs one task now, whatever its schedule. False when it does not exist or is running.</summary>
    public async Task<bool> RunNowAsync(string taskId, CancellationToken cancellationToken) =>
        tasks.Get(taskId) is { } task && await RunAsync(task, cancellationToken).ConfigureAwait(false);

    /// <summary>What a run of a task is told to do.</summary>
    internal static string BuildPrompt(AgentTask task)
    {
        var prompt = new StringBuilder();
        prompt.AppendLine($"This is a scheduled run of the task \"{task.Name}\". Nobody is watching: do the work, then end with a short report of what you found and did.");
        prompt.AppendLine();
        prompt.AppendLine(task.Instructions.Length > 0 ? task.Instructions : "Review the market and the account, and report anything that needs attention.");
        if (task.Symbols.Count > 0)
        {
            prompt.AppendLine();
            prompt.AppendLine($"Instruments: {string.Join(", ", task.Symbols)}.");
        }

        prompt.AppendLine();
        prompt.AppendLine(task switch
        {
            { TradingEnabled: false } => "This task may not trade. Do not place, cancel or change orders, set leverage or transfer funds: the app refuses all of it in this run. Recommend instead.",
            { AskFirst: true } => "This task may trade. Before you place an order, ask the user with ask_user and wait for the answer. Follow the risk rules.",
            _ => "This task may trade without asking. Follow the risk rules exactly, and place an order only when the task's instructions call for it.",
        });
        return prompt.ToString().TrimEnd();
    }

    private async Task LoopAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(Interval, time);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false))
            {
                try
                {
                    await RunDueAsync(cancellationToken).ConfigureAwait(false);
                }
#pragma warning disable CA1031 // One bad pass must not end the scheduler: the next pass may work.
                catch (Exception ex) when (ex is not OperationCanceledException)
#pragma warning restore CA1031
                {
                    LogPassFailed(logger, ex);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // The app is closing.
        }
    }

    private async Task<bool> RunAsync(AgentTask task, CancellationToken cancellationToken)
    {
        if (!_running.TryAdd(task.Id, 0))
        {
            return false;
        }

        try
        {
            var next = TaskSchedule.Next(task.Schedules, time.GetUtcNow(), task.Zone);
            if (task.TradingEnabled && settings.GetValue(SettingKeys.EmergencyStopActive))
            {
                // Not counted as a run or a failure: the user stopped trading, the task did nothing wrong.
                tasks.SetNextRun(task.Id, next ?? time.GetUtcNow().AddMinutes(5));
                LogSkipped(logger, task.Id);
                return false;
            }

            await _oneAtATime.WaitAsync(cancellationToken).ConfigureAwait(false);
            var session = sessions.Create(SessionKind.TaskRun, $"Task: {task.Name}");
            try
            {
                if (!task.TradingEnabled)
                {
                    blocks.Block(session.Id, $"The scheduled task \"{task.Name}\" is not allowed to trade. The user can allow it on the Tasks page.");
                }

                events.Publish(new SessionChanged(session.Id));
                TasksChanged?.Invoke(this, EventArgs.Empty);
                var result = await runner.RunAsync(session.Id, BuildPrompt(task), cancellationToken).ConfigureAwait(false);
                var succeeded = result.Reply is { Status: MessageStatus.Complete };
                var error = result.Reply?.Error ?? (succeeded ? null : "The run did not finish.");
                tasks.RecordRun(task.Id, session.Id, succeeded, error, next);
                notifications.Notify(new Notification(
                    succeeded ? NotificationKind.TaskCompleted : NotificationKind.TaskFailed,
                    succeeded ? $"Task finished: {task.Name}" : $"Task failed: {task.Name}",
                    Shorten(succeeded ? result.Reply?.Content : error),
                    SessionId: session.Id));
                LogRan(logger, task.Id, succeeded);
                return true;
            }
            finally
            {
                blocks.Release(session.Id);
                _oneAtATime.Release();
            }
        }
        finally
        {
            _running.TryRemove(task.Id, out _);
            TasksChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    private static string Shorten(string? text)
    {
        var line = (text ?? string.Empty).ReplaceLineEndings(" ").Trim();
        return line.Length == 0 ? "No report." : line.Length <= 200 ? line : line[..200] + "…";
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Task {TaskId} ran; succeeded: {Succeeded}.")]
    private static partial void LogRan(ILogger logger, string taskId, bool succeeded);

    [LoggerMessage(Level = LogLevel.Information, Message = "Task {TaskId} was skipped: it trades and the emergency stop is on.")]
    private static partial void LogSkipped(ILogger logger, string taskId);

    [LoggerMessage(Level = LogLevel.Error, Message = "A pass of the task scheduler failed.")]
    private static partial void LogPassFailed(ILogger logger, Exception exception);
}
