using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Atk;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Hosting;
using TradingAgent.Data.Agent;
using TradingAgent.Data.Notifications;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.Agent.Orders;

/// <summary>What one pass of the mirror did.</summary>
/// <param name="Asked">False when the exchange could not be asked at all (no key, no network).</param>
/// <param name="Added">Orders the app had no row for.</param>
/// <param name="Changed">Rows brought up to date.</param>
/// <param name="Closed">Stubs whose order never reached the exchange.</param>
/// <param name="RateLimited">True when OKX said to slow down.</param>
public sealed record MirrorPass(bool Asked, int Added = 0, int Changed = 0, int Closed = 0, bool RateLimited = false);

/// <summary>
/// Keeps the <c>orders</c> table in step with OKX, and tells the chat and the user when an order of
/// the agent's changes.
/// </summary>
/// <remarks>
/// The app has no write path to OKX of its own: orders are placed by the trade kit, and what became
/// of them is learned here, by asking OKX every <see cref="Interval"/> for the open and the recent
/// orders of spot and swap.
/// <list type="bullet">
/// <item>An order placed by the agent is matched to the pending row the risk gate wrote, by its client
/// order id. The row is filled in, the tool call's bubble in the chat gets the order's state, and a
/// fill or a cancel raises a notification.</item>
/// <item>An order placed elsewhere (the OKX app, another program) gets a row too, without a chat.</item>
/// <item>A pending row the exchange still does not know after its time ran out is closed as
/// <c>rejected</c>: the order was never placed. The row stays as the record of the attempt.</item>
/// </list>
/// Stubs are closed only in a pass that asked the exchange successfully after their deadline. With
/// no key or no network nothing is closed: not knowing is not the same as "not placed".
/// </remarks>
public sealed partial class OrderMirror(
    IOkxReader okx,
    MirrorOrderRepository orders,
    AgentSessionRepository sessions,
    SessionMessageRepository messages,
    IAgentEvents events,
    NotificationService notifications,
    TimeProvider time,
    ILogger<OrderMirror> logger) : IBackgroundService
{
    /// <summary>How many finished orders per instrument type are read back in each pass.</summary>
    public const int HistoryDepth = 50;

    private static readonly string[] _instrumentTypes = ["SPOT", "SWAP"];
    private static readonly string[] _algoTypes = ["conditional", "oco", "trigger", "move_order_stop"];

    private CancellationTokenSource? _stopping;
    private Task _loop = Task.CompletedTask;

    /// <summary>The time between two passes.</summary>
    public static TimeSpan Interval { get; } = TimeSpan.FromSeconds(30);

    /// <summary>The longest wait after OKX said to slow down.</summary>
    public static TimeSpan MaxBackoff { get; } = TimeSpan.FromMinutes(5);

    public string Name => "Order mirror";

    public Task StartAsync(CancellationToken stopping)
    {
        if (_stopping is not null)
        {
            return Task.CompletedTask;
        }

        _stopping = CancellationTokenSource.CreateLinkedTokenSource(stopping);
        var token = _stopping.Token;
        _loop = Task.Run(() => LoopAsync(token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken deadline)
    {
        if (_stopping is not { } stopping)
        {
            return;
        }

        _stopping = null;
        await stopping.CancelAsync().ConfigureAwait(false);
        await _loop.WaitAsync(deadline).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
        stopping.Dispose();
    }

    /// <summary>One pass: ask OKX, bring the rows up to date, close the stubs that ran out.</summary>
    public async Task<MirrorPass> RunOnceAsync(CancellationToken cancellationToken)
    {
        var askedAt = time.GetUtcNow();
        var added = 0;
        var changed = 0;
        try
        {
            foreach (var type in _instrumentTypes)
            {
                var open = await okx.GetOpenOrdersAsync(type, null, cancellationToken).ConfigureAwait(false);
                var recent = await okx.GetOrderHistoryAsync(type, HistoryDepth, cancellationToken).ConfigureAwait(false);
                // Finished orders after open ones: an order that is in both lists ends in its later state.
                foreach (var order in open.Concat(recent))
                {
                    switch (Apply(order))
                    {
                        case RowChange.Added:
                            added++;
                            break;
                        case RowChange.Changed:
                            changed++;
                            break;
                    }
                }
            }
        }
        catch (OkxException ex)
        {
            // Half a pass is kept: every row written was true. But nothing is closed after it.
            return Failed(ex, added, changed);
        }

        // The exchange answered for every list, after each stub's deadline was read: what it does
        // not know by now was never placed.
        var closed = orders.CloseExpiredStubs(askedAt);
        foreach (var stub in closed)
        {
            LogStubClosed(logger, stub.Symbol, stub.Id);
            UpdateBubble(stub, "not_placed");
            notifications.Notify(new Notification(
                NotificationKind.TradeExecuted,
                $"Order for {stub.Symbol} was not placed",
                "OKX has no such order. It was refused or never reached the exchange.",
                stub.SessionId,
                stub.Id,
                DebounceKey: "order:" + stub.Id));
        }

        try
        {
            added += await MirrorAlgoOrdersAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OkxException ex)
        {
            return Failed(ex, added, changed) with { Asked = true, Closed = closed.Count };
        }

        return new MirrorPass(true, added, changed, closed.Count);
    }

    /// <summary>OKX's word for an order's state in the words of the <c>orders</c> table; null for a state the app does not know.</summary>
    internal static string? MapState(string state) => state switch
    {
        "live" => "open",
        "partially_filled" => "partially_filled",
        "filled" => "filled",
        "canceled" or "mmp_canceled" => "cancelled",
        _ => null,
    };

    private static string MapOrderType(string type) => type == "market" ? "market" : "limit";

    private static decimal? Positive(decimal value) => value > 0 ? value : null;

    private static string Number(decimal value) => value.ToString("0.##########", CultureInfo.InvariantCulture);

    private async Task LoopAsync(CancellationToken stopping)
    {
        var wait = Interval;
        while (!stopping.IsCancellationRequested)
        {
            try
            {
                var pass = await RunOnceAsync(stopping).ConfigureAwait(false);
                // Twice as long after every "slow down", back to normal after a pass without one.
                wait = pass.RateLimited ? TimeSpan.FromTicks(Math.Min(wait.Ticks * 2, MaxBackoff.Ticks)) : Interval;
            }
            catch (OperationCanceledException) when (stopping.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex) when (ex is SqliteException or InvalidOperationException or IOException)
            {
                // A pass that fails must not end the mirror: the next one starts from the exchange again.
                LogPassFailed(logger, ex);
            }

            try
            {
                await Task.Delay(wait, time, stopping).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private MirrorPass Failed(OkxException ex, int added, int changed)
    {
        switch (ex.Failure)
        {
            case OkxFailure.Credentials:
                // No key saved, or a wrong one: there is nothing to mirror, and nothing to report every 30 s.
                break;
            case OkxFailure.RateLimited:
                LogRateLimited(logger);
                break;
            default:
                LogAskFailed(logger, ex.Message);
                break;
        }

        return new MirrorPass(false, added, changed, RateLimited: ex.Failure == OkxFailure.RateLimited);
    }

    private RowChange Apply(OkxOrder order)
    {
        if (order.OrderId.Length == 0 || order.Side is not ("buy" or "sell"))
        {
            return RowChange.None;
        }

        var existing = orders.Find(order.OrderId, order.ClientOrderId);
        var status = MapState(order.State);
        if (status is null)
        {
            // OKX adds states over time. An unknown one changes nothing: guessing "pending" or
            // "open" here would raise a false notification at the next known state.
            LogUnknownState(logger, order.State);
            return RowChange.None;
        }

        var session = ClientOrderId.SessionOf(order.ClientOrderId);
        var row = new ExchangeOrder(
            order.OrderId,
            order.ClientOrderId.Length > 0 ? order.ClientOrderId : null,
            order.InstrumentId,
            order.Side,
            MapOrderType(order.OrderType),
            status,
            order.Size,
            order.FilledSize,
            Positive(order.Price),
            Positive(order.AverageFillPrice),
            order.CreatedAt,
            order.UpdatedAt);

        if (existing is null)
        {
            try
            {
                // The id names a session only if that session is still there.
                orders.Insert(row, session is not null && sessions.Get(session) is not null ? session : null, ownOrder: session is not null);
            }
            catch (SqliteException ex)
            {
                LogRowFailed(logger, order.InstrumentId, ex);
                return RowChange.None;
            }

            return RowChange.Added;
        }

        var wasStub = existing.ExchangeOrderId is null;
        var statusChanged = existing.Status != status;
        var fillChanged = existing.FilledQuantity != row.FilledQuantity;
        if (!wasStub && !statusChanged && !fillChanged)
        {
            return RowChange.None;
        }

        orders.Update(existing.Id, row);
        var updated = existing with
        {
            ExchangeOrderId = row.ExchangeOrderId,
            Symbol = row.Symbol,
            Side = row.Side,
            Status = status,
            Quantity = row.Quantity,
            FilledQuantity = row.FilledQuantity,
            AverageFillPrice = row.AverageFillPrice ?? existing.AverageFillPrice,
        };
        UpdateBubble(updated, status);
        if (statusChanged)
        {
            Announce(updated);
        }

        return RowChange.Changed;
    }

    /// <summary>Writes the order's state into the tool call that placed it, so the chat shows it without a new message.</summary>
    private void UpdateBubble(MirroredOrder order, string status)
    {
        if (order.ToolUseId is null)
        {
            return;
        }

        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteString("status", status);
            writer.WriteString("symbol", order.Symbol);
            writer.WriteString("side", order.Side);
            if (order.ExchangeOrderId is not null)
            {
                writer.WriteString("exchange_order_id", order.ExchangeOrderId);
            }

            writer.WriteNumber("quantity", order.Quantity);
            writer.WriteNumber("filled_quantity", order.FilledQuantity);
            if (order.AverageFillPrice is { } average)
            {
                writer.WriteNumber("avg_fill_price", average);
            }

            writer.WriteEndObject();
        }

        var message = messages.SetResultSummary(order.ToolUseId, Encoding.UTF8.GetString(buffer.ToArray()));
        if (message is not null)
        {
            events.Publish(new MessageUpdated(message.SessionId, message));
        }
    }

    private void Announce(MirroredOrder order)
    {
        // Only the agent's own orders: what the user did by hand in the OKX app, they know.
        if (order.SessionId is null && order.ToolUseId is null)
        {
            return;
        }

        var key = "order:" + order.Id;
        switch (order.Status)
        {
            case "filled":
                notifications.Notify(new Notification(
                    NotificationKind.TradeExecuted,
                    $"Order {order.Symbol} filled",
                    order.AverageFillPrice is { } price
                        ? $"{order.Side} {Number(order.FilledQuantity)} at {Number(price)}"
                        : $"{order.Side} {Number(order.FilledQuantity)}",
                    order.SessionId,
                    order.Id,
                    key));
                break;
            case "cancelled":
                notifications.Notify(new Notification(
                    NotificationKind.TradeExecuted,
                    $"Order {order.Symbol} cancelled",
                    $"{order.Side} {Number(order.Quantity)}, {Number(order.FilledQuantity)} filled",
                    order.SessionId,
                    order.Id,
                    key));
                break;
        }
    }

    private async Task<int> MirrorAlgoOrdersAsync(CancellationToken cancellationToken)
    {
        var added = 0;
        foreach (var type in _instrumentTypes)
        {
            foreach (var algoType in _algoTypes)
            {
                foreach (var algo in await okx.GetPendingAlgoOrdersAsync(type, algoType, cancellationToken).ConfigureAwait(false))
                {
                    if (algo.AlgoId.Length == 0 || algo.Side is not ("buy" or "sell") || orders.AlgoExists(algo.AlgoId))
                    {
                        continue;
                    }

                    var session = ClientOrderId.SessionOf(algo.ClientAlgoId);
                    try
                    {
                        orders.InsertAlgo(
                            new ExchangeAlgoOrder(
                                algo.AlgoId,
                                algo.ClientAlgoId.Length > 0 ? algo.ClientAlgoId : null,
                                algo.InstrumentId,
                                algo.Side,
                                Array.IndexOf(_algoTypes, algo.OrderType) >= 0 ? algo.OrderType : null,
                                algo.Size,
                                Positive(algo.TriggerPrice),
                                algo.CreatedAt),
                            session is not null && sessions.Get(session) is not null ? session : null);
                        added++;
                    }
                    catch (SqliteException ex)
                    {
                        LogRowFailed(logger, algo.InstrumentId, ex);
                    }
                }
            }
        }

        return added;
    }

    private enum RowChange
    {
        None,
        Added,
        Changed,
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The order mirror could not ask OKX: {Reason}")]
    private static partial void LogAskFailed(ILogger logger, string reason);

    [LoggerMessage(Level = LogLevel.Warning, Message = "OKX told the order mirror to slow down; the next pass waits longer.")]
    private static partial void LogRateLimited(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "OKX reported an order state the app does not know ({State}); the order was left as it is.")]
    private static partial void LogUnknownState(ILogger logger, string state);

    [LoggerMessage(Level = LogLevel.Warning, Message = "An order of {Symbol} could not be written; the mirror goes on with the next.")]
    private static partial void LogRowFailed(ILogger logger, string symbol, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "OKX does not know the pending order for {Symbol} (row {RowId}); it was closed as not placed.")]
    private static partial void LogStubClosed(ILogger logger, string symbol, string rowId);

    [LoggerMessage(Level = LogLevel.Error, Message = "A pass of the order mirror failed; the next one starts again from the exchange.")]
    private static partial void LogPassFailed(ILogger logger, Exception exception);
}
