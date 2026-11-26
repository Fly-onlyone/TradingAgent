using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Runs;
using TradingAgent.App.Controls;
using TradingAgent.App.Theme;
using TradingAgent.Core.Settings;

namespace TradingAgent.App.ViewModels;

/// <summary>When a line is drawn above a row of the sidebar.</summary>
internal enum NavLine
{
    Never,

    /// <summary>Only while the sidebar is folded, where the line stands for the group label.</summary>
    WhenFolded,

    Always,
}

/// <summary>Where a page stands in the sidebar: its icon, and the group it opens.</summary>
/// <param name="Page">The page the row opens.</param>
/// <param name="Icon">The key of its icon in <c>Theme/Tokens/Icons.axaml</c>, without the "Icon" prefix.</param>
/// <param name="Group">The label over the row when it is the first of a group; otherwise null.</param>
/// <param name="Line">When a line separates the row from the rows above.</param>
/// <param name="AtBottom">True for rows that sit at the bottom of the sidebar.</param>
internal sealed record NavItemViewModel(PageViewModel Page, string Icon, string? Group, NavLine Line, bool AtBottom)
{
    public string Title => Page.Title;

    /// <summary>The icon as a shape; null where no application is running, as in a test of the view model alone.</summary>
    public Geometry? Glyph =>
        Avalonia.Application.Current is { } app && app.TryFindResource("Icon" + Icon, out var found) ? found as Geometry : null;

    public bool HasGroup => Group is not null;

    public bool LineAlways => Line == NavLine.Always;

    public bool LineWhenFolded => Line == NavLine.WhenFolded;

    /// <summary>More room above the label of every group but the first.</summary>
    public bool IsLaterGroup => Group is not null && Line != NavLine.Never;
}

/// <summary>One preset in the theme selector.</summary>
internal sealed partial class ThemeChoiceViewModel(ThemePreset preset) : ObservableObject
{
    public ThemePreset Preset { get; } = preset;

    public string Label => Preset.Label;

    /// <summary>The preview bar: primary, secondary and accent colour of the preset.</summary>
    public IBrush Preview { get; } = new LinearGradientBrush
    {
        StartPoint = new Avalonia.RelativePoint(0, 0, Avalonia.RelativeUnit.Relative),
        EndPoint = new Avalonia.RelativePoint(1, 1, Avalonia.RelativeUnit.Relative),
        GradientStops =
        {
            new GradientStop(preset.Primary.Main, 0),
            new GradientStop(preset.Secondary.Main, 0.5),
            new GradientStop(preset.Accent.Main, 1),
        },
    }.ToImmutable();

    public IBrush Accent { get; } = new SolidColorBrush(preset.Primary.Main).ToImmutable();

    public IBrush Tint { get; } = new SolidColorBrush(ThemeBuilder.Alpha(preset.Primary.Main, 0.04)).ToImmutable();

    public IBrush ActiveTint { get; } = new SolidColorBrush(ThemeBuilder.Alpha(preset.Primary.Main, 0.12)).ToImmutable();

    [ObservableProperty]
    public partial bool IsActive { get; set; }
}

/// <summary>
/// What the header shows and does: the state of the trade kit and the agent, the theme selector and
/// the emergency stop.
/// </summary>
/// <remarks>
/// The emergency stop here is the same latch as on the Settings page
/// (<see cref="SettingKeys.EmergencyStopActive"/>). Pressing the button only opens a question; the
/// latch changes on the answer. Stopping and resuming both ask, because a slip of the pointer on a
/// header button must not change what the agent may do.
/// </remarks>
internal sealed partial class HeaderViewModel : ObservableObject
{
    private readonly AppearanceState _appearance;
    private readonly ISettingsStore _settings;
    private readonly AtkService? _kit;
    private readonly IAgentRuntimeResolver? _runtimes;
    private readonly Action<Action> _post;

    public HeaderViewModel(
        AppearanceState appearance,
        ISettingsStore settings,
        AtkService? kit = null,
        IAgentRuntimeResolver? runtimes = null,
        Action<Action>? post = null)
    {
        ArgumentNullException.ThrowIfNull(appearance);
        ArgumentNullException.ThrowIfNull(settings);
        _appearance = appearance;
        _settings = settings;
        _kit = kit;
        _runtimes = runtimes;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));

        Themes = [.. ThemePreset.All.Select(preset => new ThemeChoiceViewModel(preset))];
        MarkActiveTheme();
        IsEmergencyStopped = settings.GetValue(SettingKeys.EmergencyStopActive);
        // Both arrive on whatever thread made the change.
        settings.Changed += (_, change) => _post(() => OnSettingChanged(change.Key));
        if (kit is not null)
        {
            kit.StatusChanged += (_, _) => _post(RefreshStatus);
        }

        RefreshStatus();
    }

    public IReadOnlyList<ThemeChoiceViewModel> Themes { get; }

    [ObservableProperty]
    public partial DotStatus TradeKitStatus { get; set; }

    [ObservableProperty]
    public partial string TradeKitHint { get; set; } = string.Empty;

    [ObservableProperty]
    public partial DotStatus AgentStatus { get; set; }

    [ObservableProperty]
    public partial string AgentHint { get; set; } = string.Empty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsRunning))]
    public partial bool IsEmergencyStopped { get; set; }

    /// <summary>True while the question "stop everything?" is open.</summary>
    [ObservableProperty]
    public partial bool ConfirmingStop { get; set; }

    /// <summary>True while the question "resume?" is open.</summary>
    [ObservableProperty]
    public partial bool ConfirmingResume { get; set; }

    public bool IsRunning => !IsEmergencyStopped;

    /// <summary>Reads the states again; the window calls it when it comes to the front.</summary>
    public void RefreshStatus()
    {
        var kit = _kit?.Status;
        TradeKitStatus = kit?.State switch
        {
            AtkState.Running => DotStatus.Online,
            AtkState.Starting => DotStatus.Loading,
            AtkState.Failed => DotStatus.Busy,
            _ => DotStatus.Offline,
        };
        TradeKitHint = kit switch
        {
            null => "Trade kit: not started",
            { State: AtkState.Running, Sandbox: true } => "Trade kit: running, demo trading",
            { State: AtkState.Running } => "Trade kit: running, live trading",
            { Detail: { Length: > 0 } detail } => $"Trade kit: {detail}",
            _ => $"Trade kit: {kit.State.ToString().ToLowerInvariant()}",
        };

        var problem = _runtimes?.Resolve().Problem;
        AgentStatus = _runtimes is null ? DotStatus.Offline : problem is null ? DotStatus.Online : DotStatus.Busy;
        AgentHint = _runtimes is null ? "Agent: not started" : problem is null ? "Agent: ready" : $"Agent: {problem}";
    }

    [RelayCommand]
    private void ChooseTheme(ThemeChoiceViewModel? choice)
    {
        if (choice is not null)
        {
            _appearance.Preset = choice.Preset;
            MarkActiveTheme();
        }
    }

    [RelayCommand]
    private void AskEmergency()
    {
        ConfirmingStop = !IsEmergencyStopped;
        ConfirmingResume = IsEmergencyStopped;
    }

    [RelayCommand]
    private void CancelEmergency()
    {
        ConfirmingStop = false;
        ConfirmingResume = false;
    }

    [RelayCommand]
    private void ConfirmStop()
    {
        _settings.SetValue(SettingKeys.EmergencyStopActive, true);
        CancelEmergency();
    }

    [RelayCommand]
    private void ConfirmResume()
    {
        _settings.SetValue(SettingKeys.EmergencyStopActive, false);
        CancelEmergency();
    }

    private void OnSettingChanged(string key)
    {
        if (key == SettingKeys.EmergencyStopActive.Name)
        {
            IsEmergencyStopped = _settings.GetValue(SettingKeys.EmergencyStopActive);
        }
        else if (key == SettingKeys.UiTheme.Name)
        {
            MarkActiveTheme();
        }
        else if (key.StartsWith("agent.", StringComparison.Ordinal) || key.StartsWith("okx.", StringComparison.Ordinal))
        {
            RefreshStatus();
        }
    }

    private void MarkActiveTheme()
    {
        var active = _appearance.Preset;
        foreach (var theme in Themes)
        {
            theme.IsActive = ReferenceEquals(theme.Preset, active);
        }
    }
}
