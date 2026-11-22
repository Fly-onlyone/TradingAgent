using Avalonia;

namespace TradingAgent.App;

internal static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        StartupProbe.Configure(args);
        return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    // Kept as a separate method: the IDE previewer looks it up by name.
    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<ShellApp>().UsePlatformDetect();
}
