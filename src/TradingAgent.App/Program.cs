using Avalonia;
using TradingAgent.Core;
using TradingAgent.Core.Shell;
using TradingAgent.Platform.Windows;

namespace TradingAgent.App;

internal static class Program
{
    private static readonly TimeSpan _activationTimeout = TimeSpan.FromSeconds(2);

    [STAThread]
    public static int Main(string[] args)
    {
        var applicationId = AppInfo.ApplicationIdFor(BuildFlavor.IsDevelopment);

        using var instance = new SingleInstanceGuard(applicationId);
        if (!instance.TryAcquire())
        {
            // Another copy runs. Hand it the right to come to the front, wake it, and leave.
            AppUserModel.AllowAnyProcessToTakeForeground();
            SingleInstanceGuard.SignalFirstInstance(applicationId, _activationTimeout);
            return 0;
        }

        StartupProbe.Configure(args);
        ShellApp.Instance = instance;
        return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    // Kept as a separate method: the IDE previewer looks it up by name.
    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<ShellApp>().UsePlatformDetect();
}
