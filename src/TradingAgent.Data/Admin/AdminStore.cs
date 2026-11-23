using System.Globalization;
using Microsoft.Data.Sqlite;
using TradingAgent.Core;

namespace TradingAgent.Data.Admin;

/// <summary>One entry of the log the app keeps in its database (warnings and errors).</summary>
public sealed record LogRow(long Id, long Timestamp, string Level, string Logger, string Message, string? Exception);

/// <summary>A table and how many rows it holds.</summary>
public sealed record TableInfo(string Name, long Rows);

/// <summary>A copy of the database made with "Back up now".</summary>
public sealed record BackupFile(string Path, string Name, long Size, DateTime CreatedUtc);

/// <summary>A kind of data the user can delete as a whole.</summary>
public sealed record DataCategory(string Key, string Label, long Rows);

/// <summary>
/// What the Admin page does: read the log, look at the database, back it up and restore it, and
/// delete whole kinds of data.
/// </summary>
/// <remarks>
/// A restore cannot replace a database that is open. So it is asked for here and done at the next
/// start, before anything opens the file: <see cref="ApplyPendingRestore"/>. The database that is
/// replaced is kept next to the new one, so a restore can itself be undone by hand.
/// </remarks>
public sealed class AdminStore(Database database, AppPaths paths, TimeProvider time)
{
    private static readonly (string Key, string Label, string[] Tables)[] _categories =
    [
        ("chats", "Chats and task runs", ["agent_sessions"]),
        ("memories", "Memories", ["agent_memories"]),
        ("strategies", "Strategies", ["strategies", "strategy_knowledge", "strategy_discovery_cycles"]),
        ("lessons", "Trade lessons and patterns", ["trade_lessons", "trading_patterns"]),
        ("news", "News articles", ["news_articles"]),
        ("tasks", "Scheduled tasks", ["agent_tasks"]),
        ("notifications", "Notifications", ["notifications"]),
        ("logs", "Log entries", ["logs"]),
    ];

    private static readonly byte[] _sqliteHeader = "SQLite format 3\0"u8.ToArray();

    /// <summary>The backup that replaces the database at the next start; null when none is asked for.</summary>
    public string? PendingRestore =>
        File.Exists(paths.RestoreMarkerFile) && File.ReadAllText(paths.RestoreMarkerFile).Trim() is { Length: > 0 } path ? path : null;

    /// <summary>
    /// Puts a backup in the place of the database when a restore was asked for. Call before the
    /// database is opened. Returns true when a backup was put in place.
    /// </summary>
    public static bool ApplyPendingRestore(AppPaths paths)
    {
        ArgumentNullException.ThrowIfNull(paths);
        if (!File.Exists(paths.RestoreMarkerFile))
        {
            return false;
        }

        try
        {
            var backup = File.ReadAllText(paths.RestoreMarkerFile).Trim();
            if (!IsBackup(paths, backup))
            {
                return false;
            }

            if (File.Exists(paths.DatabaseFile))
            {
                File.Move(paths.DatabaseFile, paths.DatabaseFile + ".before-restore", overwrite: true);
            }

            // What was not yet written into the old file belongs to the old file.
            File.Delete(paths.DatabaseFile + "-wal");
            File.Delete(paths.DatabaseFile + "-shm");
            File.Copy(backup, paths.DatabaseFile, overwrite: true);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // The app starts with the database it has.
            return false;
        }
        finally
        {
            try
            {
                File.Delete(paths.RestoreMarkerFile);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Tried again at the next start.
            }
        }
    }

    /// <summary>The newest log entries, of one level or of all, that hold <paramref name="text"/>.</summary>
    public IReadOnlyList<LogRow> Logs(string? level, string? text, int limit) =>
        database.Query(
            """
            SELECT id, ts, level, logger, message, exception FROM logs
            WHERE ($level IS NULL OR level = $level)
              AND ($text IS NULL OR message LIKE $text ESCAPE '\' OR logger LIKE $text ESCAPE '\' OR exception LIKE $text ESCAPE '\')
            ORDER BY id DESC
            LIMIT $limit;
            """,
            reader => new LogRow(reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.Text(5)),
            ("$level", string.IsNullOrWhiteSpace(level) ? null : level),
            ("$text", string.IsNullOrWhiteSpace(text) ? null : "%" + text.Trim().Replace(@"\", @"\\", StringComparison.Ordinal).Replace("%", @"\%", StringComparison.Ordinal).Replace("_", @"\_", StringComparison.Ordinal) + "%"),
            ("$limit", limit));

    /// <summary>The tables of the database with their row counts. The inner tables of the search indexes are left out.</summary>
    public IReadOnlyList<TableInfo> Tables()
    {
        var names = database.Query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' ORDER BY name;",
            reader => reader.GetString(0));
        // The names come from the database's own catalog, not from a person.
        return [.. names.Select(name => new TableInfo(name, database.Number($"SELECT count(*) FROM \"{name}\";")))];
    }

    /// <summary>Size of the database file and its write-ahead log, in bytes.</summary>
    public long FileSize() =>
        new[] { database.DatabaseFile, database.DatabaseFile + "-wal" }.Where(File.Exists).Sum(file => new FileInfo(file).Length);

    /// <summary>Asks SQLite to check the file. "ok" when nothing is wrong.</summary>
    public string CheckIntegrity() =>
        string.Join("; ", database.Query("PRAGMA integrity_check;", reader => reader.GetString(0)));

    /// <summary>Rewrites the file without the space deleted rows left behind.</summary>
    public void Compact() => database.Execute("VACUUM;");

    /// <summary>Writes a copy of the database into the backup folder.</summary>
    public BackupFile BackUp()
    {
        Directory.CreateDirectory(paths.BackupDirectory);
        var name = string.Create(CultureInfo.InvariantCulture, $"trading-agent-{time.GetUtcNow():yyyyMMdd-HHmmss}.db");
        var path = Path.Combine(paths.BackupDirectory, name);
        // A consistent copy while the app keeps writing. The path is the app's own, not typed by anybody.
        database.Execute("VACUUM INTO $path;", ("$path", path));
        var file = new FileInfo(path);
        return new BackupFile(path, name, file.Length, file.CreationTimeUtc);
    }

    public IReadOnlyList<BackupFile> Backups() =>
        Directory.Exists(paths.BackupDirectory)
            ? [.. new DirectoryInfo(paths.BackupDirectory)
                .GetFiles("*.db")
                .OrderByDescending(file => file.CreationTimeUtc)
                .Select(file => new BackupFile(file.FullName, file.Name, file.Length, file.CreationTimeUtc))]
            : [];

    /// <summary>Deletes a backup. Only a file in the backup folder is ever deleted.</summary>
    public bool DeleteBackup(string path)
    {
        if (!IsBackup(paths, path))
        {
            return false;
        }

        File.Delete(path);
        if (PendingRestore == path)
        {
            CancelRestore();
        }

        return true;
    }

    /// <summary>Asks for a backup to replace the database at the next start. False when the file is not a backup of this app.</summary>
    public bool RequestRestore(string path)
    {
        if (!IsBackup(paths, path))
        {
            return false;
        }

        File.WriteAllText(paths.RestoreMarkerFile, path);
        return true;
    }

    public void CancelRestore() => File.Delete(paths.RestoreMarkerFile);

    public IReadOnlyList<DataCategory> Categories() =>
        [.. _categories.Select(category => new DataCategory(
            category.Key,
            category.Label,
            category.Tables.Sum(table => database.Number($"SELECT count(*) FROM {table};"))))];

    /// <summary>Deletes everything of one kind. Returns how many rows were removed; -1 for a kind that does not exist.</summary>
    public long Delete(string key)
    {
        var category = _categories.FirstOrDefault(candidate => candidate.Key == key);
        if (category.Tables is null)
        {
            return -1;
        }

        long removed = 0;
        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();
        foreach (var table in category.Tables)
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = $"DELETE FROM {table};";
            removed += command.ExecuteNonQuery();
        }

        transaction.Commit();
        return removed;
    }

    /// <summary>True for an SQLite file inside the app's backup folder.</summary>
    private static bool IsBackup(AppPaths paths, string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            return false;
        }

        var folder = Path.GetFullPath(paths.BackupDirectory) + Path.DirectorySeparatorChar;
        if (!Path.GetFullPath(path).StartsWith(folder, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        try
        {
            using var file = File.OpenRead(path);
            var header = new byte[_sqliteHeader.Length];
            return file.Read(header, 0, header.Length) == header.Length && header.AsSpan().SequenceEqual(_sqliteHeader);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }
}
