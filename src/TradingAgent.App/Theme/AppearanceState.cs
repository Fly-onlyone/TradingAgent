using TradingAgent.Core.Settings;

namespace TradingAgent.App.Theme;

/// <summary>
/// The choices about the look of the app: which preset, whether the background moves, whether
/// anything animates, whether the sidebar stays open. Saved as settings; one object so the header,
/// the Settings page and the window agree.
/// </summary>
/// <remarks>
/// It holds no Avalonia type and touches no window: the window listens to <see cref="Changed"/> and
/// applies the choices. That keeps it usable where no application is running.
/// </remarks>
public sealed class AppearanceState
{
    private readonly ISettingsStore _settings;

    public AppearanceState(ISettingsStore settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        _settings = settings;
    }

    /// <summary>Raised after any of the choices changed.</summary>
    public event EventHandler? Changed;

    /// <summary>The chosen preset; Solar when the saved id is not one this version knows.</summary>
    public ThemePreset Preset
    {
        get => ThemePreset.ById(_settings.GetValue(SettingKeys.UiTheme));
        set => Store(SettingKeys.UiTheme, value?.Id ?? ThemePreset.DefaultId);
    }

    public bool EffectsEnabled
    {
        get => _settings.GetValue(SettingKeys.UiEffectsEnabled);
        set => Store(SettingKeys.UiEffectsEnabled, value);
    }

    public bool ReducedMotion
    {
        get => _settings.GetValue(SettingKeys.UiReducedMotion);
        set => Store(SettingKeys.UiReducedMotion, value);
    }

    public bool SidebarPinned
    {
        get => _settings.GetValue(SettingKeys.UiSidebarPinned);
        set => Store(SettingKeys.UiSidebarPinned, value);
    }

    private void Store<T>(SettingKey<T> key, T value)
    {
        if (EqualityComparer<T>.Default.Equals(_settings.GetValue(key), value))
        {
            return;
        }

        _settings.SetValue(key, value);
        Changed?.Invoke(this, EventArgs.Empty);
    }
}
