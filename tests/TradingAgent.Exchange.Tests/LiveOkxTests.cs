using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Exchange.Analysis;
using TradingAgent.Exchange.Okx;
using Xunit;

namespace TradingAgent.Exchange.Tests;

/// <summary>
/// Calls the real OKX API. Public market data only: no key, no account. Skipped unless the
/// environment variable <c>TRADINGAGENT_LIVE_TESTS</c> is <c>1</c>, so an ordinary test run and CI
/// never depend on the network.
/// </summary>
public sealed class LiveOkxTests
{
    private const string Symbol = "BTC-USDT";

    [Fact]
    public async Task The_real_ticker_is_read()
    {
        SkipUnlessLive();
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

        var ticker = await NewClient(http).GetTickerAsync(Symbol, TestContext.Current.CancellationToken);

        Assert.Equal(Symbol, ticker.InstrumentId);
        Assert.True(ticker.Last > 0);
        Assert.True(ticker.Bid > 0 && ticker.Ask >= ticker.Bid);
        Assert.True(ticker.High24h >= ticker.Low24h);
        // Within a day of now: the timestamp field was read, and read as milliseconds.
        var age = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(ticker.Timestamp);
        Assert.InRange(age, TimeSpan.FromMinutes(-5), TimeSpan.FromDays(1));
    }

    [Fact]
    public async Task Real_price_history_is_oldest_first_and_gives_indicators()
    {
        SkipUnlessLive();
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

        var candles = await NewClient(http).GetCandlesAsync(Symbol, "1H", 200, TestContext.Current.CancellationToken);
        var snapshot = Indicators.Compute(candles);

        Assert.Equal(200, candles.Count);
        Assert.True(candles[0].OpenTime < candles[^1].OpenTime);
        Assert.Equal(3_600_000, candles[1].OpenTime - candles[0].OpenTime);
        Assert.All(candles, candle => Assert.True(candle.High >= candle.Low && candle.Low > 0));
        Assert.NotNull(snapshot);
        Assert.InRange(snapshot.Rsi14, 0, 100);
        Assert.True(snapshot.Atr14 > 0);
        Assert.True(snapshot.BollingerUpper > snapshot.BollingerLower);
    }

    [Fact]
    public async Task The_real_order_book_and_instrument_list_are_read()
    {
        SkipUnlessLive();
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        var client = NewClient(http);

        var book = await client.GetOrderBookAsync(Symbol, 5, TestContext.Current.CancellationToken);
        var instruments = await client.GetInstrumentsAsync("SPOT", TestContext.Current.CancellationToken);

        Assert.Equal(5, book.Bids.Count);
        Assert.Equal(5, book.Asks.Count);
        Assert.True(book.Bids[0].Price < book.Asks[0].Price);
        Assert.True(book.Bids[0].Price > book.Bids[1].Price);
        var instrument = Assert.Single(instruments, item => item.InstrumentId == Symbol);
        Assert.Equal(("BTC", "USDT"), (instrument.BaseCurrency, instrument.QuoteCurrency));
        Assert.True(instrument.TickSize > 0 && instrument.MinSize > 0);
    }

    [Fact]
    public async Task An_instrument_that_does_not_exist_is_refused_by_the_real_api()
    {
        SkipUnlessLive();
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

        var error = await Assert.ThrowsAsync<OkxException>(
            () => NewClient(http).GetTickerAsync("NOSUCHCOIN-USDT", TestContext.Current.CancellationToken));

        Assert.Equal(OkxFailure.Rejected, error.Failure);
    }

    private static void SkipUnlessLive() =>
        Assert.SkipUnless(
            Environment.GetEnvironmentVariable("TRADINGAGENT_LIVE_TESTS") == "1",
            "Set TRADINGAGENT_LIVE_TESTS=1 to call the real OKX API.");

    private static OkxClient NewClient(HttpClient http) =>
        new(http, () => null, () => false, TimeProvider.System, NullLogger<OkxClient>.Instance);
}
