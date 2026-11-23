using Microsoft.Extensions.Logging;

namespace TradingAgent.Data.Logging;

/// <summary>Writes warnings and errors to the <c>logs</c> table, where the in-app log viewer reads them.</summary>
/// <remarks>Lower levels go to the log file only; they would bloat the database.</remarks>
[ProviderAlias("Sqlite")]
public sealed class SqliteLoggerProvider(LogRepository repository, TimeProvider time)
    : BatchingLoggerProvider(LogLevel.Warning, batchSize: 50, flushInterval: TimeSpan.FromSeconds(5), time)
{
    protected override void Write(IReadOnlyList<LogEntry> batch) => repository.InsertBatch(batch);
}
