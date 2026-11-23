using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using TradingAgent.Core.Hosting;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Agent;
using TradingAgent.Data.Logging;

namespace TradingAgent.Data;

/// <summary>Deletes data that has outlived its retention period. SQLite has no expiring rows of its own.</summary>
/// <remarks>
/// Runs shortly after start and then once a day. It prunes the <c>logs</c> table, and agent sessions
/// when the user set a retention period for them (<c>sessions.retention_days</c>; zero keeps them).
/// </remarks>
public sealed partial class RetentionService(
    LogRepository logs,
    AgentSessionRepository sessions,
    ISettingsStore settings,
    TimeProvider time,
    ILogger<RetentionService> logger)
    : IBackgroundService, IDisposable
{
    public static readonly TimeSpan LogRetention = TimeSpan.FromDays(30);

    /// <summary>Delay before the first run, so pruning does not compete with start-up.</summary>
    private static readonly TimeSpan _firstRunDelay = TimeSpan.FromMinutes(1);

    private ITimer? _timer;

    public string Name => "Retention";

    public Task StartAsync(CancellationToken stopping)
    {
        _timer ??= time.CreateTimer(_ => RunOnce(), null, _firstRunDelay, TimeSpan.FromDays(1));
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken deadline)
    {
        Dispose();
        return Task.CompletedTask;
    }

    /// <summary>Prunes now. Returns the number of log entries removed.</summary>
    public int RunOnce()
    {
        var removedLogs = PruneLogs();
        PruneSessions();
        return removedLogs;
    }

    /// <summary>Deletes sessions older than the user's retention period. Returns how many were removed.</summary>
    public int PruneSessions()
    {
        var days = settings.GetValue(SettingKeys.SessionRetentionDays);
        if (days <= 0)
        {
            return 0;
        }

        try
        {
            var now = time.GetUtcNow();
            var removed = sessions.DeleteInactiveSince((now - TimeSpan.FromDays(days)).ToUnixTimeMilliseconds());
            settings.SetValue(SettingKeys.SessionCleanupLastRunAt, now.ToUnixTimeMilliseconds());
            if (removed > 0)
            {
                LogSessionsPruned(logger, removed, days);
            }

            return removed;
        }
        catch (SqliteException ex)
        {
            LogPruneFailed(logger, ex);
            return 0;
        }
    }

    public void Dispose()
    {
        _timer?.Dispose();
        _timer = null;
    }

    private int PruneLogs()
    {
        try
        {
            var cutoff = time.GetUtcNow() - LogRetention;
            var removed = logs.DeleteOlderThan(cutoff.ToUnixTimeMilliseconds());
            if (removed > 0)
            {
                LogPruned(logger, removed, LogRetention.Days);
            }

            return removed;
        }
        catch (SqliteException ex)
        {
            LogPruneFailed(logger, ex);
            return 0;
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Removed {Count} log entries older than {Days} days.")]
    private static partial void LogPruned(ILogger logger, int count, int days);

    [LoggerMessage(Level = LogLevel.Information, Message = "Removed {Count} agent sessions with no activity for {Days} days.")]
    private static partial void LogSessionsPruned(ILogger logger, int count, int days);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Pruning old data failed; it will be retried tomorrow.")]
    private static partial void LogPruneFailed(ILogger logger, Exception exception);
}
