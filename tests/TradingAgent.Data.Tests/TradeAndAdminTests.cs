using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using TradingAgent.Core;
using TradingAgent.Data.Admin;
using TradingAgent.Data.Knowledge;
using TradingAgent.Data.Logging;
using TradingAgent.Data.Trading;
using Xunit;

namespace TradingAgent.Data.Tests;

public sealed class TradeRepositoryTests : IDisposable
{
    private readonly TempDatabase _temp = new();
    private readonly ManualTimeProvider _time = new(new DateTimeOffset(2026, 11, 23, 12, 0, 0, TimeSpan.Zero));
    private readonly TradeRepository _trades;
    private readonly MirrorOrderRepository _orders;

    public TradeRepositoryTests()
    {
        _trades = new TradeRepository(_temp.Database, _time);
        _orders = new MirrorOrderRepository(_temp.Database, _time);
    }

    public void Dispose() => _temp.Dispose();

    [Fact]
    public void Orders_are_listed_newest_first_and_only_what_was_filled_counts_as_a_fill()
    {
        var bought = Add("1", "BTC-USDT", "buy", "filled", 0.01m, 0.01m, 50_000m, createdAt: 1000);
        Add("2", "BTC-USDT", "sell", "open", 0.01m, 0m, null, createdAt: 2000);
        Add("3", "ETH-USDT", "buy", "cancelled", 1m, 0.4m, 3_000m, createdAt: 3000);

        Assert.Equal(["ETH-USDT", "BTC-USDT", "BTC-USDT"], _trades.ListOrders(10).Select(order => order.Symbol));
        Assert.Equal("sell", Assert.Single(_trades.ListOrders(10, "open")).Side);
        // A cancelled order that was partly filled did buy something.
        Assert.Equal([bought, _orders.Find("3", null)!.Id], _trades.Fills().Select(fill => fill.OrderId));
        Assert.Equal(0.4, _trades.Fills()[1].Quantity);
    }

    [Fact]
    public void A_result_is_written_once_and_adds_up_in_the_summary()
    {
        var sold = Add("2", "BTC-USDT", "sell", "filled", 0.01m, 0.01m, 51_000m, createdAt: 2000);
        var result = new TradeResult(sold, "BTC-USDT", "buy", 50_000, 51_000, 10, 2, 1000, _time.Now.ToUnixTimeMilliseconds());

        Assert.True(_trades.SetResult(result));
        // A later pass must not change what the pages already showed.
        Assert.False(_trades.SetResult(result with { Pnl = 999 }));

        var trade = Assert.Single(_trades.ListTrades(10));
        Assert.Equal((10.0, 2.0, 50_000.0), (trade.RealizedPnl!.Value, trade.RealizedPnlPercent!.Value, trade.EntryPrice!.Value));
        Assert.Equal(new PnlSummary(10, 1, 1), _trades.RealizedSince(_time.Now.AddDays(-1).ToUnixTimeMilliseconds()));
        Assert.Equal(new PnlSummary(0, 0, 0), _trades.RealizedSince(_time.Now.AddDays(1).ToUnixTimeMilliseconds()));

        Assert.True(_trades.InsertLesson(result, "BTC-USDT long closed with a profit of 2 %.", "{}"));
        Assert.False(_trades.InsertLesson(result, "Again.", "{}"));
        Assert.Equal("profit", _temp.Scalar<string>("SELECT outcome FROM trade_lessons;"));
        Assert.Single(new KnowledgeIndex(_temp.Database, _time).Keyword(KnowledgeIndex.Find("trade_lesson")!, "profit", 5));
    }

    [Fact]
    public void A_pattern_replaces_the_one_of_the_same_name_and_is_found_by_its_instrument()
    {
        _trades.ReplacePattern("BTC-USDT 1H: RSI below 30", "indicator", "First.", "{}", 0.5, 6, 0.1, 12, "BTC-USDT", "1H");
        _trades.ReplacePattern("BTC-USDT 1H: RSI below 30", "indicator", "Second.", "{}", 0.7, 12, 0.8, 12, "BTC-USDT", "1H");
        _trades.ReplacePattern("ETH-USDT 1H: RSI above 70", "indicator", "Other.", "{}", 0.4, 20, -0.3, 12, "ETH-USDT", "1H");

        var bitcoin = Assert.Single(_trades.ListPatterns("BTC-USDT"));

        Assert.Equal(("Second.", 0.7, 12), (bitcoin.Description, bitcoin.SuccessRate, bitcoin.SampleCount));
        Assert.Equal(2, _trades.ListPatterns().Count);
        Assert.Empty(_trades.ListPatterns("SOL-USDT"));
    }

    private string Add(string exchangeId, string symbol, string side, string status, decimal quantity, decimal filled, decimal? average, long createdAt) =>
        _orders.Insert(new ExchangeOrder(exchangeId, null, symbol, side, "market", status, quantity, filled, null, average, createdAt, createdAt), null, ownOrder: false);
}

public sealed class AdminStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));
    private readonly ManualTimeProvider _time = new(new DateTimeOffset(2026, 11, 23, 12, 0, 0, TimeSpan.Zero));
    private readonly AppPaths _paths;
    private readonly Database _database;
    private readonly AdminStore _admin;

    public AdminStoreTests()
    {
        _paths = new AppPaths(_root, isDevelopmentBuild: false);
        _paths.EnsureCreated();
        _database = new Database(_paths.DatabaseFile);
        _database.Initialize();
        _admin = new AdminStore(_database, _paths, _time);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
            // A leftover temp folder is harmless.
        }
    }

    [Fact]
    public void The_log_is_read_newest_first_by_level_and_by_text_taken_literally()
    {
        new LogRepository(_database).InsertBatch(
        [
            new LogEntry(1000, LogLevel.Warning, "TradingAgent.Agent.Atk.AtkService", "The trade kit stopped.", null),
            new LogEntry(2000, LogLevel.Error, "TradingAgent.Agent.Runs.AgentRunner", "The run failed 100% of the time.", "System.InvalidOperationException: boom"),
            new LogEntry(3000, LogLevel.Warning, "TradingAgent.Data.RetentionService", "Pruning failed.", null),
        ]);

        Assert.Equal([3000, 2000, 1000], _admin.Logs(null, null, 10).Select(row => row.Timestamp));
        Assert.Equal("The run failed 100% of the time.", Assert.Single(_admin.Logs("error", null, 10)).Message);
        Assert.Equal(2000, Assert.Single(_admin.Logs(null, "boom", 10)).Timestamp);
        Assert.Equal(1000, Assert.Single(_admin.Logs(null, "AtkService", 10)).Timestamp);
        // "%" and "_" are what was typed, not wildcards.
        Assert.Equal(2000, Assert.Single(_admin.Logs(null, "100%", 10)).Timestamp);
        Assert.Empty(_admin.Logs(null, "1_0", 10));
        Assert.Empty(_admin.Logs("warning", "boom", 10));
        Assert.Equal(2, _admin.Logs(null, null, 2).Count);
    }

    [Fact]
    public void The_database_is_described_checked_and_compacted()
    {
        var tables = _admin.Tables();

        Assert.Contains(tables, table => table is { Name: "orders", Rows: 0 });
        Assert.Contains(tables, table => table.Name == "agent_sessions");
        Assert.DoesNotContain(tables, table => table.Name.Contains("_fts", StringComparison.Ordinal));
        Assert.True(_admin.FileSize() > 0);
        Assert.Equal("ok", _admin.CheckIntegrity());
        _admin.Compact();
        Assert.Equal("ok", _admin.CheckIntegrity());
    }

    [Fact]
    public void A_backup_is_restored_at_the_next_start_and_the_replaced_database_is_kept()
    {
        var memories = new MemoryRepository(_database, _time);
        memories.Add("general", "In the backup.");
        var backup = _admin.BackUp();
        memories.Add("general", "After the backup.");
        Assert.Equal(backup.Path, Assert.Single(_admin.Backups()).Path);
        Assert.Null(_admin.PendingRestore);

        Assert.True(_admin.RequestRestore(backup.Path));
        Assert.Equal(backup.Path, _admin.PendingRestore);
        // Nothing happened yet: the app is still running.
        Assert.Equal(2, memories.List(null, 10).Count);

        // The app closes; the next start puts the backup in place before it opens the database.
        SqliteConnection.ClearAllPools();
        Assert.True(AdminStore.ApplyPendingRestore(_paths));

        var restored = new Database(_paths.DatabaseFile);
        restored.Initialize();
        Assert.Equal("In the backup.", Assert.Single(new MemoryRepository(restored, _time).List(null, 10)).Content);
        Assert.True(File.Exists(_paths.DatabaseFile + ".before-restore"));
        Assert.False(File.Exists(_paths.RestoreMarkerFile));
        // Asked once, done once.
        Assert.False(AdminStore.ApplyPendingRestore(_paths));
    }

    [Fact]
    public void Only_a_backup_of_this_app_is_restored_or_deleted()
    {
        var outside = Path.Combine(_root, "elsewhere.db");
        File.Copy(_admin.BackUp().Path, outside);
        Directory.CreateDirectory(_paths.BackupDirectory);
        var notSqlite = Path.Combine(_paths.BackupDirectory, "notes.db");
        File.WriteAllText(notSqlite, "This is not a database.");

        Assert.False(_admin.RequestRestore(outside));
        Assert.False(_admin.RequestRestore(notSqlite));
        Assert.False(_admin.RequestRestore(Path.Combine(_paths.BackupDirectory, "missing.db")));
        Assert.False(_admin.DeleteBackup(outside));
        Assert.True(File.Exists(outside));
        Assert.Null(_admin.PendingRestore);

        // A marker that somebody pointed at another file is not obeyed either.
        File.WriteAllText(_paths.RestoreMarkerFile, outside);
        SqliteConnection.ClearAllPools();
        Assert.False(AdminStore.ApplyPendingRestore(_paths));
        Assert.False(File.Exists(_paths.DatabaseFile + ".before-restore"));
    }

    [Fact]
    public void A_restore_can_be_called_off_and_deleting_the_backup_calls_it_off_too()
    {
        _time.Now += TimeSpan.FromSeconds(1);
        var first = _admin.BackUp();
        _time.Now += TimeSpan.FromSeconds(1);
        var second = _admin.BackUp();

        _admin.RequestRestore(first.Path);
        _admin.CancelRestore();
        Assert.Null(_admin.PendingRestore);

        _admin.RequestRestore(second.Path);
        Assert.True(_admin.DeleteBackup(second.Path));
        Assert.Null(_admin.PendingRestore);
        Assert.Equal(first.Name, Assert.Single(_admin.Backups()).Name);
    }

    [Fact]
    public void A_kind_of_data_is_deleted_as_a_whole_and_nothing_else_is()
    {
        var memories = new MemoryRepository(_database, _time);
        memories.Add("general", "One.");
        memories.Add("general", "Two.");
        new StrategyRepository(_database, _time).Save(new StrategyDraft("Kept", "Not deleted."));

        Assert.Equal(2, _admin.Categories().Single(category => category.Key == "memories").Rows);
        Assert.Equal(2, _admin.Delete("memories"));

        Assert.Empty(memories.List(null, 10));
        // Both rows of the one strategy are counted under its kind.
        Assert.Equal(2, _admin.Categories().Single(category => category.Key == "strategies").Rows);
        Assert.Equal(-1, _admin.Delete("orders; DROP TABLE orders"));
        Assert.Equal(2, _admin.Delete("strategies"));
    }
}
