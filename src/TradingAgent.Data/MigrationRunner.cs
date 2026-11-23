using System.Globalization;
using System.Reflection;
using Microsoft.Data.Sqlite;

namespace TradingAgent.Data;

/// <param name="Version">Position in the sequence, starting at 1. Becomes the schema version once applied.</param>
public sealed record Migration(int Version, string Name, string Sql);

public sealed class MigrationException : Exception
{
    public MigrationException()
    {
    }

    public MigrationException(string message)
        : base(message)
    {
    }

    public MigrationException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>Brings a database to the newest schema by running numbered SQL scripts in order.</summary>
/// <remarks>
/// Scripts are the files <c>Migrations/NNNN_name.sql</c> embedded in this assembly. The applied version is
/// kept in SQLite's <c>user_version</c>. Each script runs in its own transaction together with the version
/// bump, so a failing script leaves the database exactly as it was.
/// A released script is never edited: a schema change is a new file with the next number.
/// </remarks>
public static class MigrationRunner
{
    private const string ResourcePrefix = "Migrations/";

    /// <summary>Reads the migrations embedded in this assembly, ordered by version.</summary>
    public static IReadOnlyList<Migration> LoadEmbedded()
    {
        var assembly = typeof(MigrationRunner).Assembly;
        var migrations = new List<Migration>();
        foreach (var resource in assembly.GetManifestResourceNames())
        {
            if (!resource.StartsWith(ResourcePrefix, StringComparison.Ordinal)
                || !resource.EndsWith(".sql", StringComparison.Ordinal))
            {
                continue;
            }

            // "Migrations/0001_initial.sql" -> version 1, name "initial"
            var fileName = resource[ResourcePrefix.Length..^".sql".Length];
            var separator = fileName.IndexOf('_', StringComparison.Ordinal);
            if (separator <= 0
                || !int.TryParse(fileName[..separator], NumberStyles.None, CultureInfo.InvariantCulture, out var version))
            {
                throw new MigrationException($"Migration '{resource}' is not named NNNN_name.sql.");
            }

            migrations.Add(new Migration(version, fileName[(separator + 1)..], ReadResource(assembly, resource)));
        }

        migrations.Sort((a, b) => a.Version.CompareTo(b.Version));
        return migrations;
    }

    /// <summary>Applies every migration newer than the database's version. Returns how many ran.</summary>
    /// <exception cref="MigrationException">
    /// The versions are not 1, 2, 3...; a script failed; or the database is newer than the newest migration.
    /// </exception>
    public static int Apply(SqliteConnection connection, IReadOnlyList<Migration> migrations)
    {
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(migrations);

        for (var i = 0; i < migrations.Count; i++)
        {
            if (migrations[i].Version != i + 1)
            {
                throw new MigrationException(
                    $"Migration versions must be 1, 2, 3 with no gaps; found {migrations[i].Version} at position {i + 1}.");
            }
        }

        var current = (int)Database.ScalarInt64(connection, "PRAGMA user_version;");
        if (current > migrations.Count)
        {
            // Refuse rather than guess: an older app writing to a newer schema could corrupt data.
            throw new MigrationException(
                $"The database has schema version {current}, but this app only knows up to {migrations.Count}. "
                + "It was written by a newer version of the app.");
        }

        var applied = 0;
        foreach (var migration in migrations)
        {
            if (migration.Version <= current)
            {
                continue;
            }

            try
            {
                using var transaction = connection.BeginTransaction();
                using (var script = connection.CreateCommand())
                {
                    script.Transaction = transaction;
                    script.CommandText = migration.Sql;
                    script.ExecuteNonQuery();
                }

                using (var bump = connection.CreateCommand())
                {
                    bump.Transaction = transaction;
                    // PRAGMA takes no parameters; the value is an int formatted by us.
                    bump.CommandText = string.Create(
                        CultureInfo.InvariantCulture,
                        $"PRAGMA user_version = {migration.Version};");
                    bump.ExecuteNonQuery();
                }

                transaction.Commit();
                applied++;
            }
            catch (SqliteException ex)
            {
                throw new MigrationException(
                    $"Migration {migration.Version:D4}_{migration.Name} failed: {ex.Message}", ex);
            }
        }

        return applied;
    }

    private static string ReadResource(Assembly assembly, string name)
    {
        using var stream = assembly.GetManifestResourceStream(name)
            ?? throw new MigrationException($"Embedded migration '{name}' could not be opened.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
