using System.Globalization;
using Microsoft.Data.Sqlite;
using TradingAgent.Core;

namespace TradingAgent.Data.Trading;

/// <summary>An order the risk gate let through, written before the order is sent to the exchange.</summary>
/// <param name="ClientOrderId">The id the gate gave the order; the exchange stores it with the order.</param>
/// <param name="Symbol">The instrument, for example <c>BTC-USDT</c>.</param>
/// <param name="Side"><c>buy</c> or <c>sell</c>.</param>
/// <param name="OrderType"><c>market</c> or <c>limit</c>.</param>
/// <param name="Quantity">The size the gate assessed, in units of the coin.</param>
/// <param name="Price">The limit price; null for a market order.</param>
/// <param name="SessionId">The chat session the order came from.</param>
/// <param name="MessageId">The reply the tool call belongs to.</param>
/// <param name="ToolUseId">The model provider's id of the tool call.</param>
/// <param name="PendingUntil">When the stub may be treated as never having reached the exchange.</param>
public sealed record OrderStub(
    string ClientOrderId,
    string Symbol,
    string Side,
    string OrderType,
    decimal Quantity,
    decimal? Price,
    string SessionId,
    string MessageId,
    string ToolUseId,
    DateTimeOffset PendingUntil);

/// <summary>
/// Writes the placeholder rows of <c>orders</c> that tie an order on the exchange back to the tool call
/// that placed it.
/// </summary>
/// <remarks>
/// A stub is written by the risk gate at the moment it allows an order, so there is a record of every
/// order the app tried to place even if the app dies before the exchange answers. The order mirror
/// later fills the row in from the exchange, found by <see cref="OrderStub.ClientOrderId"/>.
/// <para>
/// The table's unique index on the idempotency key makes a second stub with the same client order id
/// fail; the gate treats that failure as a refusal.
/// </para>
/// </remarks>
public sealed class OrderStubRepository(Database database, TimeProvider time)
{
    /// <summary>Writes the stub. Returns its row id.</summary>
    /// <exception cref="SqliteException">
    /// The client order id is already used, or the session or message does not exist.
    /// </exception>
    public string Insert(OrderStub stub)
    {
        ArgumentNullException.ThrowIfNull(stub);
        var id = Ids.NewId(time.GetUtcNow());
        var now = time.GetUtcNow().ToUnixTimeMilliseconds();

        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO orders (
                id, client_order_id, execution_idempotency_key, symbol, side, order_type, status, quantity, price,
                source, agent_session_id, agent_session_message_id, tool_use_id, pending_until, created_at, updated_at)
            VALUES (
                $id, $client, $client, $symbol, $side, $type, 'pending', $quantity, $price,
                'atk_mirror', $session, $message, $tool, $until, $now, $now);
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$client", stub.ClientOrderId);
        command.Parameters.AddWithValue("$symbol", stub.Symbol);
        command.Parameters.AddWithValue("$side", stub.Side);
        command.Parameters.AddWithValue("$type", stub.OrderType);
        command.Parameters.AddWithValue("$quantity", (double)stub.Quantity);
        command.Parameters.AddWithValue("$price", stub.Price is { } price ? (double)price : DBNull.Value);
        command.Parameters.AddWithValue("$session", stub.SessionId);
        command.Parameters.AddWithValue("$message", stub.MessageId);
        command.Parameters.AddWithValue("$tool", stub.ToolUseId);
        command.Parameters.AddWithValue("$until", stub.PendingUntil.ToUnixTimeMilliseconds());
        command.Parameters.AddWithValue("$now", now);
        command.ExecuteNonQuery();
        return id;
    }

    /// <summary>
    /// Whether this tool call already has an order row. A tool call places one order; a second attempt
    /// under the same call is a repeat, not a new decision of the model.
    /// </summary>
    public bool ExistsForToolCall(string sessionId, string toolUseId)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT EXISTS (SELECT 1 FROM orders WHERE agent_session_id = $session AND tool_use_id = $tool);";
        command.Parameters.AddWithValue("$session", sessionId);
        command.Parameters.AddWithValue("$tool", toolUseId);
        return Convert.ToInt64(command.ExecuteScalar(), CultureInfo.InvariantCulture) != 0;
    }

    /// <summary>The stub with this client order id, or null. Only rows that are still stubs are returned.</summary>
    public OrderStub? Find(string clientOrderId)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT symbol, side, order_type, quantity, price, agent_session_id, agent_session_message_id, tool_use_id, pending_until
            FROM orders
            WHERE execution_idempotency_key = $client AND status = 'pending' AND source = 'atk_mirror' AND exchange_order_id IS NULL;
            """;
        command.Parameters.AddWithValue("$client", clientOrderId);
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return new OrderStub(
            clientOrderId,
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            (decimal)reader.GetDouble(3),
            reader.IsDBNull(4) ? null : (decimal)reader.GetDouble(4),
            reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
            reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
            reader.IsDBNull(7) ? string.Empty : reader.GetString(7),
            DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64(8)));
    }
}
