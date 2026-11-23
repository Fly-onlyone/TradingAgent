using Microsoft.Data.Sqlite;

namespace TradingAgent.Data.Tests;

/// <summary>A database file in its own temporary folder, deleted when the test ends.</summary>
internal sealed class TempDatabase : IDisposable
{
    public TempDatabase(bool initialize = true)
    {
        Folder = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Folder);
        Database = new Database(Path.Combine(Folder, "test.db"));
        if (initialize)
        {
            Database.Initialize();
        }
    }

    public string Folder { get; }

    public Database Database { get; }

    public void Execute(string sql, params (string Name, object? Value)[] parameters)
    {
        using var connection = Database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        command.ExecuteNonQuery();
    }

    public T? Scalar<T>(string sql, params (string Name, object? Value)[] parameters)
    {
        using var connection = Database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        var result = command.ExecuteScalar();
        return result is null or DBNull ? default : (T)Convert.ChangeType(result, typeof(T), System.Globalization.CultureInfo.InvariantCulture);
    }

    public void Dispose()
    {
        // Pooled connections keep the file open; release them before deleting it.
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(Folder, recursive: true);
        }
        catch (IOException)
        {
            // Another test's ClearAllPools may race this one; a leftover temp folder is harmless.
        }
    }
}

/// <summary>A clock that only moves when a test moves it.</summary>
internal sealed class ManualTimeProvider(DateTimeOffset now) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = now;

    public override DateTimeOffset GetUtcNow() => Now;
}
