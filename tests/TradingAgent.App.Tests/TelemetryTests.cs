using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using Sentry.Extensibility;
using Sentry.Protocol;
using TradingAgent.App.Telemetry;
using TradingAgent.Core;
using TradingAgent.Core.Settings;
using TradingAgent.Data;
using Xunit;

namespace TradingAgent.App.Tests;

/// <summary>What may and may not leave the machine in a crash report.</summary>
public sealed class SentryScrubberTests
{
    // Low-entropy sample values, so secret scanners do not mistake fixtures for leaked credentials.
    private const string InstallId = "0123456789abcdef0123456789abcdef";
    private const string Key = "abcdabcdabcdab";

    [Fact]
    public void Event_keeps_only_an_installation_id_as_user_and_no_machine_name_or_time_zone()
    {
        var sentryEvent = new SentryEvent
        {
            ServerName = "ALICE-PC",
            User = new SentryUser { Id = "someone", Email = "alice@example.com", Username = "alice", IpAddress = "203.0.113.7" },
        };
        sentryEvent.Contexts.Device.Name = "ALICE-PC";
        sentryEvent.Contexts.Device.Timezone = TimeZoneInfo.Utc;

        var scrubbed = SentryScrubber.ScrubEvent(sentryEvent, InstallId);

        Assert.Null(scrubbed.ServerName);
        Assert.Null(scrubbed.Contexts.Device.Name);
        Assert.Null(scrubbed.Contexts.Device.Timezone);
        Assert.Equal(InstallId, scrubbed.User.Id);
        Assert.Null(scrubbed.User.Email);
        Assert.Null(scrubbed.User.Username);
        Assert.Null(scrubbed.User.IpAddress);
    }

    [Fact]
    public void Credentials_are_removed_from_the_message_and_from_exception_text()
    {
        var sentryEvent = new SentryEvent
        {
            Message = new SentryMessage { Message = "login failed: {0}", Formatted = $"login failed: api_key={Key}", Params = [Key] },
            SentryExceptions =
            [
                new SentryException { Type = "InvalidOperationException", Value = $"passphrase={Key} rejected" },
            ],
        };

        var scrubbed = SentryScrubber.ScrubEvent(sentryEvent, InstallId);

        Assert.DoesNotContain(Key, scrubbed.Message!.Formatted, StringComparison.Ordinal);
        Assert.Null(scrubbed.Message.Params);
        var exception = Assert.Single(scrubbed.SentryExceptions!);
        Assert.DoesNotContain(Key, exception.Value, StringComparison.Ordinal);
        Assert.Contains("passphrase=<redacted:14>", exception.Value, StringComparison.Ordinal);
    }

    [Fact]
    public void Loaded_modules_are_reported_by_file_name_without_their_folder()
    {
        var sentryEvent = new SentryEvent
        {
            DebugImages =
            [
                new DebugImage
                {
                    Type = "pe",
                    CodeFile = @"C:\Users\alice\AppData\Local\Fly.TradingAgent\current\TradingAgent.exe",
                    DebugFile = @"C:\Users\alice\AppData\Local\Fly.TradingAgent\current\TradingAgent.pdb",
                },
            ],
        };

        var image = Assert.Single(SentryScrubber.ScrubEvent(sentryEvent, InstallId).DebugImages!);

        Assert.Equal("TradingAgent.exe", image.CodeFile);
        Assert.Equal("TradingAgent.pdb", image.DebugFile);
    }

    [Fact]
    public void Request_loses_cookies_body_query_and_sensitive_headers()
    {
        var sentryEvent = new SentryEvent();
        sentryEvent.Request.Url = "https://www.okx.com/api/v5/orders?instId=BTC-USDT#top";
        sentryEvent.Request.QueryString = "instId=BTC-USDT";
        sentryEvent.Request.Cookies = "session=abc";
        sentryEvent.Request.Data = "{\"sz\":\"1\"}";
        sentryEvent.Request.Headers["Authorization"] = "Bearer abc";
        sentryEvent.Request.Headers["Cookie"] = "session=abc";
        sentryEvent.Request.Headers["Referer"] = "https://example.com/?email=a@b.c";
        sentryEvent.Request.Headers["Accept"] = "application/json";

        var request = SentryScrubber.ScrubEvent(sentryEvent, InstallId).Request;

        Assert.Equal("https://www.okx.com/api/v5/orders", request.Url);
        Assert.Null(request.QueryString);
        Assert.Null(request.Cookies);
        Assert.Null(request.Data);
        Assert.Equal(["Accept"], request.Headers.Keys);
    }

    [Fact]
    public void Breadcrumb_is_redacted_and_loses_query_strings()
    {
        var breadcrumb = new Breadcrumb(
            $"calling exchange with token={Key}",
            "http",
            new Dictionary<string, string>
            {
                ["url"] = "https://www.okx.com/api/v5/orders?instId=BTC-USDT",
                ["http.query"] = "instId=BTC-USDT",
                ["from"] = "/settings?email=a@b.c",
                ["status_code"] = "200",
            },
            "http");

        var scrubbed = SentryScrubber.ScrubBreadcrumb(breadcrumb);

        Assert.DoesNotContain(Key, scrubbed.Message, StringComparison.Ordinal);
        Assert.Equal("https://www.okx.com/api/v5/orders", scrubbed.Data!["url"]);
        Assert.Equal("/settings", scrubbed.Data["from"]);
        Assert.Equal("200", scrubbed.Data["status_code"]);
        Assert.False(scrubbed.Data.ContainsKey("http.query"));
        Assert.Equal("http", scrubbed.Category);
        Assert.Equal(BreadcrumbLevel.Info, scrubbed.Level);
    }

    [Fact]
    public void Transaction_spans_lose_query_strings_and_the_user_is_reduced_to_an_id()
    {
        var tracer = new TransactionTracer(DisabledHub.Instance, new TransactionContext("app.start", "app.lifecycle"));
        var span = tracer.StartChild("http.client", "GET https://www.okx.com/api/v5/orders?instId=BTC-USDT");
        span.SetData("url.full", "https://www.okx.com/api/v5/orders?instId=BTC-USDT#top");
        span.SetData("http.query", "instId=BTC-USDT");
        span.SetData("http.response.status_code", 200);
        span.Finish();
        tracer.User = new SentryUser { Id = "someone", Email = "alice@example.com" };
        var transaction = new SentryTransaction(tracer);

        var scrubbed = SentryScrubber.ScrubTransaction(transaction, InstallId);

        Assert.Equal(InstallId, scrubbed.User.Id);
        Assert.Null(scrubbed.User.Email);
        var child = Assert.Single(scrubbed.Spans);
        Assert.Equal("GET https://www.okx.com/api/v5/orders", child.Description);
        Assert.Equal("https://www.okx.com/api/v5/orders", child.Data["url.full"]);
        Assert.Null(child.Data["http.query"]);
        Assert.Equal(200, child.Data["http.response.status_code"]);
    }
}

/// <summary>When reporting is and is not active.</summary>
public sealed class TelemetryServiceTests : IDisposable
{
    // Port 9 ("discard") on this machine: nothing listens there, so nothing can actually be sent.
    private const string LocalDsn = "http://publickey@127.0.0.1:9/1";

    private readonly string _root = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));
    private readonly SqliteSettingsStore _settings;
    private readonly TelemetryGate _gate = new();
    private readonly AppInfo _info = new("1.2.3", IsDevelopmentBuild: true);

    public TelemetryServiceTests()
    {
        var paths = new AppPaths(_root, isDevelopmentBuild: true);
        paths.EnsureCreated();
        var database = new Database(paths.DatabaseFile);
        database.Initialize();
        _settings = new SqliteSettingsStore(database, TimeProvider.System, NullLogger<SqliteSettingsStore>.Instance);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
            // A leftover temp folder is harmless.
        }
    }

    [Fact]
    public void A_build_without_a_reporting_address_never_reports()
    {
        using var telemetry = new TelemetryService(_info, _settings, _gate, NullLogger<TelemetryService>.Instance, dsn: null);

        telemetry.Start();

        Assert.Equal(TelemetryState.NotConfigured, telemetry.State);
        Assert.False(telemetry.IsActive);
        Assert.False(_gate.IsOpen);
        Assert.False(telemetry.SendTestError());
        Assert.Equal(string.Empty, _settings.GetValue(SettingKeys.TelemetryInstallId));
    }

    [Fact]
    public void Reporting_follows_the_setting_immediately_and_uses_one_stable_installation_id()
    {
        using var telemetry = new TelemetryService(_info, _settings, _gate, NullLogger<TelemetryService>.Instance, LocalDsn);
        var changes = 0;
        telemetry.StateChanged += (_, _) => changes++;

        telemetry.Start(); // the setting defaults to on

        Assert.Equal(TelemetryState.On, telemetry.State);
        Assert.True(_gate.IsOpen);
        var installId = _settings.GetValue(SettingKeys.TelemetryInstallId);
        Assert.Equal(32, installId.Length);

        _settings.SetValue(SettingKeys.TelemetryEnabled, false);

        Assert.Equal(TelemetryState.Off, telemetry.State);
        Assert.False(_gate.IsOpen);
        Assert.False(telemetry.SendTestError());

        _settings.SetValue(SettingKeys.TelemetryEnabled, true);

        Assert.Equal(TelemetryState.On, telemetry.State);
        Assert.Equal(installId, _settings.GetValue(SettingKeys.TelemetryInstallId));
        Assert.Equal(3, changes);
    }

    [Fact]
    public void Switched_off_before_start_stays_off()
    {
        _settings.SetValue(SettingKeys.TelemetryEnabled, false);
        using var telemetry = new TelemetryService(_info, _settings, _gate, NullLogger<TelemetryService>.Instance, LocalDsn);

        telemetry.Start();

        Assert.Equal(TelemetryState.Off, telemetry.State);
        Assert.False(_gate.IsOpen);
        Assert.Equal(string.Empty, _settings.GetValue(SettingKeys.TelemetryInstallId));
    }
}
