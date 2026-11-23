using System.Text.Json.Serialization;
using TradingAgent.Core.Shell;

namespace TradingAgent.Core.Settings;

/// <summary>Every application setting and its default.</summary>
/// <remarks>
/// Settings are stored as key-value rows, so adding one here needs no database migration. Enumerated
/// values are stored as their lowercase names.
/// </remarks>
public static class SettingKeys
{
    private static SettingsJsonContext Json => SettingsJsonContext.Default;

    // Agent
    public static readonly SettingKey<string> AgentProvider = new("agent.provider", "anthropic", Json.String);
    public static readonly SettingKey<string> AgentAuthMode = new("agent.auth_mode", "subscription", Json.String);
    public static readonly SettingKey<string> AgentModel = new("agent.model", "sonnet", Json.String);

    /// <summary>
    /// True once the user confirmed the notice about signing in with a Claude subscription. Until
    /// then that sign-in mode runs nothing.
    /// </summary>
    public static readonly SettingKey<bool> AgentSubscriptionNoticeConfirmed = new("agent.subscription_notice_confirmed", false, Json.Boolean);
    // Carried over from the previous app and no longer read: current models reject a thinking budget and
    // cannot switch thinking off. Depth of thinking is set with the effort level below.
    public static readonly SettingKey<string> AgentThinkingMode = new("agent.thinking_mode", "adaptive", Json.String);
    public static readonly SettingKey<int> AgentThinkingBudget = new("agent.thinking_budget", 10_000, Json.Int32);

    // low, medium, high, xhigh or max.
    public static readonly SettingKey<string> AgentEffort = new("agent.effort", "high", Json.String);

    // Exchange. Sandbox is on until the user deliberately switches to live trading.
    public static readonly SettingKey<bool> OkxSandbox = new("okx.sandbox", true, Json.Boolean);

    // Risk limits, in percent. The largest position as a share of the account's equity, and the default
    // distance of a stop loss and a take profit from the entry price.
    public static readonly SettingKey<double> RiskMaxPositionSizePercent = new("risk.max_position_size_pct", 5.0, Json.Double);
    public static readonly SettingKey<double> RiskStopLossPercent = new("risk.stop_loss_pct", 2.0, Json.Double);
    public static readonly SettingKey<double> RiskTakeProfitPercent = new("risk.take_profit_pct", 6.0, Json.Double);

    // Safety. A latch: once set, scheduled trading stays paused until the user clears it.
    public static readonly SettingKey<bool> EmergencyStopActive = new("safety.emergency_stop_active", false, Json.Boolean);

    // Desktop shell
    public static readonly SettingKey<bool> AutostartEnabled = new("desktop.autostart_enabled", false, Json.Boolean);
    public static readonly SettingKey<bool> WindowStartOpen = new("window.start_open", true, Json.Boolean);
    public static readonly SettingKey<WindowPlacement?> MainWindowPlacement = new("window.placement", null, Json.WindowPlacement!);

    // Crash and performance reporting
    public static readonly SettingKey<bool> TelemetryEnabled = new("telemetry.enabled", true, Json.Boolean);

    /// <summary>Random id that stands for this installation in crash reports. Says nothing about the person.</summary>
    public static readonly SettingKey<string> TelemetryInstallId = new("telemetry.install_id", string.Empty, Json.String);
    public static readonly SettingKey<bool> TelemetryNoticeDismissed = new("telemetry.notice_dismissed", false, Json.Boolean);

    // Notifications
    public static readonly SettingKey<bool> NativeNotificationsEnabled = new("notifications.native_enabled", true, Json.Boolean);
    public static readonly SettingKey<bool> NotifyTradeConfirmations = new("notifications.trade_confirmations", true, Json.Boolean);
    public static readonly SettingKey<bool> NotifyTradeExecutions = new("notifications.trade_executions", true, Json.Boolean);
    public static readonly SettingKey<bool> NotifyRiskAlerts = new("notifications.risk_alerts", true, Json.Boolean);
    public static readonly SettingKey<bool> NotifyTaskCompletions = new("notifications.task_completions", true, Json.Boolean);
    public static readonly SettingKey<bool> NotifyPriceAlerts = new("notifications.price_alerts", true, Json.Boolean);
    public static readonly SettingKey<bool> NotifyAnalysisReady = new("notifications.analysis_ready", true, Json.Boolean);

    // Chat sessions. Zero keeps sessions forever.
    public static readonly SettingKey<int> SessionRetentionDays = new("sessions.retention_days", 0, Json.Int32);
    public static readonly SettingKey<long?> SessionCleanupLastRunAt = new("sessions.cleanup_last_run_at", null, Json.NullableInt64);

    // Strategy auto-discovery
    public static readonly SettingKey<bool> AutoDiscoverEnabled = new("auto_discover.enabled", false, Json.Boolean);
    public static readonly SettingKey<int> AutoDiscoverIntervalHours = new("auto_discover.interval_hours", 6, Json.Int32);
    public static readonly SettingKey<double> AutoDiscoverMinConfidence = new("auto_discover.min_confidence", 0.5, Json.Double);
    public static readonly SettingKey<int> AutoDiscoverMaxSources = new("auto_discover.max_sources", 30, Json.Int32);
    public static readonly SettingKey<int> AutoDiscoverMaxCandidates = new("auto_discover.max_candidates", 20, Json.Int32);
    public static readonly SettingKey<int> AutoDiscoverMaxParallelExtractions = new("auto_discover.max_parallel_extractions", 4, Json.Int32);
    public static readonly SettingKey<long?> AutoDiscoverLastRunAt = new("auto_discover.last_run_at", null, Json.NullableInt64);

    // Pattern mining
    public static readonly SettingKey<bool> PatternMiningEnabled = new("pattern_mining.enabled", false, Json.Boolean);
    public static readonly SettingKey<int> PatternMiningIntervalHours = new("pattern_mining.interval_hours", 12, Json.Int32);
    public static readonly SettingKey<string[]> PatternMiningSymbols = new("pattern_mining.symbols", [], Json.StringArray);
    public static readonly SettingKey<long?> PatternMiningLastRunAt = new("pattern_mining.last_run_at", null, Json.NullableInt64);

    // News
    public static readonly SettingKey<long?> NewsCrawlLastRunAt = new("news.crawl_last_run_at", null, Json.NullableInt64);

    // Embedding. Background embedding can wait while a listed game is running.
    public static readonly SettingKey<bool> EmbeddingDeferWhenGaming = new("embedding.defer_when_gaming", false, Json.Boolean);
    public static readonly SettingKey<string[]> EmbeddingGamingProcesses = new("embedding.gaming_processes", [], Json.StringArray);
    public static readonly SettingKey<int> EmbeddingGamingCheckMinutes = new("embedding.gaming_check_minutes", 3, Json.Int32);
}

[JsonSerializable(typeof(bool))]
[JsonSerializable(typeof(int))]
[JsonSerializable(typeof(long?))]
[JsonSerializable(typeof(double))]
[JsonSerializable(typeof(string))]
[JsonSerializable(typeof(string[]))]
[JsonSerializable(typeof(WindowPlacement))]
internal sealed partial class SettingsJsonContext : JsonSerializerContext;
