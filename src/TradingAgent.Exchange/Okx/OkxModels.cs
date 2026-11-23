namespace TradingAgent.Exchange.Okx;

/// <summary>The three values OKX needs to sign a private request.</summary>
public sealed record OkxCredentials(string ApiKey, string SecretKey, string Passphrase);

/// <summary>One bar of price history. <paramref name="OpenTime"/> is Unix milliseconds.</summary>
public sealed record Candle(long OpenTime, decimal Open, decimal High, decimal Low, decimal Close, decimal Volume);

/// <summary>The latest trade and 24-hour figures of an instrument. <paramref name="Timestamp"/> is Unix milliseconds.</summary>
public sealed record Ticker(
    string InstrumentId,
    decimal Last,
    decimal Bid,
    decimal Ask,
    decimal Open24h,
    decimal High24h,
    decimal Low24h,
    decimal Volume24h,
    long Timestamp)
{
    /// <summary>Change over 24 hours in percent; zero when the opening price is unknown.</summary>
    public decimal ChangePercent24h => Open24h == 0 ? 0 : (Last - Open24h) / Open24h * 100;
}

public sealed record BookLevel(decimal Price, decimal Size);

/// <summary>Resting orders around the current price. Bids are highest first, asks lowest first.</summary>
public sealed record OrderBook(string InstrumentId, IReadOnlyList<BookLevel> Bids, IReadOnlyList<BookLevel> Asks, long Timestamp);

/// <param name="Currency">For example <c>USDT</c>.</param>
/// <param name="Equity">Total of the currency, including what is frozen in orders.</param>
/// <param name="Available">What can be traded or withdrawn now.</param>
/// <param name="EquityUsd">The equity valued in US dollars.</param>
public sealed record AssetBalance(string Currency, decimal Equity, decimal Available, decimal EquityUsd);

/// <summary>The trading account. <paramref name="TotalEquityUsd"/> is everything valued in US dollars.</summary>
public sealed record AccountBalance(decimal TotalEquityUsd, IReadOnlyList<AssetBalance> Assets);

/// <param name="InstrumentId">For example <c>BTC-USDT-SWAP</c>.</param>
/// <param name="InstrumentType"><c>SWAP</c>, <c>FUTURES</c>, <c>MARGIN</c> or <c>OPTION</c>.</param>
/// <param name="Side"><c>long</c>, <c>short</c> or <c>net</c>.</param>
/// <param name="Size">Position size in the instrument's unit; negative for a net short.</param>
/// <param name="AveragePrice">Average entry price.</param>
/// <param name="MarkPrice">The price the exchange values the position at.</param>
/// <param name="UnrealizedPnl">Profit or loss not yet taken.</param>
/// <param name="Leverage">Zero when the exchange gives none.</param>
public sealed record Position(
    string InstrumentId,
    string InstrumentType,
    string Side,
    decimal Size,
    decimal AveragePrice,
    decimal MarkPrice,
    decimal UnrealizedPnl,
    decimal Leverage);

/// <summary>An order as OKX reports it. Times are Unix milliseconds.</summary>
/// <param name="OrderId">The exchange's id.</param>
/// <param name="ClientOrderId">The id the sender chose; empty when none was sent.</param>
/// <param name="InstrumentId">For example <c>BTC-USDT</c>.</param>
/// <param name="InstrumentType"><c>SPOT</c>, <c>SWAP</c> and so on.</param>
/// <param name="Side"><c>buy</c> or <c>sell</c>.</param>
/// <param name="OrderType"><c>market</c>, <c>limit</c> and so on.</param>
/// <param name="State"><c>live</c>, <c>partially_filled</c>, <c>filled</c>, <c>canceled</c>, <c>mmp_canceled</c>.</param>
/// <param name="Price">Limit price; zero for a market order.</param>
/// <param name="Size">Ordered size.</param>
/// <param name="FilledSize">Size filled so far.</param>
/// <param name="AverageFillPrice">Zero until something is filled.</param>
/// <param name="CreatedAt">When the order was placed.</param>
/// <param name="UpdatedAt">When it last changed.</param>
public sealed record OkxOrder(
    string OrderId,
    string ClientOrderId,
    string InstrumentId,
    string InstrumentType,
    string Side,
    string OrderType,
    string State,
    decimal Price,
    decimal Size,
    decimal FilledSize,
    decimal AverageFillPrice,
    long CreatedAt,
    long UpdatedAt);

/// <summary>A pending trigger, stop or other algorithmic order.</summary>
public sealed record OkxAlgoOrder(
    string AlgoId,
    string ClientAlgoId,
    string InstrumentId,
    string InstrumentType,
    string Side,
    string OrderType,
    string State,
    decimal Size,
    decimal TriggerPrice,
    long CreatedAt);

/// <param name="InstrumentId">For example <c>BTC-USDT</c>.</param>
/// <param name="InstrumentType"><c>SPOT</c>, <c>SWAP</c> and so on.</param>
/// <param name="BaseCurrency">What is bought and sold, for example <c>BTC</c>.</param>
/// <param name="QuoteCurrency">What it is priced in, for example <c>USDT</c>.</param>
/// <param name="State"><c>live</c> when it can be traded.</param>
/// <param name="TickSize">Smallest price step.</param>
/// <param name="LotSize">Smallest size step.</param>
/// <param name="MinSize">Smallest order.</param>
public sealed record Instrument(
    string InstrumentId,
    string InstrumentType,
    string BaseCurrency,
    string QuoteCurrency,
    string State,
    decimal TickSize,
    decimal LotSize,
    decimal MinSize);

/// <summary>Why a request to OKX failed, by what can be done about it.</summary>
public enum OkxFailure
{
    /// <summary>No API key is saved, or OKX rejected it.</summary>
    Credentials,

    /// <summary>Too many requests.</summary>
    RateLimited,

    /// <summary>OKX could not be reached, or answered with something unreadable.</summary>
    Network,

    /// <summary>OKX understood the request and refused it; <see cref="OkxException.Code"/> says why.</summary>
    Rejected,
}

/// <summary>A request to OKX failed. <see cref="Exception.Message"/> is written for the user.</summary>
public sealed class OkxException : Exception
{
    public OkxException(OkxFailure failure, string message, string? code = null, Exception? innerException = null)
        : base(message, innerException)
    {
        Failure = failure;
        Code = code;
    }

    public OkxException()
        : this(OkxFailure.Network, "The request to OKX failed.")
    {
    }

    public OkxException(string message)
        : this(OkxFailure.Network, message)
    {
    }

    public OkxException(string message, Exception innerException)
        : this(OkxFailure.Network, message, null, innerException)
    {
    }

    public OkxFailure Failure { get; }

    /// <summary>OKX's own error code, for example <c>51001</c>; null when the failure has none.</summary>
    public string? Code { get; }
}

/// <summary>Reads from OKX. There is no method here that changes anything on the exchange, on purpose.</summary>
/// <remarks>
/// Orders are placed, changed and cancelled only by the OKX Agent Trade Kit behind the risk gate. A
/// write method on this interface would be a way around that gate.
/// </remarks>
public interface IOkxReader
{
    Task<Ticker> GetTickerAsync(string instrumentId, CancellationToken cancellationToken);

    /// <summary>Every ticker of an instrument type (<c>SPOT</c>, <c>SWAP</c>).</summary>
    Task<IReadOnlyList<Ticker>> GetTickersAsync(string instrumentType, CancellationToken cancellationToken);

    /// <param name="instrumentId">The instrument.</param>
    /// <param name="depth">Levels per side, 1 to 400.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    Task<OrderBook> GetOrderBookAsync(string instrumentId, int depth, CancellationToken cancellationToken);

    /// <summary>Price history, <b>oldest first</b> (OKX sends newest first; this is turned around).</summary>
    /// <param name="instrumentId">The instrument.</param>
    /// <param name="bar">Bar size as OKX names it: <c>1m</c>, <c>15m</c>, <c>1H</c>, <c>4H</c>, <c>1D</c>.</param>
    /// <param name="limit">How many bars, 1 to 300.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    Task<IReadOnlyList<Candle>> GetCandlesAsync(string instrumentId, string bar, int limit, CancellationToken cancellationToken);

    Task<IReadOnlyList<Instrument>> GetInstrumentsAsync(string instrumentType, CancellationToken cancellationToken);

    Task<AccountBalance> GetBalanceAsync(CancellationToken cancellationToken);

    /// <param name="instrumentType">Only this type; every type when null.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    Task<IReadOnlyList<Position>> GetPositionsAsync(string? instrumentType, CancellationToken cancellationToken);

    /// <summary>Orders that are not finished yet.</summary>
    Task<IReadOnlyList<OkxOrder>> GetOpenOrdersAsync(string instrumentType, string? instrumentId, CancellationToken cancellationToken);

    /// <summary>Orders finished in the last 7 days, newest first.</summary>
    Task<IReadOnlyList<OkxOrder>> GetOrderHistoryAsync(string instrumentType, int limit, CancellationToken cancellationToken);

    /// <param name="instrumentType">The instrument type.</param>
    /// <param name="orderType">OKX requires one: <c>conditional</c>, <c>oco</c>, <c>trigger</c>, <c>move_order_stop</c>, <c>twap</c>.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    Task<IReadOnlyList<OkxAlgoOrder>> GetPendingAlgoOrdersAsync(string instrumentType, string orderType, CancellationToken cancellationToken);
}
