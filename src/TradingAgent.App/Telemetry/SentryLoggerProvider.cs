using Microsoft.Extensions.Logging;
using Sentry;
using TradingAgent.Core.Logging;

namespace TradingAgent.App.Telemetry;

/// <summary>Feeds the app's log lines to Sentry while reporting is on.</summary>
/// <remarks>
/// Each line becomes a breadcrumb (context attached to a later error) and a Sentry log record; a line at
/// Error or above also becomes an issue. Text is redacted here, before it reaches the SDK.
/// The owner chose to include Information-level lines; the privacy default would start at Warning.
/// </remarks>
[ProviderAlias("Sentry")]
internal sealed class SentryLoggerProvider(TelemetryGate gate) : ILoggerProvider
{
    public ILogger CreateLogger(string categoryName) => new SentryLogger(gate, categoryName);

    public void Dispose()
    {
        // Nothing to release: the SDK is owned by TelemetryService.
    }

    private sealed class SentryLogger(TelemetryGate gate, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) =>
            gate.IsOpen && logLevel >= LogLevel.Information && logLevel != LogLevel.None;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            ArgumentNullException.ThrowIfNull(formatter);
            if (!IsEnabled(logLevel))
            {
                return;
            }

            var message = Redactor.Redact(formatter(state, exception));

            // "{0}": the message is data, not a format string; it may itself contain braces.
            switch (logLevel)
            {
                case LogLevel.Information:
                    SentrySdk.Logger.LogInfo("{0}", message);
                    break;
                case LogLevel.Warning:
                    SentrySdk.Logger.LogWarning("{0}", message);
                    break;
                default:
                    SentrySdk.Logger.LogError("{0}", message);
                    break;
            }

            if (logLevel >= LogLevel.Error)
            {
                var sentryEvent = exception is null ? new SentryEvent() : new SentryEvent(exception);
                sentryEvent.Message = new SentryMessage { Message = message };
                sentryEvent.Logger = category;
                sentryEvent.Level = logLevel == LogLevel.Critical ? SentryLevel.Fatal : SentryLevel.Error;
                SentrySdk.CaptureEvent(sentryEvent);
            }
            else
            {
                SentrySdk.AddBreadcrumb(
                    message,
                    category,
                    level: logLevel == LogLevel.Warning ? BreadcrumbLevel.Warning : BreadcrumbLevel.Info);
            }
        }
    }
}
