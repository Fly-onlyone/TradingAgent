using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Orders;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Data;
using TradingAgent.Data.News;
using TradingAgent.Data.Notifications;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Okx;
using Xunit;

namespace TradingAgent.Agent.Tests;

/// <summary>An exchange whose price swings like a wave, so that indicators have something to say.</summary>
internal sealed class WaveExchange : IOkxReader
{
    public bool Down { get; set; }

    public static IReadOnlyList<Candle> Wave(int count, double amplitude = 0.08, int period = 40)
    {
        var candles = new List<Candle>(count);
        for (var index = 0; index < count; index++)
        {
            var close = (decimal)(100 * (1 + (amplitude * Math.Sin(2 * Math.PI * index / period))));
            candles.Add(new Candle(index * 3_600_000L, close, close * 1.002m, close * 0.998m, close, 10m));
        }

        return candles;
    }

    public Task<Ticker> GetTickerAsync(string instrumentId, CancellationToken cancellationToken) =>
        Down ? throw new OkxException(OkxFailure.Network, "OKX is not reachable.") : Task.FromResult(new Ticker(instrumentId, 100m, 99.9m, 100.1m, 98m, 104m, 96m, 1234m, 0));

    public Task<IReadOnlyList<Candle>> GetCandlesAsync(string instrumentId, string bar, int limit, CancellationToken cancellationToken) =>
        Down ? throw new OkxException(OkxFailure.Network, "OKX is not reachable.") : Task.FromResult(Wave(limit));

    public Task<OrderBook> GetOrderBookAsync(string instrumentId, int depth, CancellationToken cancellationToken) =>
        Task.FromResult(new OrderBook(instrumentId, [new BookLevel(99.9m, 30m)], [new BookLevel(100.1m, 10m)], 0));

    public Task<IReadOnlyList<Instrument>> GetInstrumentsAsync(string instrumentType, CancellationToken cancellationToken) =>
        Down
            ? throw new OkxException(OkxFailure.Network, "OKX is not reachable.")
            : Task.FromResult<IReadOnlyList<Instrument>>(
            [
                new("BTC-USDT-SWAP", "SWAP", string.Empty, string.Empty, "live", 0.1m, 1m, 1m, ContractValue: 0.01m, ContractMultiplier: 1m, ContractType: "linear"),
                new("BTC-USD-SWAP", "SWAP", string.Empty, string.Empty, "live", 0.1m, 1m, 1m, ContractValue: 100m, ContractMultiplier: 1m, ContractType: "inverse"),
            ]);

    public Task<IReadOnlyList<Ticker>> GetTickersAsync(string instrumentType, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<Ticker>>([]);

    public Task<AccountBalance> GetBalanceAsync(CancellationToken cancellationToken) => Task.FromResult(new AccountBalance(0, []));

    public Task<IReadOnlyList<Position>> GetPositionsAsync(string? instrumentType, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<Position>>([]);

    public Task<IReadOnlyList<OkxOrder>> GetOpenOrdersAsync(string instrumentType, string? instrumentId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<OkxOrder>>([]);

    public Task<IReadOnlyList<OkxOrder>> GetOrderHistoryAsync(string instrumentType, int limit, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<OkxOrder>>([]);

    public Task<IReadOnlyList<OkxAlgoOrder>> GetPendingAlgoOrdersAsync(string instrumentType, string orderType, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<OkxAlgoOrder>>([]);
}

public sealed class TradeLearnerTests : IDisposable
{
    private readonly KnowledgeHarness _harness = new();
    private readonly WaveExchange _exchange = new();
    private readonly TradeRepository _trades;
    private readonly MirrorOrderRepository _orders;
    private readonly TradeLearner _learner;

    public TradeLearnerTests()
    {
        _trades = new TradeRepository(_harness.Database, _harness.Clock);
        _orders = new MirrorOrderRepository(_harness.Database, _harness.Clock);
        _learner = new TradeLearner(_trades, _exchange, _harness.Indexer, _harness.Clock, NullLogger<TradeLearner>.Instance);
    }

    public void Dispose()
    {
        _learner.Dispose();
        _harness.Dispose();
    }

    [Fact]
    public void A_long_is_closed_against_the_average_of_what_was_bought()
    {
        var results = TradeLearner.Compute(
            [
                new Fill("a", "BTC-USDT", "buy", 1, 100, 1000),
                new Fill("b", "BTC-USDT", "buy", 1, 120, 2000),
                new Fill("c", "BTC-USDT", "sell", 0.5, 132, 3000),
                new Fill("d", "BTC-USDT", "sell", 1.5, 99, 4000),
            ],
            _ => 1);

        Assert.Equal(["c", "d"], results.Select(result => result.OrderId));
        // Average entry 110: half a coin sold 22 above it, the rest 11 below it.
        Assert.Equal((110, 132, 11.0, 20.0, "buy", 1000L, 3000L),
            (results[0].EntryPrice, results[0].ExitPrice, Math.Round(results[0].Pnl, 6), Math.Round(results[0].PnlPercent, 6), results[0].OpeningSide, results[0].OpenedAt, results[0].ClosedAt));
        Assert.Equal((-16.5, -10.0), (Math.Round(results[1].Pnl, 6), Math.Round(results[1].PnlPercent, 6)));
    }

    [Fact]
    public void A_spot_sale_of_coins_bought_before_the_app_is_not_a_trade()
    {
        var results = TradeLearner.Compute(
            [
                new Fill("a", "ETH-USDT", "sell", 2, 3000, 1000),
                new Fill("b", "ETH-USDT", "buy", 1, 2900, 2000),
                // Sells more than was bought here: only the one coin bought here is a trade.
                new Fill("c", "ETH-USDT", "sell", 3, 3100, 3000),
                new Fill("d", "ETH-USDT", "sell", 1, 3200, 4000),
            ],
            _ => 1);

        var only = Assert.Single(results);
        Assert.Equal(("c", 200.0), (only.OrderId, Math.Round(only.Pnl, 6)));
    }

    [Fact]
    public void A_swap_counts_in_contracts_can_be_short_and_can_turn_around_in_one_order()
    {
        var results = TradeLearner.Compute(
            [
                new Fill("a", "BTC-USDT-SWAP", "sell", 10, 50_000, 1000),
                // Buys back the ten and five more: closes the short, opens a long of five.
                new Fill("b", "BTC-USDT-SWAP", "buy", 15, 49_000, 2000),
                new Fill("c", "BTC-USDT-SWAP", "sell", 5, 49_490, 3000),
                new Fill("x", "BTC-USD-SWAP", "buy", 1, 50_000, 1000),
                new Fill("y", "BTC-USD-SWAP", "sell", 1, 60_000, 2000),
            ],
            symbol => symbol == "BTC-USDT-SWAP" ? 0.01 : null);

        Assert.Equal(["b", "c"], results.Select(result => result.OrderId));
        // Ten contracts of 0.01 BTC, 1000 lower: 100 gained on the short.
        Assert.Equal((100.0, 2.0, "sell"), (Math.Round(results[0].Pnl, 6), Math.Round(results[0].PnlPercent, 6), results[0].OpeningSide));
        Assert.Equal((24.5, "buy", 2000L), (Math.Round(results[1].Pnl, 6), results[1].OpeningSide, results[1].OpenedAt));
    }

    [Fact]
    public async Task A_pass_writes_each_result_and_its_lesson_once()
    {
        Add("1", "BTC-USDT", "buy", 0.01m, 50_000m, filledAt: 1_000_000);
        var closing = Add("2", "BTC-USDT", "sell", 0.01m, 51_000m, filledAt: 1_000_000 + (5 * 3_600_000));
        Add("3", "BTC-USDT-SWAP", "buy", 10m, 50_000m, filledAt: 2_000_000);
        Add("4", "BTC-USDT-SWAP", "sell", 10m, 49_000m, filledAt: 3_000_000);

        Assert.Equal(2, await _learner.RunOnceAsync(TestContext.Current.CancellationToken));
        Assert.Equal(0, await _learner.RunOnceAsync(TestContext.Current.CancellationToken));

        var trades = _trades.ListTrades(10);
        Assert.Equal([-100.0, 10.0], trades.Select(trade => Math.Round(trade.RealizedPnl!.Value, 6)).Order());
        Assert.Equal(closing, trades.Single(trade => trade.RealizedPnl > 0).Id);
        Assert.Equal(
            "BTC-USDT long closed with a profit of 2 % (10) after 5 hours. Entry 50000, exit 51000.",
            _harness.Database.Query("SELECT lesson_summary FROM trade_lessons WHERE outcome = 'profit';", reader => reader.GetString(0)).Single());
        Assert.Equal(1, _harness.Count("SELECT count(*) FROM trade_lessons WHERE outcome = 'loss' AND side = 'buy' AND symbol = 'BTC-USDT-SWAP';"));
    }

    [Fact]
    public async Task While_okx_cannot_be_asked_spot_is_worked_out_and_swaps_wait()
    {
        Add("1", "BTC-USDT", "buy", 0.01m, 50_000m, filledAt: 1_000_000);
        Add("2", "BTC-USDT", "sell", 0.01m, 51_000m, filledAt: 2_000_000);
        Add("3", "BTC-USDT-SWAP", "buy", 10m, 50_000m, filledAt: 2_000_000);
        Add("4", "BTC-USDT-SWAP", "sell", 10m, 49_000m, filledAt: 3_000_000);
        _exchange.Down = true;

        Assert.Equal(1, await _learner.RunOnceAsync(TestContext.Current.CancellationToken));
        _exchange.Down = false;
        Assert.Equal(1, await _learner.RunOnceAsync(TestContext.Current.CancellationToken));

        Assert.Equal(2, _trades.ListTrades(10).Count);
    }

    [Fact]
    public async Task The_agent_reads_the_closed_trades_and_their_totals()
    {
        Add("1", "BTC-USDT", "buy", 0.01m, 50_000m, filledAt: _harness.Clock.Now.AddHours(-3).ToUnixTimeMilliseconds());
        Add("2", "BTC-USDT", "sell", 0.01m, 51_000m, filledAt: _harness.Clock.Now.AddHours(-1).ToUnixTimeMilliseconds());
        await _learner.RunOnceAsync(TestContext.Current.CancellationToken);

        var outcome = await new GetTradeHistoryTool(_trades, _harness.Clock)
            .InvokeAsync(KnowledgeHarness.Json("{}"), new ToolContext("s", "m", "t"), TestContext.Current.CancellationToken);

        Assert.Contains("\"last_1_days\":{\"realized_pnl\":10,\"trades\":1,\"winning_trades\":1}", outcome.Content, StringComparison.Ordinal);
        Assert.Contains("\"pnl_pct\":2", outcome.Content, StringComparison.Ordinal);
    }

    private string Add(string exchangeId, string symbol, string side, decimal quantity, decimal price, long filledAt) =>
        _orders.Insert(new ExchangeOrder(exchangeId, null, symbol, side, "market", "filled", quantity, quantity, null, price, filledAt, filledAt), null, ownOrder: false);
}

public sealed class PatternMinerTests : IDisposable
{
    private readonly KnowledgeHarness _harness = new();
    private readonly WaveExchange _exchange = new();
    private readonly TradeRepository _trades;
    private readonly PatternMiner _miner;

    public PatternMinerTests()
    {
        _trades = new TradeRepository(_harness.Database, _harness.Clock);
        _miner = new PatternMiner(_trades, _exchange, _harness.Indexer, _harness.Settings, _harness.Clock, NullLogger<PatternMiner>.Instance);
    }

    public void Dispose()
    {
        _miner.Dispose();
        _harness.Dispose();
    }

    [Fact]
    public void A_price_that_swings_shows_what_followed_each_signal()
    {
        var found = PatternMiner.Measure(WaveExchange.Wave(300));

        Assert.NotEmpty(found);
        Assert.All(found, pattern =>
        {
            Assert.True(pattern.Samples >= PatternMiner.MinimumSamples);
            Assert.InRange(pattern.SuccessRate, 0, 1);
        });
        // The wave is the same upside down: what follows an oversold reading mirrors what follows an overbought one.
        var oversold = found.Single(pattern => pattern.Signal == "RSI below 30");
        var overbought = found.Single(pattern => pattern.Signal == "RSI above 70");
        Assert.True(oversold.AverageReturn * overbought.AverageReturn < 0);
        Assert.Equal(1.0, oversold.SuccessRate + overbought.SuccessRate, 6);
        Assert.Equal(oversold.Samples, overbought.Samples, 1.0);
    }

    [Fact]
    public void A_price_that_does_not_move_and_a_short_history_show_nothing()
    {
        Assert.Empty(PatternMiner.Measure(WaveExchange.Wave(300, amplitude: 0)));
        Assert.Empty(PatternMiner.Measure(WaveExchange.Wave(40)));
        Assert.Empty(PatternMiner.Measure([]));
    }

    [Fact]
    public async Task A_pass_stores_the_patterns_of_the_chosen_instruments_in_place_of_the_old_ones()
    {
        _harness.Settings.SetValue(SettingKeys.PatternMiningSymbols, [" sol-usdt ", "SOL-USDT"]);

        var first = await _miner.RunOnceAsync(TestContext.Current.CancellationToken);
        var second = await _miner.RunOnceAsync(TestContext.Current.CancellationToken);

        Assert.True(first > 0);
        Assert.Equal(first, second);
        var stored = _trades.ListPatterns("SOL-USDT");
        Assert.Equal(first, stored.Count);
        Assert.All(stored, pattern => Assert.StartsWith("SOL-USDT 1H: ", pattern.Name, StringComparison.Ordinal));
        Assert.Contains("the price was higher 12 bars later", stored[0].Description, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Mining_runs_on_a_schedule_only_when_switched_on_and_survives_an_exchange_that_is_down()
    {
        Assert.False(_miner.IsDue());
        _harness.Settings.SetValue(SettingKeys.PatternMiningEnabled, true);
        Assert.True(_miner.IsDue());
        _exchange.Down = true;

        Assert.Equal(0, await _miner.RunOnceAsync(TestContext.Current.CancellationToken));

        Assert.False(_miner.IsDue());
        _harness.Clock.Now += TimeSpan.FromHours(_harness.Settings.GetValue(SettingKeys.PatternMiningIntervalHours) + 1);
        Assert.True(_miner.IsDue());
    }

    [Fact]
    public async Task One_call_gives_the_agent_the_whole_picture_of_an_instrument()
    {
        await _miner.RunOnceAsync(TestContext.Current.CancellationToken);
        _harness.News.AddSource("Example", "https://news.example.com/feed");
        _harness.News.Insert(_harness.News.ListSources()[0].Id, new NewArticle("https://news.example.com/a", "Bitcoin rises", "BTC is up.", 1000, ["BTC"]));
        var tool = new AnalyzeMarketTool(_exchange, _harness.News, _trades);

        var outcome = await tool.InvokeAsync(KnowledgeHarness.Json("""{"symbol":"btc-usdt-swap"}"""), new ToolContext("s", "m", "t"), TestContext.Current.CancellationToken);
        var missing = await tool.InvokeAsync(KnowledgeHarness.Json("{}"), new ToolContext("s", "m", "t"), TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Succeeded, outcome.Status);
        Assert.Equal(ToolCallStatus.Failed, missing.Status);
        using var document = System.Text.Json.JsonDocument.Parse(outcome.Content);
        var root = document.RootElement;
        Assert.Equal("BTC-USDT-SWAP", root.GetProperty("symbol").GetString());
        Assert.Equal(["15m", "1H", "4H", "1D"], root.GetProperty("timeframes").EnumerateObject().Select(property => property.Name));
        Assert.True(root.GetProperty("timeframes").GetProperty("1H").TryGetProperty("rsi_14", out _));
        // Thirty waiting to buy against ten waiting to sell.
        Assert.Equal(0.75m, root.GetProperty("order_book").GetProperty("bid_share_top_20").GetDecimal());
        // The patterns of the spot instrument are given for its swap too.
        Assert.StartsWith("BTC-USDT 1H: ", root.GetProperty("past_signals")[0].GetProperty("signal").GetString(), StringComparison.Ordinal);
        Assert.Equal("Bitcoin rises", root.GetProperty("news")[0].GetProperty("title").GetString());
    }
}

public sealed class EmailNotificationTests : IDisposable
{
    private readonly KnowledgeHarness _harness = new();

    public void Dispose() => _harness.Dispose();

    [Fact]
    public void Email_is_ready_only_when_switched_on_with_a_server_and_two_addresses()
    {
        var sender = new SmtpEmailSender(_harness.Settings, _harness.Secrets);
        Assert.False(sender.IsReady);

        _harness.Settings.SetValue(SettingKeys.EmailSmtpHost, "smtp.example.com");
        _harness.Settings.SetValue(SettingKeys.EmailFrom, "agent@example.com");
        _harness.Settings.SetValue(SettingKeys.EmailTo, "not an address");
        _harness.Settings.SetValue(SettingKeys.EmailEnabled, true);
        Assert.False(sender.IsReady);

        _harness.Settings.SetValue(SettingKeys.EmailTo, "me@example.com");
        Assert.True(sender.IsReady);
        _harness.Settings.SetValue(SettingKeys.EmailEnabled, false);
        Assert.False(sender.IsReady);
    }

    [Fact]
    public async Task Sending_without_a_server_says_what_is_missing()
    {
        var sender = new SmtpEmailSender(_harness.Settings, _harness.Secrets);

        var error = await Assert.ThrowsAsync<EmailException>(() => sender.SendAsync("Subject", "Body", TestContext.Current.CancellationToken));

        Assert.StartsWith("Email is not set up", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_notification_goes_out_by_email_when_email_is_ready_and_a_failing_server_loses_nothing()
    {
        var email = new RecordingEmail();
        var notifications = new NotificationService(
            _harness.Database, _harness.Settings, new Toasts(), _harness.Clock, NullLogger<NotificationService>.Instance, email);

        Assert.True(notifications.Notify(new Notification(NotificationKind.TaskCompleted, "Task finished: Review", "All quiet.")));
        Assert.Empty(email.Sent);

        email.IsReady = true;
        notifications.Notify(new Notification(NotificationKind.TaskCompleted, "Task finished: Review", "All quiet."));
        email.Fails = true;
        notifications.Notify(new Notification(NotificationKind.TaskFailed, "Task failed: Review", "No model."));
        await email.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);

        Assert.Equal(("Trading agent: Task finished: Review", "All quiet."), Assert.Single(email.Sent));
        // The notification itself is stored whatever the mail server did.
        Assert.Equal(3, _harness.Count("SELECT count(*) FROM notifications;"));
    }

    private sealed class RecordingEmail : IEmailSender
    {
        public List<(string Subject, string Body)> Sent { get; } = [];

        public TaskCompletionSource Attempted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public bool IsReady { get; set; }

        public bool Fails { get; set; }

        public Task SendAsync(string subject, string body, CancellationToken cancellationToken)
        {
            if (Fails)
            {
                Attempted.TrySetResult();
                throw new EmailException("The mail server refused.");
            }

            Sent.Add((subject, body));
            return Task.CompletedTask;
        }
    }

    private sealed class Toasts : IToastNotifier
    {
#pragma warning disable CS0067 // Part of the interface; nothing here raises it.
        public event EventHandler? Activated;
#pragma warning restore CS0067

        public void Show(string title, string body)
        {
        }
    }
}
