using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.App.Telemetry;
using TradingAgent.App.Theme;
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
        AppearanceState appearance,
        HeaderViewModel header,
        AppNavigator? navigator = null)
    {
        ArgumentNullException.ThrowIfNull(info);
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(telemetry);
        ArgumentNullException.ThrowIfNull(appearance);
        ArgumentNullException.ThrowIfNull(header);
        _settings = settings;
        Appearance = appearance;
        Header = header;
        // Told once, and only when this build can report at all.
        ShowTelemetryNotice = telemetry.State != TelemetryState.NotConfigured
            && !settings.GetValue(SettingKeys.TelemetryNoticeDismissed);
        // The pages in the order they are registered in. Chat is first: it is what the app opens on.
        Pages = [.. pages];
        NavItems = Arrange(Pages);
        SelectedPage = Pages[0];
        if (navigator is not null)
        {
            navigator.ChatRequested += OpenChat;
        }
        WindowTitle = info.IsDevelopmentBuild ? $"{AppInfo.ProductName} (dev)" : AppInfo.ProductName;
        VersionLabel = $"v{info.Version}";

        IsSidebarPinned = appearance.SidebarPinned;
        EffectsEnabled = appearance.EffectsEnabled;
        ReducedMotion = appearance.ReducedMotion;
        appearance.Changed += (_, _) =>
        {
            IsSidebarPinned = appearance.SidebarPinned;
            EffectsEnabled = appearance.EffectsEnabled;
            ReducedMotion = appearance.ReducedMotion;
        };
    }

    public IReadOnlyList<PageViewModel> Pages { get; }

    /// <summary>The pages as the sidebar shows them: in groups, Settings at the bottom.</summary>
    public IReadOnlyList<NavItemViewModel> NavItems { get; }

    public AppearanceState Appearance { get; }

    public HeaderViewModel Header { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SelectedNavItem))]
    public partial PageViewModel SelectedPage { get; set; }

    /// <summary>The sidebar row of the page that is open.</summary>
    public NavItemViewModel? SelectedNavItem
    {
        get => NavItems.FirstOrDefault(item => ReferenceEquals(item.Page, SelectedPage));
        set
        {
            // A list clears its choice while it rebuilds its rows; the open page stays open.
            if (value is not null)
            {
                SelectedPage = value.Page;
            }
        }
    }

    public string WindowTitle { get; }

    public string VersionLabel { get; }

    /// <summary>Shows the one-time line telling the user that crash reports are sent.</summary>
    [ObservableProperty]
    public partial bool ShowTelemetryNotice { get; set; }

    /// <summary>True keeps the sidebar open; false folds it to its icons.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsSidebarExpanded))]
    public partial bool IsSidebarPinned { get; set; }

    /// <summary>True while the pointer is over the sidebar: a folded sidebar opens for that long.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsSidebarExpanded))]
    public partial bool IsSidebarHovered { get; set; }

    public bool IsSidebarExpanded => IsSidebarPinned || IsSidebarHovered;

    /// <summary>False switches the moving background and the blur of the glass off.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowEffects))]
    public partial bool EffectsEnabled { get; set; }

    /// <summary>True switches every animation off.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowEffects))]
    public partial bool ReducedMotion { get; set; }

    /// <summary>The moving background shows only while effects are on and motion is not reduced, as in the previous UI.</summary>
    public bool ShowEffects => EffectsEnabled && !ReducedMotion;

    /// <summary>
    /// The places of the pages in the sidebar, in the groups of the previous UI. A page nobody gave
    /// a place still gets a row, in the last group, so it can always be reached.
    /// </summary>
    private static NavItemViewModel[] Arrange(IReadOnlyList<PageViewModel> pages)
    {
        (string Group, (Type Page, string Icon)[] Rows)[] layout =
        [
            ("CORE", [(typeof(ChatViewModel), "SmartToy"), (typeof(DashboardViewModel), "Dashboard")]),
            ("MONITOR", [(typeof(TradingViewModel), "Monitor"), (typeof(OrdersViewModel), "ListAlt"), (typeof(TradesViewModel), "ReceiptLong")]),
            ("INTELLIGENCE", [(typeof(StrategiesViewModel), "AccountBalance"), (typeof(KnowledgeViewModel), "LibraryBooks"), (typeof(MemoryViewModel), "Psychology"), (typeof(NewsViewModel), "Newspaper")]),
            ("SYSTEM", [(typeof(TasksViewModel), "Schedule"), (typeof(DiagnosticsViewModel), "BugReport")]),
            ("ADMIN", [(typeof(AdminViewModel), "Storage")]),
        ];

        var items = new List<NavItemViewModel>();
        var placed = new HashSet<PageViewModel>();
        var settings = pages.FirstOrDefault(page => page is SettingsViewModel);
        var extra = pages.Where(page => !ReferenceEquals(page, settings) && !layout.Any(group => group.Rows.Any(row => row.Page == page.GetType()))).ToList();
        foreach (var (group, rows) in layout)
        {
            // The admin rows sit at the bottom, above Settings, with a line over them.
            var admin = group == "ADMIN";
            if (admin)
            {
                items.AddRange(extra.Select(page => new NavItemViewModel(page, "Article", null, NavLine.Never, AtBottom: false)));
            }

            var first = true;
            foreach (var (type, icon) in rows)
            {
                if (pages.FirstOrDefault(page => page.GetType() == type) is { } page && placed.Add(page))
                {
                    var line = !first || items.Count == 0 ? NavLine.Never : admin ? NavLine.Always : NavLine.WhenFolded;
                    items.Add(new NavItemViewModel(page, icon, first ? group : null, line, AtBottom: admin));
                    first = false;
                }
            }
        }

        if (settings is not null)
        {
            items.Add(new NavItemViewModel(settings, "Settings", null, NavLine.Always, AtBottom: true));
        }

        return [.. items];
    }

    partial void OnSelectedPageChanged(PageViewModel oldValue, PageViewModel newValue)
    {
        // Null the first time, whatever the declared type says.
        (oldValue as PageViewModel)?.Deactivate();
        newValue.Activate();
    }

    partial void OnIsSidebarPinnedChanged(bool value) => Appearance.SidebarPinned = value;

    partial void OnEffectsEnabledChanged(bool value) => Appearance.EffectsEnabled = value;

    partial void OnReducedMotionChanged(bool value) => Appearance.ReducedMotion = value;

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

    [RelayCommand]
    private void ToggleSidebar() => IsSidebarPinned = !IsSidebarPinned;

    [RelayCommand]
    private void OpenDashboard()
    {
        if (Pages.OfType<DashboardViewModel>().FirstOrDefault() is { } dashboard)
        {
            SelectedPage = dashboard;
        }
    }
}
