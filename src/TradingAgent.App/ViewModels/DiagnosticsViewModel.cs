using System.Globalization;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.App.Shell;
using TradingAgent.App.Telemetry;
using TradingAgent.Core;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Data;

namespace TradingAgent.App.ViewModels;

/// <summary>Facts about the running build, and the place where each skeleton feature gets its test control.</summary>
internal sealed partial class DiagnosticsViewModel : PageViewModel
{
    private readonly ISettingsStore _settings;
    private readonly IAutostart _autostart;
    private readonly IToastNotifier _toasts;
    private readonly IUpdateService _updates;
    private readonly ShellRequests _shell;
    private readonly TelemetryService _telemetry;

    /// <summary>True while a property is set from code, so its change handler does not act on it.</summary>
    private bool _synchronizing;

    public DiagnosticsViewModel(
        AppInfo info,
        AppPaths paths,
        Database database,
        ISettingsStore settings,
        IAutostart autostart,
        IToastNotifier toasts,
        IUpdateService updates,
        ShellRequests shell,
        TelemetryService telemetry,
        AgentCardViewModel? agent = null)
    {
        ArgumentNullException.ThrowIfNull(info);
        ArgumentNullException.ThrowIfNull(paths);
        ArgumentNullException.ThrowIfNull(database);
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(autostart);
        ArgumentNullException.ThrowIfNull(updates);
        _settings = settings;
        _autostart = autostart;
        _toasts = toasts;
        _updates = updates;
        _shell = shell;
        _telemetry = telemetry;
        Agent = agent;
        ShowUpdateStatus();
        // Raised on a background thread.
        updates.StatusChanged += (_, _) => Dispatcher.UIThread.Post(ShowUpdateStatus);

        Version = info.Version;
        Build = info.IsNativeAot ? $"{info.BuildMode}, Native AOT" : $"{info.BuildMode}, JIT";
        Runtime = info.Runtime;
        DataFolder = paths.DataDirectory;
        DatabaseFile = paths.DatabaseFile;
        Schema = string.Create(
            CultureInfo.InvariantCulture,
            $"version {database.SchemaVersion}, SQLite {database.SqliteVersion}");
        LogFolder = paths.LogDirectory;

        _synchronizing = true;
        ReportingEnabled = settings.GetValue(SettingKeys.TelemetryEnabled);
        StartWithWindows = autostart.IsEnabled;
        OpenWindowAtStart = settings.GetValue(SettingKeys.WindowStartOpen);
        _synchronizing = false;

        ShowReportingStatus();
        telemetry.StateChanged += (_, _) => Dispatcher.UIThread.Post(ShowReportingStatus);
    }

    public override string Title => "Diagnostics";

    /// <summary>The "Agent" card; null where the page is built without the agent (some tests).</summary>
    public AgentCardViewModel? Agent { get; }

    public string Version { get; }

    public string Build { get; }

    public string Runtime { get; }

    public string DataFolder { get; }

    public string DatabaseFile { get; }

    public string Schema { get; }

    public string LogFolder { get; }

    [ObservableProperty]
    public partial bool StartWithWindows { get; set; }

    [ObservableProperty]
    public partial bool OpenWindowAtStart { get; set; }

    /// <summary>Outcome of the last shell action, shown under the controls.</summary>
    [ObservableProperty]
    public partial string ShellStatus { get; set; } = string.Empty;

    /// <summary>What the updater last reported.</summary>
    [ObservableProperty]
    public partial string UpdateStatus { get; set; } = string.Empty;

    /// <summary>A new version is downloaded and waits for the app to exit.</summary>
    [ObservableProperty]
    public partial bool IsUpdateReady { get; set; }

    /// <summary>The user's choice. Whether reports actually go out also depends on the build; see <see cref="ReportingStatus"/>.</summary>
    [ObservableProperty]
    public partial bool ReportingEnabled { get; set; }

    [ObservableProperty]
    public partial string ReportingStatus { get; set; } = string.Empty;

    partial void OnReportingEnabledChanged(bool value)
    {
        if (!_synchronizing)
        {
            // TelemetryService listens to this setting and starts or stops reporting at once.
            _settings.SetValue(SettingKeys.TelemetryEnabled, value);
        }
    }

    partial void OnStartWithWindowsChanged(bool value)
    {
        if (_synchronizing)
        {
            return;
        }

        try
        {
            if (value)
            {
                _autostart.Enable();
            }
            else
            {
                _autostart.Disable();
            }

            _settings.SetValue(SettingKeys.AutostartEnabled, value);
            ShellStatus = value ? "Starts when you sign in to Windows." : "Does not start with Windows.";
        }
        catch (InvalidOperationException ex)
        {
            ShellStatus = ex.Message;
            _synchronizing = true;
            StartWithWindows = _autostart.IsEnabled;
            _synchronizing = false;
        }
    }

    partial void OnOpenWindowAtStartChanged(bool value)
    {
        if (_synchronizing)
        {
            return;
        }

        _settings.SetValue(SettingKeys.WindowStartOpen, value);
        ShellStatus = value ? "The window opens at start." : "Starts in the tray, without a window.";
    }

    [RelayCommand]
    private Task CheckForUpdatesAsync() => _updates.CheckAsync();

    [RelayCommand]
    private void RestartToUpdate() => _shell.RequestRestartToUpdate();

    private void ShowUpdateStatus()
    {
        var status = _updates.Status;
        UpdateStatus = status.Message;
        IsUpdateReady = status.State == UpdateState.ReadyToInstall;
    }

    [RelayCommand]
    private void SendTestError()
    {
        ReportingStatus = _telemetry.SendTestError()
            ? "Test error sent. It appears in Sentry within a minute."
            : "Nothing was sent: reporting is not active.";
    }

    private void ShowReportingStatus() => ReportingStatus = _telemetry.State switch
    {
        TelemetryState.On => "Crash and performance reports are being sent.",
        TelemetryState.Off => "Reporting is switched off. Nothing is sent.",
        _ => "This build has no reporting address. Nothing is sent.",
    };

    [RelayCommand]
    private void SendTestNotification()
    {
        _toasts.Show(AppInfo.ProductName, "Test notification. Click it to bring the window to the front.");
        ShellStatus = "Notification sent.";
    }
}
