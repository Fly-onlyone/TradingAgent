using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Orders;
using TradingAgent.Core;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Data.Agent;
using TradingAgent.Data.Notifications;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Okx;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class OrderMirrorTests : IDisposable
{
    private readonly TempDatabase _temp = new();
    private readonly FakeExchange _exchange = new();
    private readonly FakeSettings _settings = new();
    private readonly FakeToasts _toasts = new();
    private readonly ManualTime _time = new(new DateTimeOffset(2026, 11, 23, 10, 0, 0, TimeSpan.Zero));
    private readonly AgentEventHub _events = new();
    private readonly IAgentEventSubscription _subscription;
    private readonly AgentSessionRepository _sessions;
    private readonly SessionMessageRepository _messages;
    private readonly OrderStubRepository _stubs;
    private readonly OrderMirror _mirror;
    private readonly AgentSession _session;
    private readonly SessionMessage _reply;

    public OrderMirrorTests()
    {
        _sessions = new AgentSessionRepository(_temp.Database, TimeProvider.System);
        _messages = new SessionMessageRepository(_temp.Database, TimeProvider.System);
        _stubs = new OrderStubRepository(_temp.Database, _time);
        _subscription = _events.Subscribe();
        _mirror = new OrderMirror(
            _exchange,
            new MirrorOrderRepository(_temp.Database, _time),
            _sessions,
            _messages,
            _events,
            new NotificationService(_temp.Database, _settings, _toasts, _time, NullLogger<NotificationService>.Instance),
            _time,
            NullLogger<OrderMirror>.Instance);
        _session = _sessions.Create();
        _reply = _messages.Append(_session.Id, MessageRole.Assistant, "Placing the order.", MessageStatus.Complete);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose()
    {
        _subscription.Dispose();
        _temp.Dispose();
    }

    // ---- an order of the agent's ----

    [Fact]
    public async Task An_order_the_agent_placed_is_matched_to_its_pending_row_and_shown_in_the_chat()
    {
        var id = PlaceThroughGate("toolu_01");
        _exchange.OpenOrders["SPOT"].Add(Order("9001", id, state: "live"));

        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(new MirrorPass(true, Added: 0, Changed: 1), pass);
        Assert.Equal(("9001", "open"), (Text("exchange_order_id", id), Text("status", id)));
        // No longer waiting to expire.
        Assert.Null(Scalar<long?>("SELECT pending_until FROM orders WHERE client_order_id = $id;", id));
        Assert.Null(_stubs.Find(id));
        // The tool call's bubble carries the order's state, and the chat is told to redraw the message.
        var summary = Summary("toolu_01");
        Assert.Equal(("open", "BTC-USDT", "9001"), (summary.GetProperty("status").GetString(), summary.GetProperty("symbol").GetString(), summary.GetProperty("exchange_order_id").GetString()));
        var updated = Assert.IsType<MessageUpdated>(Assert.Single(Events()));
        Assert.Equal((_session.Id, _reply.Id), (updated.SessionId, updated.Message.Id));
        // Opening is not news; a fill is.
        Assert.Empty(_toasts.Shown);
    }

    [Fact]
    public async Task A_fill_updates_the_row_and_the_chat_and_tells_the_user_once()
    {
        var id = PlaceThroughGate("toolu_01");
        _exchange.OpenOrders["SPOT"].Add(Order("9001", id, state: "live"));
        await _mirror.RunOnceAsync(Ct);
        Events();

        _exchange.OpenOrders["SPOT"].Clear();
        _exchange.RecentOrders["SPOT"].Add(Order("9001", id, state: "filled", filled: 0.004m, average: 50_125.5m, updatedAt: 1_795_500_000_000));
        var pass = await _mirror.RunOnceAsync(Ct);
        var again = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(1, pass.Changed);
        Assert.Equal(0, again.Changed);
        Assert.Equal("filled", Text("status", id));
        Assert.Equal(0.004, Scalar<double>("SELECT filled_quantity FROM orders WHERE client_order_id = $id;", id));
        Assert.Equal(50_125.5, Scalar<double>("SELECT avg_fill_price FROM orders WHERE client_order_id = $id;", id));
        Assert.Equal(1_795_500_000_000, Scalar<long>("SELECT filled_at FROM orders WHERE client_order_id = $id;", id));
        Assert.Equal(50_125.5m, Summary("toolu_01").GetProperty("avg_fill_price").GetDecimal());
        Assert.Single(Events());
        var toast = Assert.Single(_toasts.Shown);
        Assert.Equal(("Order BTC-USDT filled", "buy 0.004 at 50125.5"), toast);
        Assert.Equal(
            ("trade_executed", "delivered", _session.Id),
            (Scalar<string>("SELECT notification_type FROM notifications;"), Scalar<string>("SELECT status FROM notifications;"), Scalar<string>("SELECT session_id FROM notifications;")));
    }

    [Fact]
    public async Task A_partial_fill_moves_the_numbers_without_a_notification()
    {
        var id = PlaceThroughGate("toolu_01");
        _exchange.OpenOrders["SPOT"].Add(Order("9001", id, state: "partially_filled", filled: 0.001m, average: 50_000m));
        await _mirror.RunOnceAsync(Ct);
        _exchange.OpenOrders["SPOT"][0] = Order("9001", id, state: "partially_filled", filled: 0.003m, average: 50_010m);
        Events();

        var pass = await _mirror.RunOnceAsync(Ct);

        // The state is the same; the filled size is not.
        Assert.Equal(1, pass.Changed);
        Assert.Equal(0.003m, Summary("toolu_01").GetProperty("filled_quantity").GetDecimal());
        Assert.Single(Events());
        Assert.Empty(_toasts.Shown);
    }

    [Fact]
    public async Task A_cancel_tells_the_user()
    {
        var id = PlaceThroughGate("toolu_01");
        _exchange.RecentOrders["SPOT"].Add(Order("9001", id, state: "canceled"));

        await _mirror.RunOnceAsync(Ct);

        Assert.Equal("cancelled", Text("status", id));
        Assert.Equal("Order BTC-USDT cancelled", Assert.Single(_toasts.Shown).Title);
    }

    [Fact]
    public async Task An_order_in_both_lists_ends_in_its_later_state()
    {
        var id = PlaceThroughGate("toolu_01");
        // OKX can show an order as open and as finished within one pass.
        _exchange.OpenOrders["SPOT"].Add(Order("9001", id, state: "live"));
        _exchange.RecentOrders["SPOT"].Add(Order("9001", id, state: "filled", filled: 0.004m, average: 50_000m));

        await _mirror.RunOnceAsync(Ct);

        Assert.Equal("filled", Text("status", id));
    }

    [Theory]
    [InlineData("SPOT", "BTC-USDT")]
    [InlineData("SWAP", "BTC-USDT-SWAP")]
    public async Task Spot_and_swap_orders_are_both_mirrored(string type, string instrument)
    {
        _exchange.OpenOrders[type].Add(Order("9001", string.Empty, state: "live", instrument: instrument, type: type));

        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(1, pass.Added);
        Assert.Equal(instrument, Scalar<string>("SELECT symbol FROM orders WHERE exchange_order_id = '9001';"));
    }

    // ---- orders placed elsewhere ----

    [Fact]
    public async Task An_order_placed_outside_the_app_gets_a_row_and_no_notification()
    {
        _exchange.OpenOrders["SPOT"].Add(Order("7001", "myownid1", state: "live"));
        await _mirror.RunOnceAsync(Ct);
        _exchange.OpenOrders["SPOT"].Clear();
        _exchange.RecentOrders["SPOT"].Add(Order("7001", "myownid1", state: "filled", filled: 0.004m, average: 50_000m));

        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(1, pass.Changed);
        Assert.Equal("filled", Scalar<string>("SELECT status FROM orders WHERE exchange_order_id = '7001';"));
        Assert.Null(Scalar<string?>("SELECT agent_session_id FROM orders WHERE exchange_order_id = '7001';"));
        // What the user did by hand in the OKX app, they know.
        Assert.Empty(_toasts.Shown);
        Assert.Empty(Events());
    }

    [Fact]
    public async Task Two_orders_from_elsewhere_with_the_same_client_id_are_both_kept()
    {
        _exchange.RecentOrders["SPOT"].Add(Order("7001", "reused", state: "filled", filled: 1m, average: 1m));
        _exchange.RecentOrders["SPOT"].Add(Order("7002", "reused", state: "canceled"));

        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(2, pass.Added);
        Assert.Equal(2, Scalar<long>("SELECT count(*) FROM orders;"));
        Assert.Equal("cancelled", Scalar<string>("SELECT status FROM orders WHERE exchange_order_id = '7002';"));
    }

    [Fact]
    public async Task An_order_whose_id_names_a_session_that_is_gone_is_still_mirrored()
    {
        var orphan = ClientOrderId.New(Ids.NewId());
        _exchange.OpenOrders["SPOT"].Add(Order("9001", orphan, state: "live"));

        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(1, pass.Added);
        Assert.Null(Scalar<string?>("SELECT agent_session_id FROM orders WHERE exchange_order_id = '9001';"));
    }

    [Fact]
    public async Task An_order_whose_id_names_a_session_is_tied_to_it_even_without_a_pending_row()
    {
        // The pending row was lost (another machine, a restored database); the id still says whose order it is.
        var id = ClientOrderId.New(_session.Id);
        _exchange.OpenOrders["SPOT"].Add(Order("9001", id, state: "live"));

        await _mirror.RunOnceAsync(Ct);

        Assert.Equal(_session.Id, Scalar<string>("SELECT agent_session_id FROM orders WHERE exchange_order_id = '9001';"));
    }

    [Theory]
    [InlineData("live", "open")]
    [InlineData("partially_filled", "partially_filled")]
    [InlineData("filled", "filled")]
    [InlineData("canceled", "cancelled")]
    [InlineData("mmp_canceled", "cancelled")]
    [InlineData("something_new", null)]
    [InlineData("", null)]
    public void Okx_states_are_put_in_the_tables_words(string state, string? expected)
    {
        Assert.Equal(expected, OrderMirror.MapState(state));
    }

    [Fact]
    public async Task A_state_the_app_does_not_know_changes_nothing()
    {
        var id = PlaceThroughGate("toolu_01");
        _exchange.OpenOrders["SPOT"].Add(Order("9001", id, state: "live"));
        await _mirror.RunOnceAsync(Ct);
        _exchange.OpenOrders["SPOT"][0] = Order("9001", id, state: "something_new");
        _exchange.OpenOrders["SPOT"].Add(Order("9002", string.Empty, state: "something_new"));

        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(new MirrorPass(true), pass);
        Assert.Equal("open", Text("status", id));
        Assert.Equal(1, Scalar<long>("SELECT count(*) FROM orders;"));
    }

    // ---- orders that were never placed ----

    [Fact]
    public async Task A_pending_row_the_exchange_does_not_know_after_its_time_is_closed_as_not_placed()
    {
        var id = PlaceThroughGate("toolu_01");
        _time.Advance(RiskGate.StubLifetime + TimeSpan.FromSeconds(1));

        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(1, pass.Closed);
        // Kept as the record of the attempt, not deleted.
        Assert.Equal("rejected", Text("status", id));
        Assert.Equal("not_placed", Summary("toolu_01").GetProperty("status").GetString());
        Assert.Single(Events());
        Assert.Equal("Order for BTC-USDT was not placed", Assert.Single(_toasts.Shown).Title);
        // Once: the next pass finds nothing left to close.
        Assert.Equal(0, (await _mirror.RunOnceAsync(Ct)).Closed);
    }

    [Fact]
    public async Task A_pending_row_whose_time_is_not_up_is_left_alone()
    {
        var id = PlaceThroughGate("toolu_01");
        _time.Advance(RiskGate.StubLifetime - TimeSpan.FromSeconds(5));

        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(0, pass.Closed);
        Assert.Equal("pending", Text("status", id));
        Assert.NotNull(_stubs.Find(id));
    }

    [Theory]
    [InlineData(OkxFailure.Network)]
    [InlineData(OkxFailure.Credentials)]
    [InlineData(OkxFailure.RateLimited)]
    [InlineData(OkxFailure.Rejected)]
    public async Task Nothing_is_closed_in_a_pass_that_could_not_ask_the_exchange(OkxFailure failure)
    {
        var id = PlaceThroughGate("toolu_01");
        _time.Advance(TimeSpan.FromHours(1));
        _exchange.OrdersFailure = new OkxException(failure, "OKX did not answer.");

        var pass = await _mirror.RunOnceAsync(Ct);

        // Not knowing is not the same as "not placed".
        Assert.Equal(new MirrorPass(false, RateLimited: failure == OkxFailure.RateLimited), pass);
        Assert.Equal("pending", Text("status", id));
        Assert.Empty(_toasts.Shown);
    }

    [Fact]
    public async Task A_row_closed_as_not_placed_is_corrected_when_the_exchange_shows_the_order_after_all()
    {
        var id = PlaceThroughGate("toolu_01");
        _time.Advance(TimeSpan.FromMinutes(10));
        await _mirror.RunOnceAsync(Ct);
        Assert.Equal("rejected", Text("status", id));

        // For example: the mode was switched, the mirror asked the other exchange, and was switched back.
        _exchange.RecentOrders["SPOT"].Add(Order("9001", id, state: "filled", filled: 0.004m, average: 50_000m));
        _time.Advance(TimeSpan.FromMinutes(1));
        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(1, pass.Changed);
        Assert.Equal(("9001", "filled"), (Text("exchange_order_id", id), Text("status", id)));
        Assert.Equal("filled", Summary("toolu_01").GetProperty("status").GetString());
        Assert.Equal(1, Scalar<long>("SELECT count(*) FROM orders;"));
    }

    // ---- algorithmic orders ----

    [Fact]
    public async Task Pending_stop_orders_get_a_row_once()
    {
        _exchange.AlgoOrders.Add(new OkxAlgoOrder("5001", string.Empty, "BTC-USDT", "SPOT", "sell", "conditional", "live", 0.004m, 45_000m, 1_795_400_000_000));
        _exchange.AlgoOrders.Add(new OkxAlgoOrder("5002", string.Empty, "BTC-USDT-SWAP", "SWAP", "sell", "oco", "live", 2m, 0m, 1_795_400_000_000));

        var first = await _mirror.RunOnceAsync(Ct);
        var second = await _mirror.RunOnceAsync(Ct);

        Assert.Equal((2, 0), (first.Added, second.Added));
        Assert.Equal(
            (1L, "conditional", 45_000.0, "open"),
            (Scalar<long>("SELECT is_algo FROM orders WHERE algo_order_id = '5001';"),
             Scalar<string>("SELECT algo_type FROM orders WHERE algo_order_id = '5001';"),
             Scalar<double>("SELECT stop_price FROM orders WHERE algo_order_id = '5001';"),
             Scalar<string>("SELECT status FROM orders WHERE algo_order_id = '5001';")));
        Assert.Null(Scalar<double?>("SELECT stop_price FROM orders WHERE algo_order_id = '5002';"));
    }

    [Fact]
    public async Task A_failure_reading_stop_orders_keeps_what_the_pass_already_did()
    {
        var id = PlaceThroughGate("toolu_01");
        _exchange.OpenOrders["SPOT"].Add(Order("9001", id, state: "live"));
        _exchange.AlgoFailure = new OkxException(OkxFailure.RateLimited, "Too many requests.");

        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(new MirrorPass(true, Added: 0, Changed: 1, Closed: 0, RateLimited: true), pass);
        Assert.Equal("open", Text("status", id));
    }

    // ---- notifications ----

    [Fact]
    public async Task With_trade_notifications_off_nothing_is_recorded_or_shown()
    {
        _settings.SetValue(SettingKeys.NotifyTradeExecutions, false);
        var id = PlaceThroughGate("toolu_01");
        _exchange.RecentOrders["SPOT"].Add(Order("9001", id, state: "filled", filled: 0.004m, average: 50_000m));

        await _mirror.RunOnceAsync(Ct);

        Assert.Empty(_toasts.Shown);
        Assert.Equal(0, Scalar<long>("SELECT count(*) FROM notifications;"));
        // The chat still shows the fill: that is not a notification.
        Assert.Equal("filled", Summary("toolu_01").GetProperty("status").GetString());
    }

    [Fact]
    public async Task With_desktop_notifications_off_the_notification_is_recorded_and_not_shown()
    {
        _settings.SetValue(SettingKeys.NativeNotificationsEnabled, false);
        var id = PlaceThroughGate("toolu_01");
        _exchange.RecentOrders["SPOT"].Add(Order("9001", id, state: "filled", filled: 0.004m, average: 50_000m));

        await _mirror.RunOnceAsync(Ct);

        Assert.Empty(_toasts.Shown);
        Assert.Equal("pending", Scalar<string>("SELECT status FROM notifications;"));
    }

    [Fact]
    public async Task A_toast_that_cannot_be_shown_does_not_lose_the_notification_or_stop_the_mirror()
    {
        _toasts.Failure = new InvalidOperationException("The notification platform is unavailable.");
        var id = PlaceThroughGate("toolu_01");
        _exchange.RecentOrders["SPOT"].Add(Order("9001", id, state: "filled", filled: 0.004m, average: 50_000m));

        var pass = await _mirror.RunOnceAsync(Ct);

        Assert.Equal(1, pass.Changed);
        Assert.Equal("failed", Scalar<string>("SELECT status FROM notifications;"));
    }

    [Fact]
    public async Task Two_changes_of_one_order_within_half_a_minute_give_one_notification()
    {
        var id = PlaceThroughGate("toolu_01");
        _exchange.RecentOrders["SPOT"].Add(Order("9001", id, state: "filled", filled: 0.004m, average: 50_000m));
        await _mirror.RunOnceAsync(Ct);

        // OKX corrects itself: the same order, now cancelled, ten seconds later.
        _exchange.RecentOrders["SPOT"][0] = Order("9001", id, state: "canceled", filled: 0.004m, average: 50_000m);
        _time.Advance(TimeSpan.FromSeconds(10));
        await _mirror.RunOnceAsync(Ct);
        // And again after the window.
        _exchange.RecentOrders["SPOT"][0] = Order("9001", id, state: "filled", filled: 0.004m, average: 50_000m);
        _time.Advance(TimeSpan.FromSeconds(31));
        await _mirror.RunOnceAsync(Ct);

        Assert.Equal(["Order BTC-USDT filled", "Order BTC-USDT filled"], _toasts.Shown.Select(toast => toast.Title));
        Assert.Equal("filled", Text("status", id));
    }

    // ---- the loop ----

    [Fact]
    public async Task Started_the_mirror_asks_at_once_and_stops_when_told()
    {
        _exchange.OpenOrders["SPOT"].Add(Order("9001", string.Empty, state: "live"));

        await _mirror.StartAsync(Ct);
        await _mirror.StartAsync(Ct);
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (Scalar<long>("SELECT count(*) FROM orders;") == 0)
        {
            Assert.True(DateTime.UtcNow < deadline, "The mirror did not run a pass after it was started.");
            await Task.Delay(TimeSpan.FromMilliseconds(20), Ct);
        }

        await _mirror.StopAsync(Ct).WaitAsync(TimeSpan.FromSeconds(10), Ct);
        var reads = _exchange.OrderReads;
        _time.Advance(TimeSpan.FromMinutes(5));
        await Task.Delay(TimeSpan.FromMilliseconds(200), Ct);

        // One pass (two instrument types), and none after the stop, however much time passes.
        Assert.Equal(2, reads);
        Assert.Equal(reads, _exchange.OrderReads);
    }

    [Fact]
    public async Task A_failing_pass_does_not_end_the_mirror()
    {
        _exchange.OrdersFailure = new InvalidOperationException("something nobody thought of");

        await _mirror.StartAsync(Ct);
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (_exchange.OrderReads == 0)
        {
            Assert.True(DateTime.UtcNow < deadline);
            await Task.Delay(TimeSpan.FromMilliseconds(20), Ct);
        }

        _exchange.OrdersFailure = null;
        _exchange.OpenOrders["SPOT"].Add(Order("9001", string.Empty, state: "live"));
        // The loop is waiting for its next turn; move the clock to it.
        deadline = DateTime.UtcNow.AddSeconds(10);
        while (Scalar<long>("SELECT count(*) FROM orders;") == 0)
        {
            Assert.True(DateTime.UtcNow < deadline, "The mirror did not run again after a failed pass.");
            _time.Advance(OrderMirror.Interval);
            await Task.Delay(TimeSpan.FromMilliseconds(20), Ct);
        }

        await _mirror.StopAsync(Ct);
    }

    private static OkxOrder Order(
        string orderId,
        string clientOrderId,
        string state,
        decimal filled = 0,
        decimal average = 0,
        string instrument = "BTC-USDT",
        string type = "SPOT",
        long updatedAt = 1_795_430_000_000) =>
        new(orderId, clientOrderId, instrument, type, "buy", "limit", state, 50_000m, 0.004m, filled, average, 1_795_420_000_000, updatedAt);

    /// <summary>What the risk gate leaves behind when it allows an order: a tool call and a pending row.</summary>
    private string PlaceThroughGate(string toolUseId)
    {
        _messages.AddToolCall(_reply.Id, toolUseId, "okx_spot_place_order", """{"instId":"BTC-USDT"}""");
        var id = ClientOrderId.New(_session.Id);
        _stubs.Insert(new OrderStub(id, "BTC-USDT", "buy", "limit", 0.004m, 50_000m, _session.Id, _reply.Id, toolUseId, _time.GetUtcNow() + RiskGate.StubLifetime));
        return id;
    }

    private JsonElement Summary(string toolUseId)
    {
        var call = _messages.Get(_reply.Id)!.ToolCalls.Single(candidate => candidate.ToolUseId == toolUseId);
        using var document = JsonDocument.Parse(call.ResultSummaryJson!);
        return document.RootElement.Clone();
    }

    /// <summary>The events published since the last call.</summary>
    private List<AgentEvent> Events()
    {
        var events = new List<AgentEvent>();
        while (_subscription.Reader.TryRead(out var item))
        {
            events.Add(item);
        }

        return events;
    }

    private string? Text(string column, string clientOrderId) =>
        Scalar<string?>($"SELECT {column} FROM orders WHERE client_order_id = $id;", clientOrderId);

    private T Scalar<T>(string sql, string? id = null)
    {
        using var connection = _temp.Database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        if (id is not null)
        {
            command.Parameters.AddWithValue("$id", id);
        }

        var value = command.ExecuteScalar();
        if (value is null or DBNull)
        {
            return default!;
        }

        var target = Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T);
        return (T)Convert.ChangeType(value, target, System.Globalization.CultureInfo.InvariantCulture);
    }

    private sealed class FakeToasts : IToastNotifier
    {
#pragma warning disable CS0067 // Part of the interface; nothing here raises it.
        public event EventHandler? Activated;
#pragma warning restore CS0067

        public List<(string Title, string Body)> Shown { get; } = [];

        public Exception? Failure { get; set; }

        public void Show(string title, string body)
        {
            if (Failure is not null)
            {
                throw Failure;
            }

            Shown.Add((title, body));
        }
    }

    /// <summary>A clock a test moves by hand. Waits on it end when it is moved past them.</summary>
    private sealed class ManualTime(DateTimeOffset start) : TimeProvider
    {
        private readonly Lock _sync = new();
        private readonly List<ManualTimer> _timers = [];
        private DateTimeOffset _now = start;

        public override DateTimeOffset GetUtcNow()
        {
            lock (_sync)
            {
                return _now;
            }
        }

        public void Advance(TimeSpan by)
        {
            List<ManualTimer> due;
            lock (_sync)
            {
                _now += by;
                due = [.. _timers.Where(timer => timer.DueAt <= _now)];
                _timers.RemoveAll(timer => timer.DueAt <= _now);
            }

            foreach (var timer in due)
            {
                timer.Fire();
            }
        }

        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            var timer = new ManualTimer(callback, state);
            lock (_sync)
            {
                if (dueTime != Timeout.InfiniteTimeSpan)
                {
                    timer.DueAt = _now + dueTime;
                    _timers.Add(timer);
                }
            }

            return timer;
        }

        private sealed class ManualTimer(TimerCallback callback, object? state) : ITimer
        {
            public DateTimeOffset DueAt { get; set; } = DateTimeOffset.MaxValue;

            public void Fire() => callback(state);

            public bool Change(TimeSpan dueTime, TimeSpan period) => true;

            public void Dispose()
            {
            }

            public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        }
    }
}
