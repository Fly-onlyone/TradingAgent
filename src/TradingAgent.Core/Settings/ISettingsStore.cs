namespace TradingAgent.Core.Settings;

/// <summary>Reads and writes application settings. Safe to call from any thread.</summary>
public interface ISettingsStore
{
    /// <summary>Raised after a setting was saved or reset, on the thread that made the change.</summary>
    event EventHandler<SettingChangedEventArgs>? Changed;

    /// <summary>Returns the saved value, or the key's default when none is saved or the saved one is unreadable.</summary>
    T GetValue<T>(SettingKey<T> key);

    void SetValue<T>(SettingKey<T> key, T value);

    /// <summary>Removes the saved value so the default applies again.</summary>
    void Reset<T>(SettingKey<T> key);
}

public sealed class SettingChangedEventArgs(string key) : EventArgs
{
    public string Key { get; } = key;
}
