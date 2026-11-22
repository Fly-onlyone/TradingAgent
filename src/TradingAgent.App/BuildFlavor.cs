namespace TradingAgent.App;

internal static class BuildFlavor
{
    /// <summary>
    /// True for Debug builds. They keep separate data, a separate single-instance lock and a separate
    /// notification identity, and they exit when the window closes instead of hiding to the tray.
    /// </summary>
#if DEBUG
    public const bool IsDevelopment = true;
#else
    public const bool IsDevelopment = false;
#endif
}
