using System.Globalization;
using System.Reflection;
using Microsoft.Extensions.Logging;
using Sentry;
using TradingAgent.Core;
using TradingAgent.Core.Settings;

namespace TradingAgent.App.Telemetry;

internal enum TelemetryState
{
    /// <summary>This build carries no Sentry address; nothing can be sent.</summary>
    NotConfigured,

    /// <summary>Switched off in the app.</summary>
    Off,
    On,
}

/// <summary>Starts and stops crash and performance reporting to Sentry.</summary>
/// <remarks>
/// Reporting runs only when both hold: the build carries a Sentry address (DSN), and the
/// "telemetry.enabled" setting is on. Flipping the setting takes effect immediately.
/// The DSN is stamped into the assembly at build time from the SENTRY_DSN environment variable; a
/// development run can also supply it through the same variable at run time.
/// </remarks>
internal sealed partial class TelemetryService : IDisposable
{
    private const string DsnMetadataKey = "SentryDsn";
    private const double DefaultSampleRate = 0.1;

    private readonly AppInfo _info;
    private readonly ISettingsStore _settings;
    private readonly TelemetryGate _gate;
    private readonly ILogger<TelemetryService> _logger;
    private readonly string? _dsn;
    private readonly Lock _sync = new();
    private IDisposable? _sdk;
    private ITransactionTracer? _startup;

    public TelemetryService(AppInfo info, ISettingsStore settings, TelemetryGate gate, ILogger<TelemetryService> logger)
        : this(info, settings, gate, logger, ResolveDsn())
    {
    }

    /// <summary>For tests: takes the Sentry address instead of reading it from the build or the environment.</summary>
    internal TelemetryService(AppInfo info, ISettingsStore settings, TelemetryGate gate, ILogger<TelemetryService> logger, string? dsn)
    {
        _info = info;
        _settings = settings;
        _gate = gate;
        _logger = logger;
        _dsn = dsn;
        State = _dsn is null ? TelemetryState.NotConfigured : TelemetryState.Off;
        settings.Changed += OnSettingChanged;
    }

    public event EventHandler? StateChanged;

    public TelemetryState State { get; private set; }

    /// <summary>True while events are being sent. Read on every log call, so it must stay cheap.</summary>
    public bool IsActive => State == TelemetryState.On;

    /// <summary>Applies the saved setting. Call once at start.</summary>
    public void Start() => Apply();

    /// <summary>Begins the "app start" performance trace; <see cref="CompleteStartup"/> ends it.</summary>
    public void BeginStartup()
    {
        if (IsActive)
        {
            _startup = SentrySdk.StartTransaction("app.start", "app.lifecycle");
        }
    }

    public void CompleteStartup()
    {
        _startup?.Finish();
        _startup = null;
    }

    /// <summary>Sends a harmless error, to check that reporting reaches Sentry. Returns false when reporting is off.</summary>
    public bool SendTestError()
    {
        if (!IsActive)
        {
            return false;
        }

        // A log line first, so the report shows a breadcrumb; then a thrown exception, so it has a stack trace.
        LogTestRequested(_logger);
        try
        {
            throw new InvalidOperationException("Diagnostics test error: reporting works.");
        }
        catch (InvalidOperationException ex)
        {
            SentrySdk.CaptureException(ex);
        }

        return true;
    }

    public void Dispose()
    {
        _settings.Changed -= OnSettingChanged;
        lock (_sync)
        {
            _gate.IsOpen = false;
            _sdk?.Dispose();
            _sdk = null;
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "A test error was requested from the Diagnostics page.")]
    private static partial void LogTestRequested(ILogger logger);

    private static string? ResolveDsn()
    {
        foreach (var attribute in typeof(TelemetryService).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>())
        {
            if (attribute.Key == DsnMetadataKey && !string.IsNullOrWhiteSpace(attribute.Value))
            {
                return attribute.Value;
            }
        }

        var fromEnvironment = Environment.GetEnvironmentVariable("SENTRY_DSN");
        return string.IsNullOrWhiteSpace(fromEnvironment) ? null : fromEnvironment;
    }

    private static double SampleRate(string variable)
    {
        var text = Environment.GetEnvironmentVariable(variable);
        return double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var rate) && rate is >= 0 and <= 1
            ? rate
            : DefaultSampleRate;
    }

    private void OnSettingChanged(object? sender, SettingChangedEventArgs e)
    {
        if (e.Key == SettingKeys.TelemetryEnabled.Name)
        {
            Apply();
        }
    }

    private void Apply()
    {
        if (_dsn is null)
        {
            return;
        }

        lock (_sync)
        {
            var wanted = _settings.GetValue(SettingKeys.TelemetryEnabled);
            if (wanted && _sdk is null)
            {
                _sdk = Initialize(_dsn);
                State = TelemetryState.On;
                _gate.IsOpen = true;
            }
            else if (!wanted && _sdk is not null)
            {
                _gate.IsOpen = false;
                // Disposing flushes what is queued and disables the SDK.
                _sdk.Dispose();
                _sdk = null;
                _startup = null;
                State = TelemetryState.Off;
            }
            else
            {
                return;
            }
        }

        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    private IDisposable Initialize(string dsn)
    {
        var installId = _settings.GetValue(SettingKeys.TelemetryInstallId);
        if (installId.Length == 0)
        {
            installId = Guid.NewGuid().ToString("N");
            _settings.SetValue(SettingKeys.TelemetryInstallId, installId);
        }

        return SentrySdk.Init(options =>
        {
            options.Dsn = dsn;
            options.Release = $"trading-agent@{_info.Version}";
            options.Environment = Environment.GetEnvironmentVariable("SENTRY_ENVIRONMENT")
                ?? (_info.IsDevelopmentBuild ? "development" : "production");

            // A desktop app has one user and one scope for the whole process.
            options.IsGlobalModeEnabled = true;

            // Privacy defaults, off on purpose. Do not turn these on without the owner's say-so.
            options.SendDefaultPii = false; // no machine name, user name or IP address
            options.ServerName = null;
            options.CaptureFailedRequests = false; // would attach request URLs and headers of failed HTTP calls

            // The owner chose to send performance traces, for one start in ten.
            options.TracesSampleRate = SampleRate("SENTRY_TRACES_SAMPLE_RATE");

            // Profiling: the owner asked for it, but it cannot be built in. Sentry.Profiling 7.0.1 depends on
            // Microsoft.Diagnostics.Tracing.TraceEvent, which fails Native AOT analysis (IL2104, IL3053).
            // Revisit when the package supports Native AOT.

            // The owner chose to send log lines as Sentry Logs, and Information-level breadcrumbs.
            // Both are produced by SentryLoggerProvider, which redacts them first.

            // One scrubber for everything that leaves the machine.
            options.SetBeforeSend((sentryEvent, _) => SentryScrubber.ScrubEvent(sentryEvent, installId));
            options.SetBeforeSendTransaction((transaction, _) => SentryScrubber.ScrubTransaction(transaction, installId));
            options.SetBeforeBreadcrumb((breadcrumb, _) => SentryScrubber.ScrubBreadcrumb(breadcrumb));
        });
    }
}
