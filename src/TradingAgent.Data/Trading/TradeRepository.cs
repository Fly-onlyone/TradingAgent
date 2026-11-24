using Microsoft.Data.Sqlite;
using TradingAgent.Core;

namespace TradingAgent.Data.Trading;

/// <summary>An order as the Orders and Trades pages show it.</summary>
public sealed record OrderRow(
    string Id,
    string Symbol,
    string Side,
    string OrderType,
    string Status,
    double Quantity,
    double FilledQuantity,
    double? Price,
    double? AverageFillPrice,
    long CreatedAt,
    long? FilledAt,
    bool IsAlgo,
    double? EntryPrice,
    double? RealizedPnl,
    double? RealizedPnlPercent,
    long? ClosedAt,
    string? SessionId);

/// <summary>What an order bought or sold, for working out profit and loss.</summary>
public sealed record Fill(string OrderId, string Symbol, string Side, double Quantity, double Price, long FilledAt);

/// <summary>What closing (part of) a position with one order came to.</summary>
/// <param name="OrderId">The order that closed.</param>
/// <param name="Symbol">The instrument.</param>
/// <param name="OpeningSide">The side that opened the position: buy for a long, sell for a short.</param>
/// <param name="EntryPrice">The average price the closed part was opened at.</param>
/// <param name="ExitPrice">The price it was closed at.</param>
/// <param name="Pnl">Profit, or loss when negative, in the quote currency. Fees are not counted.</param>
/// <param name="PnlPercent">The same as a percentage of the entry.</param>
/// <param name="OpenedAt">When the position was opened.</param>
/// <param name="ClosedAt">When this order closed it.</param>
public sealed record TradeResult(
    string OrderId,
    string Symbol,
    string OpeningSide,
    double EntryPrice,
    double ExitPrice,
    double Pnl,
    double PnlPercent,
    long OpenedAt,
    long ClosedAt);

/// <summary>Realized profit and loss over a period.</summary>
public sealed record PnlSummary(double Pnl, int Trades, int Wins);

/// <summary>A price pattern and how it did in the past.</summary>
public sealed record PatternRow(
    string Name,
    string Description,
    double SuccessRate,
    int SampleCount,
    double AverageReturn,
    IReadOnlyList<string> Symbols,
    long? LastValidated);

/// <summary>Orders and closed trades as the pages and the agent read them, and what is learned from them.</summary>
public sealed class TradeRepository(Database database, TimeProvider time)
{
    private const string OrderColumns =
        """
        id, symbol, side, order_type, status, quantity, filled_quantity, price, avg_fill_price, created_at, filled_at,
        is_algo, entry_price, realized_pnl, realized_pnl_percent, closed_at, agent_session_id
        """;

    /// <summary>The newest orders, of one status or of all. Placeholder rows of placements still on their way are left out.</summary>
    public IReadOnlyList<OrderRow> ListOrders(int limit, string? status = null) =>
        database.Query(
            $"""
             SELECT {OrderColumns} FROM orders
             WHERE ($status IS NULL OR status = $status) AND pending_until IS NULL
             ORDER BY created_at DESC, id DESC
             LIMIT $limit;
             """,
            ReadOrder,
            ("$status", status),
            ("$limit", limit));

    /// <summary>The newest orders that closed a position, with what they came to.</summary>
    public IReadOnlyList<OrderRow> ListTrades(int limit) =>
        database.Query(
            $"SELECT {OrderColumns} FROM orders WHERE realized_pnl IS NOT NULL ORDER BY closed_at DESC, id DESC LIMIT $limit;",
            ReadOrder,
            ("$limit", limit));

    /// <summary>Everything that was bought or sold, oldest first.</summary>
    public IReadOnlyList<Fill> Fills() =>
        database.Query(
            """
            SELECT id, symbol, side, filled_quantity, avg_fill_price, coalesce(filled_at, updated_at) FROM orders
            WHERE filled_quantity > 0 AND avg_fill_price IS NOT NULL AND avg_fill_price > 0 AND is_algo = 0
            ORDER BY coalesce(filled_at, updated_at), id;
            """,
            reader => new Fill(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetDouble(3), reader.GetDouble(4), reader.GetInt64(5)));

    /// <summary>Writes what a closing order came to. False when it is written already: a result is never changed.</summary>
    public bool SetResult(TradeResult result)
    {
        ArgumentNullException.ThrowIfNull(result);
        return database.Execute(
            """
            UPDATE orders SET
                entry_price = $entry, exit_price = $exit, realized_pnl = $pnl, realized_pnl_percent = $percent, net_pnl = $pnl,
                trade_status = 'closed', closed_at = $closed
            WHERE id = $id AND realized_pnl IS NULL;
            """,
            ("$id", result.OrderId),
            ("$entry", result.EntryPrice),
            ("$exit", result.ExitPrice),
            ("$pnl", result.Pnl),
            ("$percent", result.PnlPercent),
            ("$closed", result.ClosedAt)) > 0;
    }

    /// <summary>Realized profit and loss of the trades closed at or after <paramref name="sinceMs"/>.</summary>
    public PnlSummary RealizedSince(long sinceMs) =>
        database.First(
            """
            SELECT coalesce(sum(realized_pnl), 0), count(*), coalesce(sum(realized_pnl > 0), 0) FROM orders
            WHERE realized_pnl IS NOT NULL AND closed_at >= $since;
            """,
            reader => new PnlSummary(reader.GetDouble(0), reader.GetInt32(1), reader.GetInt32(2)),
            ("$since", sinceMs)) ?? new PnlSummary(0, 0, 0);

    /// <summary>Stores what a closed trade teaches. False when the order has a lesson already.</summary>
    public bool InsertLesson(TradeResult result, string summary, string contextJson)
    {
        ArgumentNullException.ThrowIfNull(result);
        var now = time.GetUtcNow();
        return database.Execute(
            """
            INSERT OR IGNORE INTO trade_lessons (
                id, order_id, outcome, profit_pct, profit_amount, lesson_summary, market_context, symbol, side,
                entry_price, exit_price, duration_minutes, created_at)
            VALUES ($id, $order, $outcome, $percent, $amount, $summary, $context, $symbol, $side, $entry, $exit, $minutes, $now);
            """,
            ("$id", Ids.NewId(now)),
            ("$order", result.OrderId),
            ("$outcome", Math.Abs(result.PnlPercent) < 0.1 ? "breakeven" : result.Pnl > 0 ? "profit" : "loss"),
            ("$percent", result.PnlPercent),
            ("$amount", result.Pnl),
            ("$summary", summary),
            ("$context", contextJson),
            ("$symbol", result.Symbol),
            ("$side", result.OpeningSide),
            ("$entry", result.EntryPrice),
            ("$exit", result.ExitPrice),
            ("$minutes", Math.Max(0, (result.ClosedAt - result.OpenedAt) / 60_000)),
            ("$now", now.ToUnixTimeMilliseconds())) > 0;
    }

    /// <summary>Stores a pattern in place of an earlier one of the same name.</summary>
    public void ReplacePattern(
        string name,
        string type,
        string description,
        string conditionsJson,
        double successRate,
        int sampleCount,
        double averageReturn,
        int durationHours,
        string symbol,
        string timeframe)
    {
        var now = time.GetUtcNow();
        database.Execute(
            """
            DELETE FROM trading_patterns WHERE pattern_name = $name;
            INSERT INTO trading_patterns (
                id, pattern_name, pattern_type, description, conditions, success_rate, sample_count, avg_return,
                avg_duration_hours, symbols, timeframes, created_at, last_validated)
            VALUES ($id, $name, $type, $description, $conditions, $rate, $samples, $return, $hours, $symbols, $timeframes, $now, $now);
            """,
            ("$id", Ids.NewId(now)),
            ("$name", name),
            ("$type", type),
            ("$description", description),
            ("$conditions", conditionsJson),
            ("$rate", successRate),
            ("$samples", sampleCount),
            ("$return", averageReturn),
            ("$hours", durationHours),
            ("$symbols", JsonText.List([symbol])),
            ("$timeframes", JsonText.List([timeframe])),
            ("$now", now.ToUnixTimeMilliseconds()));
    }

    /// <summary>The patterns found, of one instrument or of all, the most reliable first.</summary>
    public IReadOnlyList<PatternRow> ListPatterns(string? symbol = null, int limit = 50) =>
        database.Query(
            """
            SELECT pattern_name, description, success_rate, sample_count, avg_return, symbols, last_validated FROM trading_patterns
            WHERE $symbol IS NULL OR EXISTS (SELECT 1 FROM json_each(symbols) WHERE value = $symbol)
            ORDER BY sample_count >= 10 DESC, abs(success_rate - 0.5) DESC
            LIMIT $limit;
            """,
            reader => new PatternRow(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetDouble(2),
                reader.GetInt32(3),
                reader.GetDouble(4),
                JsonText.ReadList(reader.Text(5)),
                reader.Whole(6)),
            ("$symbol", symbol),
            ("$limit", limit));

    private static OrderRow ReadOrder(SqliteDataReader reader) => new(
        reader.GetString(0),
        reader.GetString(1),
        reader.GetString(2),
        reader.GetString(3),
        reader.GetString(4),
        reader.GetDouble(5),
        reader.GetDouble(6),
        reader.Real(7),
        reader.Real(8),
        reader.GetInt64(9),
        reader.Whole(10),
        reader.GetInt64(11) == 1,
        reader.Real(12),
        reader.Real(13),
        reader.Real(14),
        reader.Whole(15),
        reader.Text(16));
}
