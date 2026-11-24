using System.Globalization;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Cli;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Notifications;

namespace TradingAgent.App.ViewModels;

/// <summary>One key or password: whether it is saved, a box to type a new one, and buttons to save and remove it.</summary>
/// <remarks>
/// The saved value never comes back to the screen. What is shown is "saved" and, for a long enough
/// value, its last four characters. What is typed is handed to the store and cleared at once.
/// </remarks>
internal sealed partial class SecretFieldViewModel : ObservableObject
{
    private readonly ISecretStore _secrets;
    private readonly string _name;
    private readonly Action? _changed;

    public SecretFieldViewModel(ISecretStore secrets, string name, string label, Action? changed = null)
    {
        _secrets = secrets;
        _name = name;
        _changed = changed;
        Label = label;
        Show();
    }

    public string Label { get; }

    /// <summary>What is typed and not yet saved.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SaveCommand))]
    public partial string Entry { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string State { get; set; } = string.Empty;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(RemoveCommand))]
    public partial bool IsSaved { get; set; }

    [RelayCommand(CanExecute = nameof(CanSave))]
    public void Save()
    {
        _secrets.Save(_name, Entry.Trim());
        Entry = string.Empty;
        Show();
        _changed?.Invoke();
    }

    [RelayCommand(CanExecute = nameof(IsSaved))]
    public void Remove()
    {
        _secrets.Remove(_name);
        Show();
        _changed?.Invoke();
    }

    private bool CanSave() => !string.IsNullOrWhiteSpace(Entry);

    private void Show()
    {
        var state = _secrets.GetState(_name);
        IsSaved = state.Status != SecretStatus.Unset;
        State = state.Status switch
        {
            SecretStatus.Saved => state.Hint.Length > 0 ? $"Saved (ends in {state.Hint})" : "Saved",
            SecretStatus.Unreadable => "Saved, but it cannot be read. Save it again.",
            _ => "Not saved",
        };
    }
}

/// <summary>
/// The Settings page: which model answers and how it signs in, the OKX key and the trading mode, the
/// risk limits, the emergency stop, and which notifications are shown.
/// </summary>
/// <remarks>
/// Every change is saved at once; there is no "Save" for the page. The two changes that move real
/// money's guard rails take two steps: switching to live trading asks for a confirmation, and the
/// emergency stop is one switch that takes effect for the very next tool call.
/// </remarks>
internal sealed partial class SettingsViewModel : PageViewModel
{
    private readonly ISettingsStore _settings;
    private readonly AtkService _kit;
    private readonly bool _loading;
    private readonly IEmailSender? _email;
    private readonly Action<Action> _post;

    public SettingsViewModel(ISettingsStore settings, ISecretStore secrets, AtkService kit, IEmailSender? email = null, Action<Action>? post = null)
    {
        _settings = settings;
        _kit = kit;
        _email = email;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        EmailPassword = new SecretFieldViewModel(secrets, SecretNames.SmtpPassword, "Password");

        AnthropicKey = new SecretFieldViewModel(secrets, SecretNames.AnthropicApiKey, "Anthropic API key");
        OpenAiKey = new SecretFieldViewModel(secrets, SecretNames.OpenAiApiKey, "OpenAI API key");
        // The trade kit takes the key when it starts: a changed key means a restart of the kit.
        OkxApiKey = new SecretFieldViewModel(secrets, SecretNames.OkxApiKey, "API key", kit.Reload);
        OkxSecretKey = new SecretFieldViewModel(secrets, SecretNames.OkxSecretKey, "Secret key", kit.Reload);
        OkxPassphrase = new SecretFieldViewModel(secrets, SecretNames.OkxPassphrase, "Passphrase", kit.Reload);
        BraveKey = new SecretFieldViewModel(secrets, SecretNames.BraveSearchApiKey, "Brave Search API key");

        _loading = true;
        Provider = settings.GetValue(SettingKeys.AgentProvider) == AgentWire.OpenAi ? AgentWire.OpenAi : AgentWire.Anthropic;
        AuthMode = settings.GetValue(SettingKeys.AgentAuthMode) == AgentWire.ApiKey ? AgentWire.ApiKey : AgentWire.Subscription;
        Model = settings.GetValue(SettingKeys.AgentModel);
        Effort = settings.GetValue(SettingKeys.AgentEffort);
        SubscriptionConfirmed = settings.GetValue(SettingKeys.AgentSubscriptionNoticeConfirmed);
        IsLive = !settings.GetValue(SettingKeys.OkxSandbox);
        MaxPositionPercent = (decimal)settings.GetValue(SettingKeys.RiskMaxPositionSizePercent);
        StopLossPercent = (decimal)settings.GetValue(SettingKeys.RiskStopLossPercent);
        TakeProfitPercent = (decimal)settings.GetValue(SettingKeys.RiskTakeProfitPercent);
        EmergencyStop = settings.GetValue(SettingKeys.EmergencyStopActive);
        DesktopNotifications = settings.GetValue(SettingKeys.NativeNotificationsEnabled);
        TradeNotifications = settings.GetValue(SettingKeys.NotifyTradeExecutions);
        RiskNotifications = settings.GetValue(SettingKeys.NotifyRiskAlerts);
        TaskNotifications = settings.GetValue(SettingKeys.NotifyTaskCompletions);
        EmailEnabled = settings.GetValue(SettingKeys.EmailEnabled);
        EmailHost = settings.GetValue(SettingKeys.EmailSmtpHost);
        EmailPort = settings.GetValue(SettingKeys.EmailSmtpPort);
        EmailUser = settings.GetValue(SettingKeys.EmailUsername);
        EmailFrom = settings.GetValue(SettingKeys.EmailFrom);
        EmailTo = settings.GetValue(SettingKeys.EmailTo);
        EmailTls = settings.GetValue(SettingKeys.EmailUseTls);
        PatternMining = settings.GetValue(SettingKeys.PatternMiningEnabled);
        PatternSymbols = string.Join(", ", settings.GetValue(SettingKeys.PatternMiningSymbols));
        AutoDiscover = settings.GetValue(SettingKeys.AutoDiscoverEnabled);
        AutoDiscoverHours = settings.GetValue(SettingKeys.AutoDiscoverIntervalHours);
        _loading = false;
        ShowTradingMode();
    }

    public override string Title => "Settings";

    public IReadOnlyList<string> Providers { get; } = [AgentWire.Anthropic, AgentWire.OpenAi];

    public IReadOnlyList<string> AuthModes { get; } = [AgentWire.Subscription, AgentWire.ApiKey];

    public IReadOnlyList<string> Efforts { get; } = ["low", "medium", "high", "xhigh", "max"];

    public string SubscriptionNotice { get; } = ClaudeCli.SubscriptionNotice;

    public SecretFieldViewModel AnthropicKey { get; }

    public SecretFieldViewModel OpenAiKey { get; }

    public SecretFieldViewModel OkxApiKey { get; }

    public SecretFieldViewModel OkxSecretKey { get; }

    public SecretFieldViewModel OkxPassphrase { get; }

    public SecretFieldViewModel BraveKey { get; }

    public SecretFieldViewModel EmailPassword { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsAnthropic), nameof(IsOpenAi), nameof(UsesSubscription), nameof(UsesAnthropicKey), nameof(ModelHint))]
    public partial string Provider { get; set; } = AgentWire.Anthropic;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(UsesSubscription), nameof(UsesAnthropicKey))]
    public partial string AuthMode { get; set; } = AgentWire.Subscription;

    [ObservableProperty]
    public partial string Model { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Effort { get; set; } = "high";

    /// <summary>True once the notice about the subscription mode was confirmed.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NeedsSubscriptionConfirmation))]
    public partial bool SubscriptionConfirmed { get; set; }

    /// <summary>True while orders go to the live exchange.</summary>
    [ObservableProperty]
    public partial bool IsLive { get; set; }

    /// <summary>True while the page asks "really live?" and nothing has changed yet.</summary>
    [ObservableProperty]
    public partial bool ConfirmingLive { get; set; }

    [ObservableProperty]
    public partial string TradingMode { get; set; } = string.Empty;

    [ObservableProperty]
    public partial decimal? MaxPositionPercent { get; set; }

    [ObservableProperty]
    public partial decimal? StopLossPercent { get; set; }

    [ObservableProperty]
    public partial decimal? TakeProfitPercent { get; set; }

    [ObservableProperty]
    public partial bool EmergencyStop { get; set; }

    [ObservableProperty]
    public partial bool DesktopNotifications { get; set; }

    [ObservableProperty]
    public partial bool TradeNotifications { get; set; }

    [ObservableProperty]
    public partial bool RiskNotifications { get; set; }

    [ObservableProperty]
    public partial bool TaskNotifications { get; set; }

    /// <summary>True while the agent looks for strategies on a schedule.</summary>
    [ObservableProperty]
    public partial bool AutoDiscover { get; set; }

    [ObservableProperty]
    public partial decimal? AutoDiscoverHours { get; set; }

    /// <summary>True while notifications are also sent by email.</summary>
    [ObservableProperty]
    public partial bool EmailEnabled { get; set; }

    [ObservableProperty]
    public partial string EmailHost { get; set; } = string.Empty;

    [ObservableProperty]
    public partial decimal? EmailPort { get; set; }

    [ObservableProperty]
    public partial string EmailUser { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string EmailFrom { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string EmailTo { get; set; } = string.Empty;

    [ObservableProperty]
    public partial bool EmailTls { get; set; }

    /// <summary>What became of the test email.</summary>
    [ObservableProperty]
    public partial string EmailStatus { get; set; } = string.Empty;

    /// <summary>True while the app measures on a schedule what past price signals were worth.</summary>
    [ObservableProperty]
    public partial bool PatternMining { get; set; }

    /// <summary>The instruments measured, separated by commas. Empty means BTC-USDT and ETH-USDT.</summary>
    [ObservableProperty]
    public partial string PatternSymbols { get; set; } = string.Empty;

    public bool IsAnthropic => Provider == AgentWire.Anthropic;

    public bool IsOpenAi => Provider == AgentWire.OpenAi;

    public bool UsesSubscription => IsAnthropic && AuthMode == AgentWire.Subscription;

    public bool UsesAnthropicKey => IsAnthropic && AuthMode == AgentWire.ApiKey;

    public bool NeedsSubscriptionConfirmation => !SubscriptionConfirmed;

    public string ModelHint => IsOpenAi
        ? "A model name of OpenAI, for example gpt-5.5."
        : "sonnet, opus, haiku or fable, or a full Claude model name.";

    /// <summary>Records that the user read the subscription notice.</summary>
    [RelayCommand]
    public void ConfirmSubscription()
    {
        _settings.SetValue(SettingKeys.AgentSubscriptionNoticeConfirmed, true);
        SubscriptionConfirmed = true;
    }

    /// <summary>Sends one email with the settings as they are, to prove they work.</summary>
    [RelayCommand]
    public async Task SendTestEmailAsync()
    {
        if (_email is null)
        {
            return;
        }

        EmailStatus = "Sending…";
        string result;
        try
        {
            await Task.Run(() => _email.SendAsync("Trading agent: test email", "This is the test email you asked for in Settings.", CancellationToken.None)).ConfigureAwait(false);
            result = "Sent. Look in the receiver's inbox.";
        }
        catch (EmailException ex)
        {
            result = ex.Message;
        }

        _post(() => EmailStatus = result);
    }

    /// <summary>First step toward live trading: shows what it means and changes nothing.</summary>
    [RelayCommand]
    public void AskForLive() => ConfirmingLive = true;

    /// <summary>Second step: orders go to the live exchange from the next start of the trade kit, which follows at once.</summary>
    [RelayCommand]
    public void SwitchToLive()
    {
        ConfirmingLive = false;
        _settings.SetValue(SettingKeys.OkxSandbox, false);
        IsLive = true;
        ShowTradingMode();
    }

    [RelayCommand]
    public void CancelLive() => ConfirmingLive = false;

    /// <summary>Back to demo trading. One step: this direction cannot lose money.</summary>
    [RelayCommand]
    public void SwitchToDemo()
    {
        ConfirmingLive = false;
        _settings.SetValue(SettingKeys.OkxSandbox, true);
        IsLive = false;
        ShowTradingMode();
    }

    private static double? Percent(decimal? value) => value is >= 0.1m and <= 100m ? (double)value : null;

    partial void OnProviderChanged(string value) => Store(SettingKeys.AgentProvider, value);

    partial void OnAuthModeChanged(string value) => Store(SettingKeys.AgentAuthMode, value);

    partial void OnModelChanged(string value) => Store(SettingKeys.AgentModel, value.Trim());

    partial void OnEffortChanged(string value) => Store(SettingKeys.AgentEffort, value);

    partial void OnEmergencyStopChanged(bool value) => Store(SettingKeys.EmergencyStopActive, value);

    partial void OnDesktopNotificationsChanged(bool value) => Store(SettingKeys.NativeNotificationsEnabled, value);

    partial void OnTradeNotificationsChanged(bool value) => Store(SettingKeys.NotifyTradeExecutions, value);

    partial void OnRiskNotificationsChanged(bool value) => Store(SettingKeys.NotifyRiskAlerts, value);

    partial void OnTaskNotificationsChanged(bool value) => Store(SettingKeys.NotifyTaskCompletions, value);

    partial void OnEmailEnabledChanged(bool value) => Store(SettingKeys.EmailEnabled, value);

    partial void OnEmailHostChanged(string value) => Store(SettingKeys.EmailSmtpHost, value.Trim());

    partial void OnEmailPortChanged(decimal? value)
    {
        if (value is >= 1 and <= 65535)
        {
            Store(SettingKeys.EmailSmtpPort, (int)value.Value);
        }
    }

    partial void OnEmailUserChanged(string value) => Store(SettingKeys.EmailUsername, value.Trim());

    partial void OnEmailFromChanged(string value) => Store(SettingKeys.EmailFrom, value.Trim());

    partial void OnEmailToChanged(string value) => Store(SettingKeys.EmailTo, value.Trim());

    partial void OnEmailTlsChanged(bool value) => Store(SettingKeys.EmailUseTls, value);

    partial void OnPatternMiningChanged(bool value) => Store(SettingKeys.PatternMiningEnabled, value);

    partial void OnPatternSymbolsChanged(string value) =>
        Store(SettingKeys.PatternMiningSymbols, value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    partial void OnAutoDiscoverChanged(bool value) => Store(SettingKeys.AutoDiscoverEnabled, value);

    partial void OnAutoDiscoverHoursChanged(decimal? value)
    {
        if (value is >= 1 and <= 720)
        {
            Store(SettingKeys.AutoDiscoverIntervalHours, (int)value.Value);
        }
    }

    // A percentage outside 0.1 to 100, or an empty box, is not saved: the last good value stays in force.
    partial void OnMaxPositionPercentChanged(decimal? value)
    {
        if (Percent(value) is { } percent)
        {
            Store(SettingKeys.RiskMaxPositionSizePercent, percent);
        }
    }

    partial void OnStopLossPercentChanged(decimal? value)
    {
        if (Percent(value) is { } percent)
        {
            Store(SettingKeys.RiskStopLossPercent, percent);
        }
    }

    partial void OnTakeProfitPercentChanged(decimal? value)
    {
        if (Percent(value) is { } percent)
        {
            Store(SettingKeys.RiskTakeProfitPercent, percent);
        }
    }

    private void Store<T>(SettingKey<T> key, T value)
    {
        if (!_loading)
        {
            _settings.SetValue(key, value);
        }
    }

    private void ShowTradingMode() =>
        TradingMode = IsLive
            ? "LIVE trading: orders move real money."
            : string.Create(CultureInfo.InvariantCulture, $"Demo trading: orders are simulated. The trade kit is {_kit.Status.State.ToString().ToLowerInvariant()}.");
}
