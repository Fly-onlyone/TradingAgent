using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.App.Telemetry;
using TradingAgent.Core;
using TradingAgent.Core.Settings;

namespace TradingAgent.App.ViewModels;

internal sealed partial class MainViewModel : ObservableObject
{
    private readonly ISettingsStore _settings;

    public MainViewModel(
        AppInfo info,
        IEnumerable<PageViewModel> pages,
        ISettingsStore settings,
        TelemetryService telemetry,
        AppNavigator? navigator = null)
    {
        ArgumentNullException.ThrowIfNull(info);
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(telemetry);
        _settings = settings;
        // Told once, and only when this build can report at all.
        ShowTelemetryNotice = telemetry.State != TelemetryState.NotConfigured
            && !settings.GetValue(SettingKeys.TelemetryNoticeDismissed);
        // The pages in the order of the rail, which is the order they are registered in.
        Pages = [.. pages];
        SelectedPage = Pages[0];
        if (navigator is not null)
        {
            navigator.ChatRequested += OpenChat;
        }
        WindowTitle = info.IsDevelopmentBuild ? $"{AppInfo.ProductName} (dev)" : AppInfo.ProductName;
        VersionLabel = $"v{info.Version}";
    }

    public IReadOnlyList<PageViewModel> Pages { get; }

    [ObservableProperty]
    public partial PageViewModel SelectedPage { get; set; }

    public string WindowTitle { get; }

    public string VersionLabel { get; }

    /// <summary>Shows the one-time line telling the user that crash reports are sent.</summary>
    [ObservableProperty]
    public partial bool ShowTelemetryNotice { get; set; }

    partial void OnSelectedPageChanged(PageViewModel oldValue, PageViewModel newValue)
    {
        // Null the first time, whatever the declared type says.
        (oldValue as PageViewModel)?.Deactivate();
        newValue.Activate();
    }

    private void OpenChat(string sessionId)
    {
        if (Pages.OfType<ChatViewModel>().FirstOrDefault() is { } chat)
        {
            SelectedPage = chat;
            chat.Open(sessionId);
        }
    }

    [RelayCommand]
    private void DismissTelemetryNotice()
    {
        _settings.SetValue(SettingKeys.TelemetryNoticeDismissed, true);
        ShowTelemetryNotice = false;
    }
}
