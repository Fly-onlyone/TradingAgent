using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.App.Controls;
using TradingAgent.App.ViewModels;
using TradingAgent.Core.Shell;
using TradingAgent.Data.Notifications;
using Xunit;

namespace TradingAgent.App.Tests;

/// <summary>The bell in the header: what it counts, what it lists, and the message in the corner.</summary>
public sealed class NotificationBellTests : IDisposable
{
    private readonly AgentHarness _agent = new();
    private readonly Clock _clock = new();
    private readonly NotificationService _service;

    public NotificationBellTests()
    {
        _service = new NotificationService(_agent.Database, _agent.Settings, new NoToasts(), _clock, NullLogger<NotificationService>.Instance);
    }

    public void Dispose() => _agent.Dispose();

    [Fact]
    public void A_notification_is_counted_listed_and_shown_in_the_corner()
    {
        // A long stay, so the message is still there when the test looks.
        var bell = new NotificationsViewModel(_service, _clock, action => action(), TimeSpan.FromMinutes(5));
        Assert.Equal((0, false, false), (bell.UnreadCount, bell.HasUnread, bell.HasItems));

        Assert.True(_service.Notify(new Notification(NotificationKind.TradeExecuted, "Order filled", "Bought 0.05 BTC-USDT.")));
        Assert.True(_service.Notify(new Notification(NotificationKind.RiskAlert, "Risk check", "Held back.")));

        Assert.Equal((2, true, "2"), (bell.UnreadCount, bell.HasUnread, bell.BadgeText));
        Assert.Equal([("Order filled", AlertSeverity.Success), ("Risk check", AlertSeverity.Warning)], bell.Toasts.Select(toast => (toast.Title, toast.Severity)));

        bell.Open();

        // Newest first, both not yet looked at.
        Assert.Equal(["Risk check", "Order filled"], bell.Items.Select(item => item.Title));
        Assert.All(bell.Items, item => Assert.False(item.IsRead));
        Assert.Equal("just now", bell.Items[0].When);
        Assert.True(bell.Items[0].IsWarning);
        Assert.True(bell.HasItems);

        bell.DismissCommand.Execute(bell.Toasts[0]);
        Assert.Equal("Risk check", Assert.Single(bell.Toasts).Title);
    }

    [Fact]
    public void Marking_all_as_read_clears_the_count_and_deletes_nothing()
    {
        var bell = new NotificationsViewModel(_service, _clock, action => action(), TimeSpan.FromMinutes(5));
        _service.Notify(new Notification(NotificationKind.TaskFailed, "Morning review failed", "No answer."));
        _service.Notify(new Notification(NotificationKind.AnalysisReady, "Analysis ready", string.Empty));
        bell.Open();

        bell.MarkAllReadCommand.Execute(null);

        Assert.Equal((0, false), (bell.UnreadCount, bell.HasUnread));
        Assert.Equal(2, bell.Items.Count);
        Assert.All(bell.Items, item => Assert.True(item.IsRead));
        Assert.Equal(0, _service.CountUnread());
        Assert.Equal(2, _service.ListRecent(10).Count);
        // What was already there when the app starts is counted too.
        _service.Notify(new Notification(NotificationKind.PriceAlert, "Price alert", "BTC above 100,000."));
        var later = new NotificationsViewModel(_service, _clock, action => action());
        Assert.Equal(1, later.UnreadCount);
    }

    [Fact]
    public void Only_three_messages_stand_in_the_corner_and_a_large_count_is_capped()
    {
        var bell = new NotificationsViewModel(_service, _clock, action => action(), TimeSpan.FromMinutes(5));
        for (var index = 1; index <= 5; index++)
        {
            _service.Notify(new Notification(NotificationKind.PriceAlert, $"Alert {index}", string.Empty));
        }

        Assert.Equal(["Alert 3", "Alert 4", "Alert 5"], bell.Toasts.Select(toast => toast.Title));
        Assert.False(bell.Toasts[0].HasBody);
        bell.UnreadCount = 120;
        Assert.Equal("99+", bell.BadgeText);
    }

    [Fact]
    public void A_notification_of_a_kind_that_is_switched_off_is_neither_stored_nor_shown()
    {
        var bell = new NotificationsViewModel(_service, _clock, action => action(), TimeSpan.FromMinutes(5));
        _agent.Settings.SetValue(TradingAgent.Core.Settings.SettingKeys.NotifyRiskAlerts, false);

        Assert.False(_service.Notify(new Notification(NotificationKind.RiskAlert, "Risk check", "Held back.")));

        Assert.Empty(bell.Toasts);
        Assert.Equal(0, bell.UnreadCount);
    }

    /// <summary>A clock that goes on a second every time it is read, so that no two notifications share a moment.</summary>
    private sealed class Clock : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 11, 26, 9, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _now = _now.AddSeconds(1);
    }

    private sealed class NoToasts : IToastNotifier
    {
#pragma warning disable CS0067 // Part of the interface; nothing here raises it.
        public event EventHandler? Activated;
#pragma warning restore CS0067

        public void Show(string title, string body)
        {
        }
    }
}
