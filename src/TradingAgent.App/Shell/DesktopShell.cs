using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform;
using Avalonia.Threading;
using Microsoft.Extensions.Logging;
using TradingAgent.App.Telemetry;
using TradingAgent.App.ViewModels;
using TradingAgent.App.Views;
using TradingAgent.Core;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;

namespace TradingAgent.App.Shell;

/// <summary>Owns the main window, the tray icon and the rules for showing, hiding and exiting.</summary>
/// <remarks>
/// The app keeps running in the tray after its window is closed, because scheduled tasks and order
/// monitoring must continue; only "Exit" in the tray menu, or the operating system shutting down, ends it.
/// A development build exits when its window closes, so a debugging session does not linger.
/// </remarks>
internal sealed partial class DesktopShell(
    Application application,
    IClassicDesktopStyleApplicationLifetime lifetime,
    AppInfo info,
    MainViewModel mainViewModel,
    ISettingsStore settings,
    IAutostart autostart,
    IToastNotifier toasts,
    IUpdateService updates,
    ShellRequests requests,
    TelemetryService telemetry,
    ILogger<DesktopShell> logger) : IDisposable
{
    private readonly WindowPlacementTracker _placement = new(settings);
    private MainWindow? _window;
    private TrayIcon? _tray;
    private NativeMenuItem? _restartToUpdate;
    private bool _exiting;

    public void Start(SingleInstanceGuard? instance)
    {
        // The window is not the lifetime's MainWindow: that one is shown unconditionally at start, and
        // closing it would end the app.
        lifetime.ShutdownMode = ShutdownMode.OnExplicitShutdown;

        _window = new MainWindow { DataContext = mainViewModel };
        _placement.Attach(_window);
        _window.Closing += OnWindowClosing;

        CreateTrayIcon();
        ReconcileAutostart();
        requests.RestartToUpdateRequested += (_, _) => RestartToUpdate();

        // Both events arrive on background threads.
        toasts.Activated += (_, _) => Dispatcher.UIThread.Post(ShowMainWindow);
        if (instance is not null)
        {
            instance.ActivationRequested += (_, _) => Dispatcher.UIThread.Post(ShowMainWindow);
        }

        if (settings.GetValue(SettingKeys.WindowStartOpen))
        {
            _window.Opened += (_, _) => telemetry.CompleteStartup();
            // Does nothing unless the command line asked for pictures of the pages.
            _window.Opened += (_, _) => _ = PageShots.RunAsync(_window, mainViewModel, Exit);
            _window.Show();
        }
        else
        {
            LogStartedHidden(logger);
            telemetry.CompleteStartup();
        }
    }

    public void ShowMainWindow()
    {
        if (_window is null || _exiting)
        {
            return;
        }

        _window.Show();
        if (_window.WindowState == WindowState.Minimized)
        {
            _window.WindowState = WindowState.Normal;
        }

        _window.Activate();

        // Windows may refuse to give focus to a process the user is not interacting with (it flashes the
        // taskbar button instead). Passing through "always on top" still puts the window above the
        // others, so a second launch or a clicked notification visibly brings it up.
        _window.Topmost = true;
        _window.Topmost = false;
    }

    public void Exit()
    {
        if (_exiting)
        {
            return;
        }

        _exiting = true;
        _placement.SaveNow();
        // A downloaded update installs now that the app is closing anyway.
        updates.ApplyOnExit(restart: false);
        if (_tray is not null)
        {
            // Otherwise the icon lingers in the tray until the pointer passes over it.
            _tray.IsVisible = false;
        }

        lifetime.Shutdown();
    }

    public void Dispose() => _tray?.Dispose();

    private void OnWindowClosing(object? sender, WindowClosingEventArgs e)
    {
        _placement.SaveNow();
        if (_exiting || e.CloseReason is WindowCloseReason.ApplicationShutdown or WindowCloseReason.OSShutdown)
        {
            return;
        }

        if (info.IsDevelopmentBuild)
        {
            // Let this close finish first; shutting down from inside the Closing event re-enters it.
            Dispatcher.UIThread.Post(Exit);
            return;
        }

        e.Cancel = true;
        _window?.Hide();
    }

    private void CreateTrayIcon()
    {
        var show = new NativeMenuItem("Show Window");
        show.Click += (_, _) => ShowMainWindow();
        var exit = new NativeMenuItem("Exit");
        exit.Click += (_, _) => Exit();

        // Appears only once a new version has been downloaded.
        _restartToUpdate = new NativeMenuItem("Restart to update") { IsVisible = false };
        _restartToUpdate.Click += (_, _) => RestartToUpdate();
        updates.StatusChanged += (_, _) => Dispatcher.UIThread.Post(ShowUpdateInTray);
        ShowUpdateInTray();

        using var icon = AssetLoader.Open(new Uri("avares://TradingAgent/Assets/icon.ico"));
        _tray = new TrayIcon
        {
            Icon = new WindowIcon(icon),
            ToolTipText = mainViewModel.WindowTitle,
            Menu = new NativeMenu { Items = { show, _restartToUpdate, new NativeMenuItemSeparator(), exit } },
        };
        _tray.Clicked += (_, _) => ShowMainWindow();
        TrayIcon.SetIcons(application, [_tray]);
    }

    private void ShowUpdateInTray()
    {
        if (_restartToUpdate is null)
        {
            return;
        }

        var status = updates.Status;
        _restartToUpdate.IsVisible = status.State == UpdateState.ReadyToInstall;
        _restartToUpdate.Header = $"Restart to update to {status.AvailableVersion}";
    }

    private void RestartToUpdate()
    {
        if (_exiting || !updates.ApplyOnExit(restart: true))
        {
            return;
        }

        _exiting = true;
        _placement.SaveNow();
        if (_tray is not null)
        {
            _tray.IsVisible = false;
        }

        lifetime.Shutdown();
    }

    /// <summary>
    /// Makes the start-up shortcut match the saved preference: recreates one that was deleted behind the
    /// app's back, and removes one that should not be there.
    /// </summary>
    private void ReconcileAutostart()
    {
        var wanted = settings.GetValue(SettingKeys.AutostartEnabled);
        try
        {
            if (wanted && !autostart.IsEnabled)
            {
                autostart.Enable();
            }
            else if (!wanted && autostart.IsEnabled)
            {
                autostart.Disable();
            }
        }
        catch (InvalidOperationException ex)
        {
            LogAutostartReconcileFailed(logger, ex);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Started in the tray; the window opens from the tray icon.")]
    private static partial void LogStartedHidden(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The start-up shortcut could not be brought in line with the setting.")]
    private static partial void LogAutostartReconcileFailed(ILogger logger, Exception exception);
}
