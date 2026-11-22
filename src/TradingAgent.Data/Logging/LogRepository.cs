namespace TradingAgent.Data.Logging;

/// <summary>Reads and writes the <c>logs</c> table.</summary>
public sealed class LogRepository(Database database)
{
    public void InsertBatch(IReadOnlyList<LogEntry> entries)
    {
        ArgumentNullException.ThrowIfNull(entries);
        if (entries.Count == 0)
        {
            return;
        }

        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            INSERT INTO logs (ts, level, logger, message, exception)
            VALUES ($ts, $level, $logger, $message, $exception);
            """;
        var ts = command.Parameters.Add("$ts", Microsoft.Data.Sqlite.SqliteType.Integer);
        var level = command.Parameters.Add("$level", Microsoft.Data.Sqlite.SqliteType.Text);
        var logger = command.Parameters.Add("$logger", Microsoft.Data.Sqlite.SqliteType.Text);
        var message = command.Parameters.Add("$message", Microsoft.Data.Sqlite.SqliteType.Text);
        var exception = command.Parameters.Add("$exception", Microsoft.Data.Sqlite.SqliteType.Text);

        foreach (var entry in entries)
        {
            ts.Value = entry.TimestampMs;
            level.Value = entry.LevelName;
            logger.Value = entry.Logger;
            message.Value = entry.Message;
            exception.Value = (object?)entry.Exception ?? DBNull.Value;
            command.ExecuteNonQuery();
        }

        transaction.Commit();
    }

    /// <summary>Deletes entries older than <paramref name="cutoffMs"/> (Unix milliseconds). Returns how many.</summary>
    public int DeleteOlderThan(long cutoffMs)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM logs WHERE ts < $cutoff;";
        command.Parameters.AddWithValue("$cutoff", cutoffMs);
        return command.ExecuteNonQuery();
    }

    public long Count()
    {
        using var connection = database.Open();
        return Database.ScalarInt64(connection, "SELECT count(*) FROM logs;");
    }
}
