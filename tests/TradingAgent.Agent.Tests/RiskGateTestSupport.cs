using System.Text.Json;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Tools;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.Agent.Tests;

/// <summary>An exchange in memory: an account of 10,000 US dollars and a few instruments.</summary>
internal sealed class FakeExchange : IOkxReader
{
    // 200 bars of this end on its last value, the mean: neither above nor below the averages.
    private static readonly decimal[] _calmWave = [1.002m, 1.000m, 0.998m, 1.000m];

    /// <summary>Total equity of the account in US dollars.</summary>
    public decimal Equity { get; set; } = 10_000m;

    public Dictionary<string, decimal> Prices { get; } = new(StringComparer.Ordinal)
    {
        ["BTC-USDT"] = 50_000m,
        ["BTC-USDT-SWAP"] = 50_000m,
        ["BTC-USD-SWAP"] = 50_000m,
        ["DOGE-USDT-SWAP"] = 0.1m,
    };

    public List<Instrument> Swaps { get; } =
    [
        new("BTC-USDT-SWAP", "SWAP", string.Empty, string.Empty, "live", 0.1m, 1m, 1m, ContractValue: 0.01m, ContractMultiplier: 1m, ContractType: "linear"),
        new("BTC-USD-SWAP", "SWAP", string.Empty, string.Empty, "live", 0.1m, 1m, 1m, ContractValue: 100m, ContractMultiplier: 1m, ContractType: "inverse"),
        // One contract is 1000 coins: a size read as coins would be a thousand times too small.
        new("DOGE-USDT-SWAP", "SWAP", string.Empty, string.Empty, "live", 0.00001m, 1m, 1m, ContractValue: 1000m, ContractMultiplier: 1m, ContractType: "linear"),
    ];

    /// <summary>True for a market that rises bar after bar: overbought, at the top of its band.</summary>
    public bool Rising { get; set; }

    /// <summary>True for bars eight percent tall: an average true range above five percent of the price.</summary>
    public bool Volatile { get; set; }

    /// <summary>Coins already held, by currency, valued in US dollars.</summary>
    public Dictionary<string, decimal> Holdings { get; } = new(StringComparer.Ordinal);

    /// <summary>Open swap positions.</summary>
    public List<Position> Positions { get; } = [];

    /// <summary>When set, reading the price fails with it.</summary>
    public Exception? TickerFailure { get; set; }

    /// <summary>When set, reading the balance fails with it.</summary>
    public Exception? BalanceFailure { get; set; }

    public int BalanceReads { get; private set; }

    public Task<Ticker> GetTickerAsync(string instrumentId, CancellationToken cancellationToken)
    {
        if (TickerFailure is not null)
        {
            throw TickerFailure;
        }

        return Prices.TryGetValue(instrumentId, out var price)
            ? Task.FromResult(new Ticker(instrumentId, price, price, price, price, price, price, 1000m, 0))
            : throw new OkxException(OkxFailure.Rejected, "Instrument ID does not exist");
    }

    public Task<IReadOnlyList<Candle>> GetCandlesAsync(string instrumentId, string bar, int limit, CancellationToken cancellationToken)
    {
        var price = Prices[instrumentId];
        var candles = new List<Candle>(limit);
        for (var index = 0; index < limit; index++)
        {
            // Rising: half a percent up every bar, ending at the current price. Calm: a small wave
            // around the price that ends on it, so no indicator has anything to say.
            var close = Rising
                ? price * (decimal)Math.Pow(1.005, index - (limit - 1))
                : price * _calmWave[index % _calmWave.Length];
            var reach = Volatile ? 0.04m : 0.0005m;
            candles.Add(new Candle(index * 3_600_000L, close, close * (1 + reach), close * (1 - reach), close, 10m));
        }

        return Task.FromResult<IReadOnlyList<Candle>>(candles);
    }

    public Task<IReadOnlyList<Instrument>> GetInstrumentsAsync(string instrumentType, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Instrument>>(instrumentType == "SWAP" ? Swaps : []);

    public Task<AccountBalance> GetBalanceAsync(CancellationToken cancellationToken)
    {
        BalanceReads++;
        return BalanceFailure is null
            ? Task.FromResult(new AccountBalance(
                Equity,
                [new AssetBalance("USDT", Equity, Equity, Equity), .. Holdings.Select(held => new AssetBalance(held.Key, 0, 0, held.Value))]))
            : throw BalanceFailure;
    }

    public Task<IReadOnlyList<Ticker>> GetTickersAsync(string instrumentType, CancellationToken cancellationToken) => throw new NotSupportedException();

    public Task<OrderBook> GetOrderBookAsync(string instrumentId, int depth, CancellationToken cancellationToken) => throw new NotSupportedException();

    public Task<IReadOnlyList<Position>> GetPositionsAsync(string? instrumentType, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Position>>([.. Positions.Where(position => instrumentType is null || position.InstrumentType == instrumentType)]);

    /// <summary>Orders that are not finished, by instrument type (<c>SPOT</c>, <c>SWAP</c>).</summary>
    public Dictionary<string, List<OkxOrder>> OpenOrders { get; } = new(StringComparer.Ordinal) { ["SPOT"] = [], ["SWAP"] = [] };

    /// <summary>Finished orders, by instrument type.</summary>
    public Dictionary<string, List<OkxOrder>> RecentOrders { get; } = new(StringComparer.Ordinal) { ["SPOT"] = [], ["SWAP"] = [] };

    public List<OkxAlgoOrder> AlgoOrders { get; } = [];

    /// <summary>When set, reading orders fails with it.</summary>
    public Exception? OrdersFailure { get; set; }

    /// <summary>When set, reading algorithmic orders fails with it.</summary>
    public Exception? AlgoFailure { get; set; }

    /// <summary>How often the open orders were asked for, over all instrument types.</summary>
    public int OrderReads { get; private set; }

    public Task<IReadOnlyList<OkxOrder>> GetOpenOrdersAsync(string instrumentType, string? instrumentId, CancellationToken cancellationToken)
    {
        OrderReads++;
        return OrdersFailure is null ? Task.FromResult<IReadOnlyList<OkxOrder>>([.. OpenOrders[instrumentType]]) : throw OrdersFailure;
    }

    public Task<IReadOnlyList<OkxOrder>> GetOrderHistoryAsync(string instrumentType, int limit, CancellationToken cancellationToken) =>
        OrdersFailure is null ? Task.FromResult<IReadOnlyList<OkxOrder>>([.. RecentOrders[instrumentType].Take(limit)]) : throw OrdersFailure;

    public Task<IReadOnlyList<OkxAlgoOrder>> GetPendingAlgoOrdersAsync(string instrumentType, string orderType, CancellationToken cancellationToken) =>
        AlgoFailure is null
            ? Task.FromResult<IReadOnlyList<OkxAlgoOrder>>([.. AlgoOrders.Where(order => order.InstrumentType == instrumentType && order.OrderType == orderType)])
            : throw AlgoFailure;
}

/// <summary>A gate whose answer a test sets, and which keeps what it was asked.</summary>
internal sealed class FakeGate : IAtkGate
{
    public Func<string, JsonElement, GateDecision> Decide { get; set; } = (_, _) => GateDecision.Allow;

    public List<(string Tool, string Input, ToolContext Context)> Asked { get; } = [];

    public ValueTask<GateDecision> CheckAsync(string toolName, JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        lock (Asked)
        {
            Asked.Add((toolName, input.GetRawText(), context));
        }

        return ValueTask.FromResult(Decide(toolName, input));
    }
}
