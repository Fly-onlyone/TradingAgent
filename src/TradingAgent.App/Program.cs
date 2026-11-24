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
        // Bridge mode: Claude Code started this exe to reach the tools of the app that is already
        // running. Nothing of the app itself starts here: no window, no database, no second instance.
        if (StdioPipeBridge.IsRequested(args))
        {
            return StdioPipeBridge.Run(args[1]);
        }

        // Must run first. The installer and updater start this exe with special arguments to run their
        // install, update and uninstall steps; in that case this call does the work and exits the process.
        VelopackApp.Build().OnBeforeUninstallFastCallback(_ => RemoveSystemIntegration()).Run();

        // The component gallery is a look at the controls, not the app: it opens no database, starts no
        // service and may run beside the app.
        if (Views.GalleryWindow.IsRequested(args))
        {
            ShellApp.GalleryArguments = args;
            return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
        }

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
        Shell.PageShots.Configure(args);
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
        AppBuilder.Configure<ShellApp>()
            .UsePlatformDetect()
            // Menus, select lists and tooltips are drawn inside the window, as in the previous UI, not
            // in windows of their own: their shadows are not cut off and they can open with an animation.
            .With(new Win32PlatformOptions
            {
                OverlayPopups = true,
                // DirectComposition first: with it a presented frame costs about half the processor
                // time it costs with the default (WinUI composition), measured on a 143 Hz display with
                // the gradient lines and the background moving. The default adds window acrylic and
                // rendering at the display's rate, and the app uses neither.
                CompositionMode =
                [
                    Win32CompositionMode.DirectComposition,
                    Win32CompositionMode.WinUIComposition,
                    Win32CompositionMode.RedirectionSurface,
                ],
            });
}
