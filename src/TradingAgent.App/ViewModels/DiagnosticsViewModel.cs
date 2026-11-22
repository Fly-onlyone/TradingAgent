using System.Globalization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Core;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Data;

namespace TradingAgent.App.ViewModels;

/// <summary>Facts about the running build, and the place where each skeleton feature gets its test control.</summary>
public sealed partial class DiagnosticsViewModel : PageViewModel
{
    private readonly ISettingsStore _settings;
    private readonly IAutostart _autostart;
    private readonly IToastNotifier _toasts;

    /// <summary>True while a property is set from code, so its change handler does not act on it.</summary>
    private bool _synchronizing;

    public DiagnosticsViewModel(
        AppInfo info,
        AppPaths paths,
        Database database,
        ISettingsStore settings,
        IAutostart autostart,
        IToastNotifier toasts)
    {
        ArgumentNullException.ThrowIfNull(info);
        ArgumentNullException.ThrowIfNull(paths);
        ArgumentNullException.ThrowIfNull(database);
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(autostart);
        _settings = settings;
        _autostart = autostart;
        _toasts = toasts;

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
        StartWithWindows = autostart.IsEnabled;
        OpenWindowAtStart = settings.GetValue(SettingKeys.WindowStartOpen);
        _synchronizing = false;
    }

    public override string Title => "Diagnostics";

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
    private void SendTestNotification()
    {
        _toasts.Show(AppInfo.ProductName, "Test notification. Click it to bring the window to the front.");
        ShellStatus = "Notification sent.";
    }
}
