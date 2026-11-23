using Xunit;

namespace TradingAgent.Data.Tests;

public sealed class MigrationRunnerTests
{
    [Fact]
    public void Embedded_migrations_are_numbered_from_one_without_gaps()
    {
        var migrations = MigrationRunner.LoadEmbedded();

        Assert.NotEmpty(migrations);
        Assert.Equal(Enumerable.Range(1, migrations.Count), migrations.Select(m => m.Version));
        Assert.Equal("initial", migrations[0].Name);
    }

    [Fact]
    public void Initialize_brings_a_new_file_to_the_newest_version_and_is_idempotent()
    {
        using var temp = new TempDatabase();
        var expected = MigrationRunner.LoadEmbedded().Count;

        Assert.Equal(expected, temp.Database.SchemaVersion);

        temp.Database.Initialize();
        using var connection = temp.Database.Open();

        Assert.Equal(0, MigrationRunner.Apply(connection, MigrationRunner.LoadEmbedded()));
        Assert.Equal(expected, temp.Database.SchemaVersion);
        Assert.Equal("wal", temp.Scalar<string>("PRAGMA journal_mode;"));
    }

    [Fact]
    public void Only_migrations_newer_than_the_database_run()
    {
        using var temp = new TempDatabase(initialize: false);
        using var connection = temp.Database.Open();
        Migration[] migrations =
        [
            new(1, "a", "CREATE TABLE a (x INTEGER);"),
            new(2, "b", "CREATE TABLE b (x INTEGER);"),
        ];

        Assert.Equal(1, MigrationRunner.Apply(connection, migrations[..1]));
        Assert.Equal(1, MigrationRunner.Apply(connection, migrations));

        Assert.Equal(2, temp.Scalar<long>("PRAGMA user_version;"));
        Assert.Equal(2, temp.Scalar<long>("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN ('a', 'b');"));
    }

    [Fact]
    public void A_failing_script_leaves_schema_and_version_unchanged()
    {
        using var temp = new TempDatabase(initialize: false);
        using var connection = temp.Database.Open();
        Migration[] migrations =
        [
            new(1, "good", "CREATE TABLE good (x INTEGER);"),
            new(2, "bad", "CREATE TABLE half_done (x INTEGER); INSERT INTO missing_table VALUES (1);"),
        ];

        var error = Assert.Throws<MigrationException>(() => MigrationRunner.Apply(connection, migrations));

        Assert.Contains("0002_bad", error.Message, StringComparison.Ordinal);
        Assert.Equal(1, temp.Scalar<long>("PRAGMA user_version;"));
        Assert.Equal(0, temp.Scalar<long>("SELECT count(*) FROM sqlite_master WHERE name = 'half_done';"));
        Assert.Equal(1, temp.Scalar<long>("SELECT count(*) FROM sqlite_master WHERE name = 'good';"));
    }

    [Fact]
    public void A_gap_in_the_version_sequence_is_refused()
    {
        using var temp = new TempDatabase(initialize: false);
        using var connection = temp.Database.Open();
        Migration[] migrations = [new(1, "a", "SELECT 1;"), new(3, "c", "SELECT 1;")];

        Assert.Throws<MigrationException>(() => MigrationRunner.Apply(connection, migrations));
        Assert.Equal(0, temp.Scalar<long>("PRAGMA user_version;"));
    }

    [Fact]
    public void A_database_from_a_newer_app_is_refused()
    {
        using var temp = new TempDatabase(initialize: false);
        temp.Execute("PRAGMA user_version = 99;");
        using var connection = temp.Database.Open();

        var error = Assert.Throws<MigrationException>(
            () => MigrationRunner.Apply(connection, [new Migration(1, "a", "SELECT 1;")]));

        Assert.Contains("newer version", error.Message, StringComparison.Ordinal);
    }
}
