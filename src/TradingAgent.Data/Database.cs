using System.Globalization;
using Microsoft.Data.Sqlite;

namespace TradingAgent.Data;

/// <summary>The app's SQLite database file: opens connections and brings the schema up to date.</summary>
public sealed class Database
{
    private readonly string _connectionString;

    public Database(string databaseFile)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(databaseFile);
        DatabaseFile = databaseFile;
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databaseFile,
            Mode = SqliteOpenMode.ReadWriteCreate,
            ForeignKeys = true,
            Pooling = true,
            // Seconds a command keeps retrying while another connection holds the write lock.
            DefaultTimeout = 5,
        }.ToString();
    }

    public string DatabaseFile { get; }

    /// <summary>Schema version after <see cref="Initialize"/>; zero before.</summary>
    public int SchemaVersion { get; private set; }

    public string SqliteVersion { get; private set; } = string.Empty;

    /// <summary>Opens a pooled connection. Dispose it after use; do not share it between threads.</summary>
    public SqliteConnection Open()
    {
        var connection = new SqliteConnection(_connectionString);
        try
        {
            connection.Open();
            // Per connection, not stored in the file. NORMAL is safe with WAL: a power cut can lose the
            // last transactions but cannot corrupt the database.
            Execute(connection, "PRAGMA synchronous = NORMAL;");
            return connection;
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    /// <summary>Creates the file if needed, switches it to write-ahead logging and applies pending migrations.</summary>
    /// <exception cref="InvalidOperationException">The bundled SQLite was built without full-text search.</exception>
    /// <exception cref="MigrationException">A migration failed, or the file was written by a newer app version.</exception>
    public void Initialize()
    {
        var directory = Path.GetDirectoryName(DatabaseFile);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        using var connection = Open();

        // Stored in the file. Must run outside a transaction.
        Execute(connection, "PRAGMA journal_mode = WAL;");

        if (ScalarInt64(connection, "SELECT sqlite_compileoption_used('ENABLE_FTS5');") != 1)
        {
            throw new InvalidOperationException(
                "The bundled SQLite library has no FTS5 support; knowledge search cannot work.");
        }

        MigrationRunner.Apply(connection, MigrationRunner.LoadEmbedded());

        SchemaVersion = (int)ScalarInt64(connection, "PRAGMA user_version;");
        using var version = connection.CreateCommand();
        version.CommandText = "SELECT sqlite_version();";
        SqliteVersion = Convert.ToString(version.ExecuteScalar(), CultureInfo.InvariantCulture) ?? string.Empty;
    }

    internal static void Execute(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    internal static long ScalarInt64(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToInt64(command.ExecuteScalar(), CultureInfo.InvariantCulture);
    }
}
