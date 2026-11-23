namespace TradingAgent.App.Telemetry;

/// <summary>Says whether data may be sent to Sentry right now.</summary>
/// <remarks>
/// A separate object with no dependencies: the log sink that feeds Sentry is created before the settings
/// store exists (the settings store itself logs), so it cannot depend on <see cref="TelemetryService"/>.
/// </remarks>
internal sealed class TelemetryGate
{
    private volatile bool _isOpen;

    public bool IsOpen
    {
        get => _isOpen;
        set => _isOpen = value;
    }
}
