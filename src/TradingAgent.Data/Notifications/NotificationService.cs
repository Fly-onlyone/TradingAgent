using Microsoft.Extensions.Logging;
using TradingAgent.Core;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;

namespace TradingAgent.Data.Notifications;

/// <summary>What a notification is about. The names are the values of <c>notifications.notification_type</c>.</summary>
public enum NotificationKind
{
    TradeConfirmation,
    TradeExecuted,
    RiskAlert,
    TaskCompleted,
    TaskFailed,
    PriceAlert,
    AnalysisReady,
}

/// <param name="Kind">What it is about; decides which setting switches it off.</param>
/// <param name="Title">One line.</param>
/// <param name="Body">The detail.</param>
/// <param name="SessionId">The chat session it belongs to, when there is one.</param>
/// <param name="OrderId">The row of <c>orders</c> it is about, when there is one.</param>
/// <param name="DebounceKey">
/// Notifications with the same key within <see cref="NotificationService.DebounceWindow"/> are
/// dropped after the first; null never drops.
/// </param>
public sealed record Notification(
    NotificationKind Kind,
    string Title,
    string Body,
    string? SessionId = null,
    string? OrderId = null,
    string? DebounceKey = null);

/// <summary>
/// The one way the app tells the user something happened while they were not looking: a row in
/// <c>notifications</c> and, when allowed, a Windows toast.
/// </summary>
/// <remarks>
/// A kind the user switched off writes nothing at all. With desktop notifications switched off the
/// row is still written (a screen can list it) and no toast is shown.
/// </remarks>
public sealed partial class NotificationService(
    Database database,
    ISettingsStore settings,
    IToastNotifier toasts,
    TimeProvider time,
    ILogger<NotificationService> logger)
{
    /// <summary>How long a second notification with the same key is held back.</summary>
    public static TimeSpan DebounceWindow { get; } = TimeSpan.FromSeconds(30);

    private readonly Lock _sync = new();
    private readonly Dictionary<string, DateTimeOffset> _lastByKey = new(StringComparer.Ordinal);

    /// <summary>Records and shows a notification. Returns false when a setting or the debounce dropped it.</summary>
    public bool Notify(Notification notification)
    {
        ArgumentNullException.ThrowIfNull(notification);
        if (!settings.GetValue(SettingFor(notification.Kind)))
        {
            return false;
        }

        var now = time.GetUtcNow();
        if (notification.DebounceKey is { } key)
        {
            lock (_sync)
            {
                if (_lastByKey.TryGetValue(key, out var last) && now - last < DebounceWindow)
                {
                    return false;
                }

                _lastByKey[key] = now;
                // Kept small: a key older than the window can never hold anything back again.
                if (_lastByKey.Count > 500)
                {
                    foreach (var stale in _lastByKey.Where(entry => now - entry.Value >= DebounceWindow).Select(entry => entry.Key).ToList())
                    {
                        _lastByKey.Remove(stale);
                    }
                }
            }
        }

        var showToast = settings.GetValue(SettingKeys.NativeNotificationsEnabled);
        string? toastError = null;
        if (showToast)
        {
            try
            {
                toasts.Show(notification.Title, notification.Body);
            }
            catch (Exception ex) when (ex is InvalidOperationException or System.Runtime.InteropServices.COMException or UnauthorizedAccessException)
            {
                // The row is still written; a toast that cannot be shown must not lose the notification.
                toastError = ex.Message;
                LogToastFailed(logger, ex);
            }
        }

        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO notifications (id, title, body, notification_type, order_id, session_id, status, delivered_at, delivery_error, created_at)
            VALUES ($id, $title, $body, $type, $order, $session, $status, $delivered, $error, $now);
            """;
        command.Parameters.AddWithValue("$id", Ids.NewId(now));
        command.Parameters.AddWithValue("$title", notification.Title);
        command.Parameters.AddWithValue("$body", notification.Body);
        command.Parameters.AddWithValue("$type", TypeName(notification.Kind));
        command.Parameters.AddWithValue("$order", (object?)notification.OrderId ?? DBNull.Value);
        command.Parameters.AddWithValue("$session", (object?)notification.SessionId ?? DBNull.Value);
        command.Parameters.AddWithValue("$status", showToast && toastError is null ? "delivered" : toastError is null ? "pending" : "failed");
        command.Parameters.AddWithValue("$delivered", showToast && toastError is null ? now.ToUnixTimeMilliseconds() : DBNull.Value);
        command.Parameters.AddWithValue("$error", (object?)toastError ?? DBNull.Value);
        command.Parameters.AddWithValue("$now", now.ToUnixTimeMilliseconds());
        command.ExecuteNonQuery();
        return true;
    }

    private static SettingKey<bool> SettingFor(NotificationKind kind) => kind switch
    {
        NotificationKind.TradeConfirmation => SettingKeys.NotifyTradeConfirmations,
        NotificationKind.TradeExecuted => SettingKeys.NotifyTradeExecutions,
        NotificationKind.RiskAlert => SettingKeys.NotifyRiskAlerts,
        NotificationKind.TaskCompleted or NotificationKind.TaskFailed => SettingKeys.NotifyTaskCompletions,
        NotificationKind.PriceAlert => SettingKeys.NotifyPriceAlerts,
        NotificationKind.AnalysisReady => SettingKeys.NotifyAnalysisReady,
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };

    private static string TypeName(NotificationKind kind) => kind switch
    {
        NotificationKind.TradeConfirmation => "trade_confirmation",
        NotificationKind.TradeExecuted => "trade_executed",
        NotificationKind.RiskAlert => "risk_alert",
        NotificationKind.TaskCompleted => "task_completed",
        NotificationKind.TaskFailed => "task_failed",
        NotificationKind.PriceAlert => "price_alert",
        NotificationKind.AnalysisReady => "analysis_ready",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };

    [LoggerMessage(Level = LogLevel.Warning, Message = "A desktop notification could not be shown; it was recorded only.")]
    private static partial void LogToastFailed(ILogger logger, Exception exception);
}
