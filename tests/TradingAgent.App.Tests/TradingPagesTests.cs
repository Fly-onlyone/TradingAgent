using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Orders;
using TradingAgent.App.ViewModels;
using TradingAgent.Core;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Core.Tasks;
using TradingAgent.Data.Admin;
using TradingAgent.Data.Knowledge;
using TradingAgent.Data.Logging;
using TradingAgent.Data.Notifications;
using TradingAgent.Data.Tasks;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Okx;
using Xunit;

namespace TradingAgent.App.Tests;

/// <summary>An exchange with one account, one position and a steady price; or one that refuses the key.</summary>
internal sealed class FakeOkx : IOkxReader
{
    public bool NoKey { get; set; }

    public Task<Ticker> GetTickerAsync(string instrumentId, CancellationToken cancellationToken) =>
        instrumentId == "NOPE-USDT"
            ? throw new OkxException(OkxFailure.Rejected, "Instrument ID does not exist")
            : Task.FromResult(new Ticker(instrumentId, 50_000m, 49_999m, 50_001m, 49_000m, 51_000m, 48_500m, 1234m, 0));

    public Task<IReadOnlyList<Candle>> GetCandlesAsync(string instrumentId, string bar, int limit, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Candle>>([.. Enumerable.Range(0, limit).Select(index =>
        {
            var close = 50_000m + (index % 7 * 10);
            return new Candle(index * 3_600_000L, close, close + 20, close - 20, close, 5m);
        })]);

    public Task<AccountBalance> GetBalanceAsync(CancellationToken cancellationToken) =>
        NoKey
            ? throw new OkxException(OkxFailure.Credentials, "No OKX key.")
            : Task.FromResult(new AccountBalance(
                12_345.678m,
                [new AssetBalance("USDT", 10_000m, 9_000m, 10_000m), new AssetBalance("BTC", 0.0469m, 0.0469m, 2_345.67m), new AssetBalance("DUST", 1m, 1m, 0.001m)]));

    public Task<IReadOnlyList<Position>> GetPositionsAsync(string? instrumentType, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Position>>([new Position("BTC-USDT-SWAP", "SWAP", "long", 10m, 49_000m, 50_000m, 100m, 3m)]);

    public Task<OrderBook> GetOrderBookAsync(string instrumentId, int depth, CancellationToken cancellationToken) =>
        Task.FromResult(new OrderBook(instrumentId, [], [], 0));

    public Task<IReadOnlyList<Instrument>> GetInstrumentsAsync(string instrumentType, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<Instrument>>([]);

    public Task<IReadOnlyList<Ticker>> GetTickersAsync(string instrumentType, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<Ticker>>([]);

    public Task<IReadOnlyList<OkxOrder>> GetOpenOrdersAsync(string instrumentType, string? instrumentId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<OkxOrder>>([]);

    public Task<IReadOnlyList<OkxOrder>> GetOrderHistoryAsync(string instrumentType, int limit, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<OkxOrder>>([]);

    public Task<IReadOnlyList<OkxAlgoOrder>> GetPendingAlgoOrdersAsync(string instrumentType, string orderType, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<OkxAlgoOrder>>([]);
}

public sealed class TradingPagesTests : IDisposable
{
    private readonly PagesHarness _pages = new();
    private readonly FakeOkx _okx = new();
    private readonly TradeRepository _trades;
    private readonly MirrorOrderRepository _orders;
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));

    public TradingPagesTests()
    {
        _trades = new TradeRepository(_pages.Agent.Database, TimeProvider.System);
        _orders = new MirrorOrderRepository(_pages.Agent.Database, TimeProvider.System);
    }

    public void Dispose()
    {
        _pages.Dispose();
        if (Directory.Exists(_folder))
        {
            Directory.Delete(_folder, recursive: true);
        }
    }

    [Fact]
    public async Task The_dashboard_shows_the_account_the_positions_and_how_the_closed_trades_went()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        AddOrder("1", "BTC-USDT", "buy", "filled", 50_000m, now - 7_200_000);
        var sold = AddOrder("2", "BTC-USDT", "sell", "filled", 51_000m, now - 3_600_000);
        _trades.SetResult(new TradeResult(sold, "BTC-USDT", "buy", 50_000, 51_000, 10, 2, now - 7_200_000, now - 3_600_000));
        _pages.Tasks.Create(new TaskDraft("Morning review", "Review.", [TaskSchedule.Every(60)]));
        _pages.Agent.Settings.SetValue(SettingKeys.EmergencyStopActive, true);
        var page = new DashboardViewModel(_okx, _trades, _pages.Tasks, _pages.Agent.Settings, TimeProvider.System, action => action());

        // Before OKX answered: what the app has stored is there already.
        Assert.Equal("–", page.Equity);
        Assert.Contains("1 of 1 won", page.PnlDay, StringComparison.Ordinal);
        Assert.Equal(2, page.RecentOrders.Count);
        Assert.StartsWith("1 of 1 tasks active. Next: Morning review", page.TaskLine, StringComparison.Ordinal);
        Assert.True(page.EmergencyStop);

        await page.RefreshAsync();

        Assert.Equal("Demo trading", page.Status);
        Assert.StartsWith("$12", page.Equity, StringComparison.Ordinal);
        // The dust is left out; the largest holding comes first.
        Assert.Equal(["USDT", "BTC"], page.Assets.Select(row => row.A));
        var position = Assert.Single(page.Positions);
        Assert.Equal(("BTC-USDT-SWAP", "long", "3x", true), (position.A, position.B, position.G, position.IsGood));
        Assert.True(page.HasPositions);
    }

    [Fact]
    public async Task Without_a_key_the_dashboard_says_so_and_keeps_what_it_has()
    {
        _okx.NoKey = true;
        _pages.Agent.Settings.SetValue(SettingKeys.OkxSandbox, false);
        var page = new DashboardViewModel(_okx, _trades, _pages.Tasks, _pages.Agent.Settings, TimeProvider.System, action => action());

        await page.RefreshAsync();

        Assert.Equal("LIVE trading. No OKX key is saved, or OKX refused it. Save the key in Settings.", page.Status);
        Assert.Equal("–", page.Equity);
        Assert.Equal("no closed trades", page.PnlMonth);
        Assert.Equal("No scheduled tasks.", page.TaskLine);
    }

    [Fact]
    public async Task The_trading_page_shows_the_chart_and_the_figures_of_an_instrument()
    {
        using var page = new TradingViewModel(_okx, action => action());
        page.Symbol = " btc-usdt ";

        await page.LoadAsync();

        Assert.Equal("BTC-USDT", page.Symbol);
        Assert.Equal(300, page.Candles.Count);
        Assert.Contains("%", page.Price, StringComparison.Ordinal);
        Assert.True(page.IsRising);
        Assert.StartsWith("24 h: low", page.Day, StringComparison.Ordinal);
        Assert.StartsWith("1H: trend", page.Indicators, StringComparison.Ordinal);
        Assert.Equal(string.Empty, page.Status);

        page.Symbol = "NOPE-USDT";
        await page.LoadAsync();

        // The last good chart stays; the problem is said next to it.
        Assert.Equal("Instrument ID does not exist", page.Status);
        Assert.Equal(300, page.Candles.Count);
    }

    [Fact]
    public async Task Orders_are_listed_filtered_and_refreshed_from_okx()
    {
        AddOrder("1", "BTC-USDT", "buy", "filled", 50_000m, 1000);
        AddOrder("2", "ETH-USDT", "sell", "open", null, 2000);
        var page = new OrdersViewModel(_trades, NewMirror(), action => action());

        Assert.Equal(["ETH-USDT", "BTC-USDT"], page.Orders.Select(row => row.B));
        Assert.Equal(("sell", "market", "open"), (page.Orders[0].C, page.Orders[0].D, page.Orders[0].G));
        Assert.True(page.Orders[1].IsGood);

        page.Filter = "filled";
        Assert.Equal("BTC-USDT", Assert.Single(page.Orders).B);
        page.Filter = "rejected";
        Assert.Empty(page.Orders);
        Assert.StartsWith("No orders yet.", page.Status, StringComparison.Ordinal);

        await page.RefreshAsync();
        Assert.False(string.IsNullOrEmpty(page.Status));
    }

    [Fact]
    public async Task Trades_show_what_each_came_to_and_what_past_signals_were_worth()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        AddOrder("1", "BTC-USDT", "buy", "filled", 50_000m, now - 7_200_000);
        AddOrder("2", "BTC-USDT", "sell", "filled", 49_000m, now - 3_600_000);
        using var learner = new TradeLearner(_trades, _okx, _pages.Indexer, TimeProvider.System, NullLogger<TradeLearner>.Instance);
        using var miner = new PatternMiner(_trades, _okx, _pages.Indexer, _pages.Agent.Settings, TimeProvider.System, NullLogger<PatternMiner>.Instance);
        _trades.ReplacePattern("BTC-USDT 1H: RSI below 30", "indicator", "Text.", "{}", 0.75, 12, 1.5, 12, "BTC-USDT", "1H");
        var page = new TradesViewModel(_trades, learner, miner, TimeProvider.System, action => action());
        Assert.Empty(page.Trades);
        Assert.StartsWith("No closed trades yet.", page.Status, StringComparison.Ordinal);

        await page.RefreshAsync();

        var trade = Assert.Single(page.Trades);
        Assert.Equal(("BTC-USDT", "long", true), (trade.B, trade.C, trade.IsBad));
        Assert.Contains("-2.00 %", trade.G, StringComparison.Ordinal);
        Assert.Contains("24 h: -10", page.Summary, StringComparison.Ordinal);
        Assert.Contains("0 of 1 won", page.Summary, StringComparison.Ordinal);
        var pattern = Assert.Single(page.Patterns);
        Assert.Equal(("BTC-USDT 1H: RSI below 30", "75 % higher after 12 bars", "12 cases", true), (pattern.A, pattern.B, pattern.D, pattern.IsGood));
    }

    [Fact]
    public async Task Admin_reads_the_log_backs_up_and_asks_twice_before_a_restore_or_a_delete()
    {
        var paths = new AppPaths(_folder, isDevelopmentBuild: false);
        paths.EnsureCreated();
        var admin = new AdminStore(_pages.Agent.Database, paths, TimeProvider.System);
        new LogRepository(_pages.Agent.Database).InsertBatch(
        [
            new LogEntry(1000, LogLevel.Warning, "TradingAgent.Agent.Atk.AtkService", "The trade kit stopped.", null),
            new LogEntry(2000, LogLevel.Error, "TradingAgent.Agent.Runs.AgentRunner", "The run failed.", "System.InvalidOperationException: boom"),
        ]);
        _pages.Memories.Add("general", "To be deleted.");
        var page = new AdminViewModel(admin, _pages.Agent.Database, action => action());

        Assert.Equal(["AgentRunner", "AtkService"], page.Logs.Select(log => log.Logger));
        page.LogLevel = "error";
        page.SelectedLog = Assert.Single(page.Logs);
        Assert.True(page.SelectedLog.IsError);
        Assert.EndsWith("System.InvalidOperationException: boom", page.LogDetail, StringComparison.Ordinal);
        page.LogLevel = AdminViewModel.AllLevels;
        page.LogQuery = "kit";
        Assert.Equal("AtkService", Assert.Single(page.Logs).Logger);

        Assert.Contains("schema version", page.DatabaseInfo, StringComparison.Ordinal);
        Assert.Contains(page.Tables, table => table.Name == "agent_memories" && table.Rows == 1);
        await page.CheckIntegrityAsync();
        Assert.Equal("The database is sound.", page.DatabaseStatus);

        Assert.False(page.AskRestoreCommand.CanExecute(null));
        await page.BackUpAsync();
        page.SelectedBackup = Assert.Single(page.Backups);
        page.AskRestore();
        // Asked, not done.
        Assert.True(page.ConfirmingRestore);
        Assert.Null(admin.PendingRestore);
        page.CancelRestore();
        Assert.False(page.ConfirmingRestore);
        Assert.Null(admin.PendingRestore);
        page.AskRestore();
        page.ConfirmRestore();
        Assert.Equal(page.SelectedBackup.Source.Path, admin.PendingRestore);
        Assert.Contains("when the app next starts", page.BackupStatus, StringComparison.Ordinal);
        page.CancelRestore();
        Assert.Null(admin.PendingRestore);

        Assert.False(page.AskDeleteCommand.CanExecute(null));
        page.SelectedCategory = page.Categories.Single(category => category.Key == "memories");
        page.AskDelete();
        Assert.True(page.ConfirmingDelete);
        Assert.Single(_pages.Memories.List(null, 10));
        page.CancelDelete();
        Assert.Single(_pages.Memories.List(null, 10));
        page.AskDelete();
        page.ConfirmDelete();
        Assert.Empty(_pages.Memories.List(null, 10));
        Assert.Equal("Deleted 1 rows of: Memories.", page.DataStatus);
        Assert.False(page.ConfirmingDelete);
    }

    private string AddOrder(string exchangeId, string symbol, string side, string status, decimal? price, long at) =>
        _orders.Insert(
            new ExchangeOrder(exchangeId, null, symbol, side, "market", status, 0.01m, status == "filled" ? 0.01m : 0m, null, price, at, at),
            null,
            ownOrder: false);

    private OrderMirror NewMirror() => new(
        _okx,
        _orders,
        _pages.Agent.Sessions,
        _pages.Agent.Messages,
        _pages.Agent.Events,
        new NotificationService(_pages.Agent.Database, _pages.Agent.Settings, new Toasts(), TimeProvider.System, NullLogger<NotificationService>.Instance),
        TimeProvider.System,
        NullLogger<OrderMirror>.Instance);

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
