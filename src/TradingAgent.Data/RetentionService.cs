using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using TradingAgent.Data.Logging;

namespace TradingAgent.Data;

/// <summary>Deletes data that has outlived its retention period. SQLite has no expiring rows of its own.</summary>
/// <remarks>Runs shortly after start and then once a day. Today it prunes the <c>logs</c> table.</remarks>
public sealed partial class RetentionService(LogRepository logs, TimeProvider time, ILogger<RetentionService> logger)
    : IDisposable
{
    public static readonly TimeSpan LogRetention = TimeSpan.FromDays(30);

    /// <summary>Delay before the first run, so pruning does not compete with start-up.</summary>
    private static readonly TimeSpan _firstRunDelay = TimeSpan.FromMinutes(1);

    private ITimer? _timer;

    public void Start() => _timer ??= time.CreateTimer(_ => RunOnce(), null, _firstRunDelay, TimeSpan.FromDays(1));

    /// <summary>Prunes now. Returns the number of log entries removed.</summary>
    public int RunOnce()
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

    public void Dispose() => _timer?.Dispose();

    [LoggerMessage(Level = LogLevel.Information, Message = "Removed {Count} log entries older than {Days} days.")]
    private static partial void LogPruned(ILogger logger, int count, int days);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Pruning old log entries failed; it will be retried tomorrow.")]
    private static partial void LogPruneFailed(ILogger logger, Exception exception);
}
