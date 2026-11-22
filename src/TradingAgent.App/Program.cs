using Avalonia;
using TradingAgent.Core;
using TradingAgent.Core.Shell;
using TradingAgent.Platform.Windows;
using Velopack;

namespace TradingAgent.App;

internal static class Program
{
    private static readonly TimeSpan _activationTimeout = TimeSpan.FromSeconds(2);

    [STAThread]
    public static int Main(string[] args)
    {
        // Must run first. The installer and updater start this exe with special arguments to run their
        // install, update and uninstall steps; in that case this call does the work and exits the process.
        VelopackApp.Build().OnBeforeUninstallFastCallback(_ => RemoveSystemIntegration()).Run();

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

    /// <summary>
    /// Runs inside the uninstaller. Removes what the app added outside its install folder: the start-up
    /// shortcut, which would otherwise point at a program that no longer exists, and the notification
    /// identity. The data folder is left alone on purpose.
    /// </summary>
    private static void RemoveSystemIntegration()
    {
        try
        {
            File.Delete(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Startup),
                ShellApp.AutostartShortcutName(BuildFlavor.IsDevelopment) + ".lnk"));
            AppUserModel.Unregister(AppInfo.ApplicationIdFor(BuildFlavor.IsDevelopment));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            // The uninstaller gives this hook very little time and no way to report; leftovers are harmless.
        }
    }

    // Kept as a separate method: the IDE previewer looks it up by name.
    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<ShellApp>().UsePlatformDetect();
}
