using System.Net;
using System.Text;
using TradingAgent.Core.Settings;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.Exchange.Tests;

/// <summary>Answers HTTP requests from a queue and remembers what was sent.</summary>
internal sealed class StubHttpHandler : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> _responses = new();

    public List<HttpRequestMessage> Requests { get; } = [];

    public StubHttpHandler Respond(string json, HttpStatusCode status = HttpStatusCode.OK)
    {
        _responses.Enqueue(_ => new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
        return this;
    }

    public StubHttpHandler Fail(Exception exception)
    {
        _responses.Enqueue(_ => throw exception);
        return this;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Requests.Add(request);
        return _responses.Count > 0
            ? Task.FromResult(_responses.Dequeue()(request))
            : throw new InvalidOperationException("The test did not queue a response for this request.");
    }
}

/// <summary>Settings that return each key's default unless a test set a value.</summary>
internal sealed class FakeSettings : ISettingsStore
{
    private readonly Dictionary<string, object?> _values = [];

    public event EventHandler<SettingChangedEventArgs>? Changed;

    public T GetValue<T>(SettingKey<T> key) => _values.TryGetValue(key.Name, out var value) ? (T)value! : key.DefaultValue;

    public void SetValue<T>(SettingKey<T> key, T value)
    {
        _values[key.Name] = value;
        Changed?.Invoke(this, new SettingChangedEventArgs(key.Name));
    }

    public void Reset<T>(SettingKey<T> key) => _values.Remove(key.Name);
}

/// <summary>An exchange whose answers a test sets. Methods a test did not prepare throw.</summary>
internal sealed class FakeOkx : IOkxReader
{
    public AccountBalance Balance { get; set; } = new(10_000m, []);

    public decimal LastPrice { get; set; } = 100m;

    public IReadOnlyList<Candle> Candles { get; set; } = [];

    public Exception? BalanceFailure { get; set; }

    public Exception? TickerFailure { get; set; }

    public Exception? CandlesFailure { get; set; }

    public int TickerCalls { get; private set; }

    public Task<AccountBalance> GetBalanceAsync(CancellationToken cancellationToken) =>
        BalanceFailure is null ? Task.FromResult(Balance) : Task.FromException<AccountBalance>(BalanceFailure);

    public Task<Ticker> GetTickerAsync(string instrumentId, CancellationToken cancellationToken)
    {
        TickerCalls++;
        return TickerFailure is null
            ? Task.FromResult(new Ticker(instrumentId, LastPrice, LastPrice, LastPrice, LastPrice, LastPrice, LastPrice, 0, 0))
            : Task.FromException<Ticker>(TickerFailure);
    }

    public Task<IReadOnlyList<Candle>> GetCandlesAsync(string instrumentId, string bar, int limit, CancellationToken cancellationToken) =>
        CandlesFailure is null ? Task.FromResult(Candles) : Task.FromException<IReadOnlyList<Candle>>(CandlesFailure);

    public Task<IReadOnlyList<Ticker>> GetTickersAsync(string instrumentType, CancellationToken cancellationToken) => throw new NotSupportedException();

    public Task<OrderBook> GetOrderBookAsync(string instrumentId, int depth, CancellationToken cancellationToken) => throw new NotSupportedException();

    public Task<IReadOnlyList<Instrument>> GetInstrumentsAsync(string instrumentType, CancellationToken cancellationToken) => throw new NotSupportedException();

    public Task<IReadOnlyList<Position>> GetPositionsAsync(string? instrumentType, CancellationToken cancellationToken) => throw new NotSupportedException();

    public Task<IReadOnlyList<OkxOrder>> GetOpenOrdersAsync(string instrumentType, string? instrumentId, CancellationToken cancellationToken) => throw new NotSupportedException();

    public Task<IReadOnlyList<OkxOrder>> GetOrderHistoryAsync(string instrumentType, int limit, CancellationToken cancellationToken) => throw new NotSupportedException();

    public Task<IReadOnlyList<OkxAlgoOrder>> GetPendingAlgoOrdersAsync(string instrumentType, string orderType, CancellationToken cancellationToken) => throw new NotSupportedException();
}

/// <summary>Price histories built from formulas, so no data file is needed.</summary>
internal static class Series
{
    /// <summary>
    /// The series the reference values were computed from with the previous app's library:
    /// a sine wave on a rising line, with ranges that vary from bar to bar.
    /// </summary>
    public static List<Candle> Wave(int count)
    {
        var candles = new List<Candle>(count);
        var previousClose = 100.0;
        for (var i = 0; i < count; i++)
        {
            var close = 100.0 + (10.0 * Math.Sin(i / 7.0)) + (0.05 * i);
            var high = Math.Max(close, previousClose) + 1.0 + (i % 3 * 0.2);
            var low = Math.Min(close, previousClose) - 1.0 - (i % 5 * 0.15);
            candles.Add(new Candle(i * 3_600_000L, (decimal)previousClose, (decimal)high, (decimal)low, (decimal)close, 1000 + i));
            previousClose = close;
        }

        return candles;
    }

    /// <summary>
    /// A quiet market: closes alternate just above and below 100 and end on a rise. RSI is near 50, the
    /// price is above its averages and inside its bands, so a buy scores nothing on it. (A perfectly
    /// flat price would not do: with no falls at all its RSI is 100.)
    /// </summary>
    /// <param name="range">High minus low of every bar; 12 makes the market volatile without moving it.</param>
    public static List<Candle> Calm(double range = 1)
    {
        var candles = new List<Candle>(61);
        for (var i = 0; i < 61; i++)
        {
            var close = i % 2 == 0 ? 100.2 : 99.8;
            candles.Add(new Candle(i * 3_600_000L, (decimal)close, (decimal)(close + (range / 2)), (decimal)(close - (range / 2)), (decimal)close, 1000));
        }

        return candles;
    }

    /// <summary>A straight line from <paramref name="from"/> to <paramref name="to"/> with a fixed range around each close.</summary>
    public static List<Candle> Line(int count, double from, double to, double range)
    {
        var candles = new List<Candle>(count);
        for (var i = 0; i < count; i++)
        {
            var close = from + ((to - from) * i / (count - 1));
            candles.Add(new Candle(i * 3_600_000L, (decimal)close, (decimal)(close + (range / 2)), (decimal)(close - (range / 2)), (decimal)close, 1000));
        }

        return candles;
    }
}
