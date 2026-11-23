using System.Globalization;
using Microsoft.Data.Sqlite;
using TradingAgent.Core;

namespace TradingAgent.Data.Trading;

/// <summary>A row of <c>orders</c> as the order mirror needs it.</summary>
/// <param name="Id">The row's id.</param>
/// <param name="ExchangeOrderId">OKX's id; null while the row is a stub the exchange has not answered for.</param>
/// <param name="ClientOrderId">The id the order was sent with; null when it had none.</param>
/// <param name="Symbol">The instrument.</param>
/// <param name="Side"><c>buy</c> or <c>sell</c>.</param>
/// <param name="Status">One of the statuses of the <c>orders</c> table.</param>
/// <param name="Quantity">Ordered size, as OKX reports it once the exchange has answered.</param>
/// <param name="FilledQuantity">Filled size, as OKX reports it.</param>
/// <param name="AverageFillPrice">Null until something is filled.</param>
/// <param name="SessionId">The chat session the order came from; null for an order placed elsewhere.</param>
/// <param name="ToolUseId">The tool call that placed it; null for an order placed elsewhere.</param>
public sealed record MirroredOrder(
    string Id,
    string? ExchangeOrderId,
    string? ClientOrderId,
    string Symbol,
    string Side,
    string Status,
    decimal Quantity,
    decimal FilledQuantity,
    decimal? AverageFillPrice,
    string? SessionId,
    string? ToolUseId);

/// <summary>What the exchange says about an order, in the words of the <c>orders</c> table.</summary>
public sealed record ExchangeOrder(
    string ExchangeOrderId,
    string? ClientOrderId,
    string Symbol,
    string Side,
    string OrderType,
    string Status,
    decimal Quantity,
    decimal FilledQuantity,
    decimal? Price,
    decimal? AverageFillPrice,
    long CreatedAt,
    long UpdatedAt);

/// <summary>A pending stop, trigger or other algorithmic order on the exchange.</summary>
public sealed record ExchangeAlgoOrder(
    string AlgoId,
    string? ClientAlgoId,
    string Symbol,
    string Side,
    string? AlgoType,
    decimal Quantity,
    decimal? TriggerPrice,
    long CreatedAt);

/// <summary>Keeps <c>orders</c> in step with the exchange. Used by the order mirror only.</summary>
/// <remarks>
/// Sizes and prices in a row the exchange has answered for are the exchange's own numbers, as it
/// reports them: for a swap the size is a number of contracts, not of coins.
/// </remarks>
public sealed class MirrorOrderRepository(Database database, TimeProvider time)
{
    private const string Columns =
        "id, exchange_order_id, client_order_id, symbol, side, status, quantity, filled_quantity, avg_fill_price, agent_session_id, tool_use_id";

    /// <summary>
    /// The row for an order of the exchange: by the exchange's id, or else by the client order id,
    /// which is how a stub written by the risk gate is found.
    /// </summary>
    public MirroredOrder? Find(string exchangeOrderId, string? clientOrderId)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        // The exchange's id first: a client order id can be reused once its order is finished.
        command.CommandText =
            $"""
             SELECT {Columns} FROM orders
             WHERE exchange_order_id = $exchange OR ($client IS NOT NULL AND execution_idempotency_key = $client)
             ORDER BY (exchange_order_id = $exchange) DESC
             LIMIT 1;
             """;
        command.Parameters.AddWithValue("$exchange", exchangeOrderId);
        command.Parameters.AddWithValue("$client", string.IsNullOrEmpty(clientOrderId) ? DBNull.Value : clientOrderId);
        using var reader = command.ExecuteReader();
        return reader.Read() ? Read(reader) : null;
    }

    /// <summary>Adds an order the app has no row for. Returns the row's id.</summary>
    /// <param name="order">The order as the exchange reports it.</param>
    /// <param name="sessionId">The session its client order id names, when that session exists; else null.</param>
    /// <param name="ownOrder">
    /// True when the client order id was made by this app's risk gate. Only such an id is kept as the
    /// row's unique key: ids chosen elsewhere may repeat, and a repeat must not stop the mirror.
    /// </param>
    public string Insert(ExchangeOrder order, string? sessionId, bool ownOrder)
    {
        ArgumentNullException.ThrowIfNull(order);
        var id = Ids.NewId(time.GetUtcNow());
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO orders (
                id, exchange_order_id, client_order_id, execution_idempotency_key, symbol, side, order_type, status,
                quantity, filled_quantity, price, avg_fill_price, source, agent_session_id, created_at, updated_at, filled_at)
            VALUES (
                $id, $exchange, $client, $key, $symbol, $side, $type, $status,
                $quantity, $filled, $price, $average, 'atk_mirror', $session, $created, $updated, $filledAt);
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$exchange", order.ExchangeOrderId);
        command.Parameters.AddWithValue("$client", string.IsNullOrEmpty(order.ClientOrderId) ? DBNull.Value : order.ClientOrderId);
        command.Parameters.AddWithValue("$key", ownOrder && !string.IsNullOrEmpty(order.ClientOrderId) ? order.ClientOrderId : DBNull.Value);
        command.Parameters.AddWithValue("$symbol", order.Symbol);
        command.Parameters.AddWithValue("$side", order.Side);
        command.Parameters.AddWithValue("$type", order.OrderType);
        command.Parameters.AddWithValue("$status", order.Status);
        command.Parameters.AddWithValue("$quantity", (double)order.Quantity);
        command.Parameters.AddWithValue("$filled", (double)order.FilledQuantity);
        command.Parameters.AddWithValue("$price", Real(order.Price));
        command.Parameters.AddWithValue("$average", Real(order.AverageFillPrice));
        command.Parameters.AddWithValue("$session", (object?)sessionId ?? DBNull.Value);
        command.Parameters.AddWithValue("$created", order.CreatedAt);
        command.Parameters.AddWithValue("$updated", time.GetUtcNow().ToUnixTimeMilliseconds());
        command.Parameters.AddWithValue("$filledAt", order.Status == "filled" ? order.UpdatedAt : DBNull.Value);
        command.ExecuteNonQuery();
        return id;
    }

    /// <summary>
    /// Brings a row up to what the exchange says. A stub becomes a real order here: it gets the
    /// exchange's id and numbers and is no longer waiting to expire.
    /// </summary>
    public void Update(string id, ExchangeOrder order)
    {
        ArgumentNullException.ThrowIfNull(order);
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            UPDATE orders SET
                exchange_order_id = $exchange, symbol = $symbol, side = $side, order_type = $type, status = $status,
                quantity = $quantity, filled_quantity = $filled, price = coalesce($price, price), avg_fill_price = coalesce($average, avg_fill_price),
                pending_until = NULL, updated_at = $updated,
                filled_at = CASE WHEN $status = 'filled' THEN coalesce(filled_at, $filledAt) ELSE filled_at END
            WHERE id = $id;
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$exchange", order.ExchangeOrderId);
        command.Parameters.AddWithValue("$symbol", order.Symbol);
        command.Parameters.AddWithValue("$side", order.Side);
        command.Parameters.AddWithValue("$type", order.OrderType);
        command.Parameters.AddWithValue("$status", order.Status);
        command.Parameters.AddWithValue("$quantity", (double)order.Quantity);
        command.Parameters.AddWithValue("$filled", (double)order.FilledQuantity);
        command.Parameters.AddWithValue("$price", Real(order.Price));
        command.Parameters.AddWithValue("$average", Real(order.AverageFillPrice));
        command.Parameters.AddWithValue("$updated", time.GetUtcNow().ToUnixTimeMilliseconds());
        command.Parameters.AddWithValue("$filledAt", order.UpdatedAt);
        command.ExecuteNonQuery();
    }

    /// <summary>Whether a row exists for this algorithmic order.</summary>
    public bool AlgoExists(string algoId)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT EXISTS (SELECT 1 FROM orders WHERE algo_order_id = $algo);";
        command.Parameters.AddWithValue("$algo", algoId);
        return Convert.ToInt64(command.ExecuteScalar(), CultureInfo.InvariantCulture) != 0;
    }

    /// <summary>Adds a pending algorithmic order.</summary>
    public void InsertAlgo(ExchangeAlgoOrder order, string? sessionId)
    {
        ArgumentNullException.ThrowIfNull(order);
        var now = time.GetUtcNow();
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO orders (
                id, client_order_id, symbol, side, order_type, status, quantity, stop_price, source, agent_session_id,
                is_algo, algo_order_id, algo_type, created_at, updated_at)
            VALUES (
                $id, $client, $symbol, $side, 'limit', 'open', $quantity, $stop, 'atk_mirror', $session,
                1, $algo, $algoType, $created, $updated);
            """;
        command.Parameters.AddWithValue("$id", Ids.NewId(now));
        command.Parameters.AddWithValue("$client", string.IsNullOrEmpty(order.ClientAlgoId) ? DBNull.Value : order.ClientAlgoId);
        command.Parameters.AddWithValue("$symbol", order.Symbol);
        command.Parameters.AddWithValue("$side", order.Side);
        command.Parameters.AddWithValue("$quantity", (double)order.Quantity);
        command.Parameters.AddWithValue("$stop", Real(order.TriggerPrice));
        command.Parameters.AddWithValue("$session", (object?)sessionId ?? DBNull.Value);
        command.Parameters.AddWithValue("$algo", order.AlgoId);
        command.Parameters.AddWithValue("$algoType", (object?)order.AlgoType ?? DBNull.Value);
        command.Parameters.AddWithValue("$created", order.CreatedAt);
        command.Parameters.AddWithValue("$updated", now.ToUnixTimeMilliseconds());
        command.ExecuteNonQuery();
    }

    /// <summary>
    /// Closes the stubs whose time ran out before <paramref name="askedAt"/>: the exchange was asked
    /// after their deadline and does not know them, so their orders were never placed.
    /// </summary>
    /// <remarks>
    /// The rows are kept, as <c>rejected</c>: they are the record that the app tried. Should the
    /// exchange show such an order later after all, <see cref="Find"/> still finds the row by its
    /// client order id and <see cref="Update"/> corrects it.
    /// </remarks>
    /// <returns>The stubs that were closed.</returns>
    public IReadOnlyList<MirroredOrder> CloseExpiredStubs(DateTimeOffset askedAt)
    {
        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();
        var closed = new List<MirroredOrder>();
        using (var select = connection.CreateCommand())
        {
            select.Transaction = transaction;
            select.CommandText =
                $"""
                 SELECT {Columns} FROM orders
                 WHERE source = 'atk_mirror' AND status = 'pending' AND exchange_order_id IS NULL
                   AND pending_until IS NOT NULL AND pending_until < $asked;
                 """;
            select.Parameters.AddWithValue("$asked", askedAt.ToUnixTimeMilliseconds());
            using var reader = select.ExecuteReader();
            while (reader.Read())
            {
                closed.Add(Read(reader) with { Status = "rejected" });
            }
        }

        using (var update = connection.CreateCommand())
        {
            update.Transaction = transaction;
            update.CommandText = "UPDATE orders SET status = 'rejected', pending_until = NULL, updated_at = $now WHERE id = $id;";
            update.Parameters.AddWithValue("$now", time.GetUtcNow().ToUnixTimeMilliseconds());
            var id = update.Parameters.Add("$id", SqliteType.Text);
            foreach (var stub in closed)
            {
                id.Value = stub.Id;
                update.ExecuteNonQuery();
            }
        }

        transaction.Commit();
        return closed;
    }

    private static object Real(decimal? value) => value is { } number ? (double)number : DBNull.Value;

    private static MirroredOrder Read(SqliteDataReader reader) =>
        new(
            reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.GetString(5),
            (decimal)reader.GetDouble(6),
            (decimal)reader.GetDouble(7),
            reader.IsDBNull(8) ? null : (decimal)reader.GetDouble(8),
            reader.IsDBNull(9) ? null : reader.GetString(9),
            reader.IsDBNull(10) ? null : reader.GetString(10));
}
