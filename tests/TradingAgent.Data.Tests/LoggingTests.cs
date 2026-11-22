using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Data.Logging;
using Xunit;

namespace TradingAgent.Data.Tests;

public sealed class LoggingTests
{
    private const long Now = 1_790_000_000_000;
    private const long Day = 24L * 60 * 60 * 1000;

    private static readonly ManualTimeProvider _time = new(DateTimeOffset.FromUnixTimeMilliseconds(Now));

    [Fact]
    public void Database_sink_stores_warnings_and_errors_but_not_information()
    {
        using var temp = new TempDatabase();
        var repository = new LogRepository(temp.Database);
        using (var provider = new SqliteLoggerProvider(repository, _time))
        {
            var logger = provider.CreateLogger("Orders");
            logger.LogInformation("polling");
            logger.LogWarning("slow response");
            logger.LogError(new InvalidOperationException("boom"), "placement failed");
        } // Dispose writes what is queued.

        Assert.Equal(2, repository.Count());
        Assert.Equal("slow response", temp.Scalar<string>("SELECT message FROM logs WHERE level = 'warning';"));
        Assert.Equal("Orders", temp.Scalar<string>("SELECT logger FROM logs WHERE level = 'error';"));
        Assert.Equal(Now, temp.Scalar<long>("SELECT ts FROM logs WHERE level = 'error';"));
        Assert.Contains("boom", temp.Scalar<string>("SELECT exception FROM logs WHERE level = 'error';"), StringComparison.Ordinal);
    }

    [Fact]
    public void Credentials_are_redacted_before_they_reach_a_sink()
    {
        using var temp = new TempDatabase();
        using (var provider = new SqliteLoggerProvider(new LogRepository(temp.Database), _time))
        {
            provider.CreateLogger("Atk").LogError(
                new InvalidOperationException("passphrase=abcdabcdabcdab rejected"),
                "child process said: {Line}",
                "api_key=\"abcdabcdabcdab\" loading");
        }

        var message = temp.Scalar<string>("SELECT message FROM logs;");
        var exception = temp.Scalar<string>("SELECT exception FROM logs;");
        Assert.Contains("api_key=<redacted:14>", message, StringComparison.Ordinal);
        Assert.DoesNotContain("abcdabcdabcdab", message, StringComparison.Ordinal);
        Assert.DoesNotContain("abcdabcdabcdab", exception, StringComparison.Ordinal);
    }

    [Fact]
    public void File_sink_writes_one_json_object_per_line()
    {
        using var temp = new TempDatabase(initialize: false);
        string file;
        using (var provider = new JsonLinesFileLoggerProvider(temp.Folder, _time))
        {
            file = provider.CurrentFile;
            var logger = provider.CreateLogger("Shell");
            logger.LogDebug("too detailed for the file");
            logger.LogInformation("Started version {Version}", "1.2.3");
            logger.LogError(new InvalidOperationException("boom"), "failed");
        }

        var lines = File.ReadAllLines(file);
        Assert.Equal(2, lines.Length);
        using var first = JsonDocument.Parse(lines[0]);
        Assert.Equal("2026-09-21T14:13:20.000Z", first.RootElement.GetProperty("timestamp").GetString());
        Assert.Equal("information", first.RootElement.GetProperty("level").GetString());
        Assert.Equal("Shell", first.RootElement.GetProperty("logger").GetString());
        Assert.Equal("Started version 1.2.3", first.RootElement.GetProperty("message").GetString());
        Assert.False(first.RootElement.TryGetProperty("exception", out _));
        using var second = JsonDocument.Parse(lines[1]);
        Assert.Contains("boom", second.RootElement.GetProperty("exception").GetString(), StringComparison.Ordinal);
    }

    [Fact]
    public void File_sink_rotates_when_the_file_is_too_large_and_drops_the_oldest()
    {
        using var temp = new TempDatabase(initialize: false);

        // Each run writes one line; with a one-byte limit every later run rotates first.
        for (var run = 1; run <= 4; run++)
        {
            using var provider = new JsonLinesFileLoggerProvider(temp.Folder, _time, maxFileBytes: 1, maxRotatedFiles: 2);
            provider.CreateLogger("Shell").LogInformation("run {Run}", run);
        }

        Assert.Contains("run 4", File.ReadAllText(Path.Combine(temp.Folder, "app.jsonl")), StringComparison.Ordinal);
        Assert.Contains("run 3", File.ReadAllText(Path.Combine(temp.Folder, "app.1.jsonl")), StringComparison.Ordinal);
        Assert.Contains("run 2", File.ReadAllText(Path.Combine(temp.Folder, "app.2.jsonl")), StringComparison.Ordinal);
        Assert.False(File.Exists(Path.Combine(temp.Folder, "app.3.jsonl")));
    }

    [Fact]
    public void A_sink_that_fails_does_not_throw_into_the_caller()
    {
        using var temp = new TempDatabase(initialize: false); // no logs table: every write fails

        using (var provider = new SqliteLoggerProvider(new LogRepository(temp.Database), _time))
        {
            provider.CreateLogger("Shell").LogError("nowhere to go");
        }
    }

    [Fact]
    public void Retention_removes_only_entries_older_than_thirty_days()
    {
        using var temp = new TempDatabase();
        var repository = new LogRepository(temp.Database);
        repository.InsertBatch(
        [
            new LogEntry(Now - (31 * Day), LogLevel.Warning, "Old", "expired", null),
            new LogEntry(Now - (29 * Day), LogLevel.Warning, "Recent", "kept", null),
            new LogEntry(Now, LogLevel.Error, "New", "kept", null),
        ]);
        using var retention = new RetentionService(repository, _time, NullLogger<RetentionService>.Instance);

        var removed = retention.RunOnce();

        Assert.Equal(1, removed);
        Assert.Equal(2, repository.Count());
        Assert.Equal(0, temp.Scalar<long>("SELECT count(*) FROM logs WHERE logger = 'Old';"));
    }
}
