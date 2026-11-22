using Microsoft.Extensions.Logging;

namespace TradingAgent.Data.Logging;

/// <summary>One log line after redaction, ready to be written by a sink.</summary>
/// <param name="TimestampMs">Unix milliseconds, UTC.</param>
public readonly record struct LogEntry(long TimestampMs, LogLevel Level, string Logger, string Message, string? Exception)
{
    /// <summary>The level as stored in the <c>logs</c> table and in the log file.</summary>
    public string LevelName => Level switch
    {
        LogLevel.Trace => "trace",
        LogLevel.Debug => "debug",
        LogLevel.Information => "information",
        LogLevel.Warning => "warning",
        LogLevel.Error => "error",
        _ => "critical",
    };
}
