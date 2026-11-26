using System.Collections.ObjectModel;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.App.Controls;
using TradingAgent.Data.Notifications;

namespace TradingAgent.App.ViewModels;

/// <summary>One notification in the list under the bell.</summary>
internal sealed class NotificationItemViewModel(StoredNotification source, DateTimeOffset now)
{
    public string Title => source.Title;

    public string Body => source.Body;

    public bool HasBody => source.Body.Length > 0;

    /// <summary>One that was looked at is shown fainter.</summary>
    public bool IsRead => source.IsRead;

    public AlertSeverity Severity { get; } = NotificationsViewModel.SeverityOf(source.Type);

    public bool IsSuccess => Severity == AlertSeverity.Success;

    public bool IsWarning => Severity == AlertSeverity.Warning;

    public bool IsError => Severity == AlertSeverity.Error;

    public bool IsInfo => Severity == AlertSeverity.Info;

    /// <summary>How long ago it came, as the previous UI wrote it: "just now", "5m ago", "2h ago", "3d ago".</summary>
    public string When { get; } = Ago(now - DateTimeOffset.FromUnixTimeMilliseconds(source.CreatedAt));

    private static string Ago(TimeSpan age) =>
        age.TotalSeconds < 60 ? "just now"
        : age.TotalMinutes < 60 ? $"{(int)age.TotalMinutes}m ago"
        : age.TotalHours < 24 ? $"{(int)age.TotalHours}h ago"
        : $"{(int)age.TotalDays}d ago";
}

/// <summary>A notification shown for a few seconds in the corner of the window.</summary>
internal sealed class ToastViewModel(StoredNotification source)
{
    public string Title => source.Title;

    public string Body => source.Body;

    public bool HasBody => source.Body.Length > 0;

    public AlertSeverity Severity { get; } = NotificationsViewModel.SeverityOf(source.Type);
}

/// <summary>
/// The bell in the header: how many notifications were not looked at, the newest of them in a list,
/// and a message in the corner of the window when one comes in.
/// </summary>
/// <remarks>
/// It only reads what <see cref="NotificationService"/> stored and marks it as looked at. It deletes
/// nothing: deleting a kind of data takes two steps and is on the Admin page.
/// </remarks>
internal sealed partial class NotificationsViewModel : ObservableObject
{
    /// <summary>How many notifications the list holds.</summary>
    private const int Listed = 50;

    /// <summary>How many messages stand in the corner at once; an older one makes room.</summary>
    private const int MostToasts = 3;

    private readonly NotificationService _service;
    private readonly TimeProvider _time;
    private readonly Action<Action> _post;
    private readonly TimeSpan _toastTime;

    public NotificationsViewModel(NotificationService service, TimeProvider time, Action<Action>? post = null, TimeSpan? toastTime = null)
    {
        ArgumentNullException.ThrowIfNull(service);
        ArgumentNullException.ThrowIfNull(time);
        _service = service;
        _time = time;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        _toastTime = toastTime ?? TimeSpan.FromSeconds(ToastSeconds);
        // Raised on whatever thread raised the notification.
        service.Raised += notification => _post(() => Show(notification));
        UnreadCount = service.CountUnread();
    }

    /// <summary>How long a message stays in the corner, as in the previous UI.</summary>
    public static double ToastSeconds => 5;

    public ObservableCollection<NotificationItemViewModel> Items { get; } = [];

    public ObservableCollection<ToastViewModel> Toasts { get; } = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasUnread), nameof(BadgeText))]
    public partial int UnreadCount { get; set; }

    [ObservableProperty]
    public partial bool HasItems { get; set; }

    public bool HasUnread => UnreadCount > 0;

    /// <summary>The count on the bell; above 99 it says "99+".</summary>
    public string BadgeText => UnreadCount > 99 ? "99+" : UnreadCount.ToString(System.Globalization.CultureInfo.CurrentCulture);

    /// <summary>What a kind of notification is: good news, a warning, a failure, or just news.</summary>
    public static AlertSeverity SeverityOf(string type) => type switch
    {
        "trade_executed" or "task_completed" => AlertSeverity.Success,
        "risk_alert" => AlertSeverity.Warning,
        "task_failed" => AlertSeverity.Error,
        _ => AlertSeverity.Info,
    };

    /// <summary>Reads the list anew: the panel under the bell is about to show.</summary>
    public void Open() => Reload();

    /// <summary>Marks every notification as looked at. The list keeps them, fainter.</summary>
    [RelayCommand]
    public void MarkAllRead()
    {
        _service.MarkAllRead();
        Reload();
    }

    /// <summary>Takes a message out of the corner before its time is up.</summary>
    [RelayCommand]
    public void Dismiss(ToastViewModel? toast)
    {
        if (toast is not null)
        {
            Toasts.Remove(toast);
        }
    }

    private void Show(StoredNotification notification)
    {
        var toast = new ToastViewModel(notification);
        Toasts.Add(toast);
        while (Toasts.Count > MostToasts)
        {
            Toasts.RemoveAt(0);
        }

        UnreadCount = _service.CountUnread();
        _ = DismissLaterAsync(toast);
    }

    private async Task DismissLaterAsync(ToastViewModel toast)
    {
        await Task.Delay(_toastTime, _time).ConfigureAwait(false);
        _post(() => Toasts.Remove(toast));
    }

    private void Reload()
    {
        var now = _time.GetUtcNow();
        Items.Clear();
        foreach (var notification in _service.ListRecent(Listed))
        {
            Items.Add(new NotificationItemViewModel(notification, now));
        }

        HasItems = Items.Count > 0;
        UnreadCount = _service.CountUnread();
    }
}
