using System.Net;
using System.Reflection;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Exchange.Okx;
using Xunit;

namespace TradingAgent.Exchange.Tests;

public sealed class OkxClientTests
{
    // Fake values of low entropy, so secret scanners do not mistake them for leaked credentials.
    private static readonly OkxCredentials _credentials = new("test-key-aaaa", "test-secret-bbbb", "test-pass-cccc");

    private static readonly DateTimeOffset _now = new(2026, 11, 23, 9, 8, 57, 715, TimeSpan.Zero);

    [Fact]
    public void The_signature_matches_a_value_computed_outside_this_code()
    {
        // HMAC-SHA256 over "2026-11-23T09:08:57.715ZGET/api/v5/account/balance?ccy=USDT" with the test
        // secret, computed with PowerShell.
        var signature = OkxClient.Sign("test-secret-bbbb", "2026-11-23T09:08:57.715Z", "GET", "/api/v5/account/balance?ccy=USDT");

        Assert.Equal("nWiNfJD64Bkfqp8C7rZls8jM3mUz0ATXG/jJQfjzkew=", signature);
    }

    [Fact]
    public async Task A_private_request_is_signed_with_the_time_the_path_and_the_saved_key()
    {
        var handler = new StubHttpHandler().Respond("""{"code":"0","msg":"","data":[{"totalEq":"12500.5","details":[{"ccy":"USDT","eq":"10000","availBal":"9000","eqUsd":"10000"},{"ccy":"BTC","eq":"0.025","availBal":"0.025","eqUsd":"2500.5"}]}]}""");

        var balance = await NewClient(handler).GetBalanceAsync(TestContext.Current.CancellationToken);

        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal("https://www.okx.com/api/v5/account/balance", request.RequestUri!.ToString());
        Assert.Equal("test-key-aaaa", Header(request, "OK-ACCESS-KEY"));
        Assert.Equal("test-pass-cccc", Header(request, "OK-ACCESS-PASSPHRASE"));
        Assert.Equal("2026-11-23T09:08:57.715Z", Header(request, "OK-ACCESS-TIMESTAMP"));
        Assert.Equal(
            OkxClient.Sign("test-secret-bbbb", "2026-11-23T09:08:57.715Z", "GET", "/api/v5/account/balance"),
            Header(request, "OK-ACCESS-SIGN"));
        Assert.False(request.Headers.Contains("x-simulated-trading"));

        Assert.Equal(12500.5m, balance.TotalEquityUsd);
        Assert.Equal(["USDT", "BTC"], balance.Assets.Select(asset => asset.Currency));
        Assert.Equal(9000m, balance.Assets[0].Available);
    }

    [Fact]
    public async Task In_sandbox_mode_every_request_goes_to_the_demo_environment()
    {
        var handler = new StubHttpHandler()
            .Respond("""{"code":"0","msg":"","data":[{"instId":"BTC-USDT","last":"97000.1","bidPx":"97000","askPx":"97000.2","open24h":"95000","high24h":"98000","low24h":"94000","vol24h":"1234.5","ts":"1790000000000"}]}""")
            .Respond("""{"code":"0","msg":"","data":[]}""");
        var client = NewClient(handler, sandbox: true);

        var ticker = await client.GetTickerAsync("BTC-USDT", TestContext.Current.CancellationToken);
        await client.GetPositionsAsync(null, TestContext.Current.CancellationToken);

        // Public and private alike: prices used for risk checks must come from where the orders go.
        Assert.All(handler.Requests, request => Assert.Equal("1", Header(request, "x-simulated-trading")));
        Assert.Equal(97000.1m, ticker.Last);
        Assert.Equal(1790000000000, ticker.Timestamp);
        Assert.Equal(2.11m, Math.Round(ticker.ChangePercent24h, 2));
    }

    [Fact]
    public async Task A_public_request_is_not_signed_and_needs_no_key()
    {
        var handler = new StubHttpHandler().Respond("""{"code":"0","msg":"","data":[{"instId":"BTC-USDT","last":"1"}]}""");
        using var http = new HttpClient(handler);
        var client = new OkxClient(http, () => null, () => false, new FixedTime(_now), NullLogger<OkxClient>.Instance);

        await client.GetTickerAsync("BTC-USDT", TestContext.Current.CancellationToken);

        var request = Assert.Single(handler.Requests);
        Assert.Equal("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT", request.RequestUri!.ToString());
        Assert.False(request.Headers.Contains("OK-ACCESS-KEY"));
        Assert.False(request.Headers.Contains("OK-ACCESS-SIGN"));
    }

    [Fact]
    public async Task A_private_request_without_a_saved_key_is_not_sent()
    {
        var handler = new StubHttpHandler();
        using var http = new HttpClient(handler);
        var client = new OkxClient(http, () => null, () => false, new FixedTime(_now), NullLogger<OkxClient>.Instance);

        var error = await Assert.ThrowsAsync<OkxException>(() => client.GetBalanceAsync(TestContext.Current.CancellationToken));

        Assert.Equal(OkxFailure.Credentials, error.Failure);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task Price_history_is_returned_oldest_first()
    {
        var handler = new StubHttpHandler().Respond(
            """{"code":"0","msg":"","data":[["3000","103","104","102","103.5","30","x","y","0"],["2000","102","103","101","102.5","20","x","y","1"],["1000","101","102","100","101.5","10","x","y","1"]]}""");

        var candles = await NewClient(handler).GetCandlesAsync("BTC-USDT", "1H", 3, TestContext.Current.CancellationToken);

        Assert.Equal([1000L, 2000L, 3000L], candles.Select(candle => candle.OpenTime));
        Assert.Equal(new Candle(1000, 101m, 102m, 100m, 101.5m, 10m), candles[0]);
        Assert.Equal(
            "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=3",
            Assert.Single(handler.Requests).RequestUri!.ToString());
    }

    [Fact]
    public async Task Orders_are_read_with_their_fill_state_and_client_id()
    {
        var handler = new StubHttpHandler().Respond(
            """{"code":"0","msg":"","data":[{"ordId":"900","clOrdId":"s656f1a2b3c4d5e6f7a8b9c0d0a1b2c","instId":"BTC-USDT","instType":"SPOT","side":"buy","ordType":"limit","state":"partially_filled","px":"96000","sz":"0.5","accFillSz":"0.2","avgPx":"95990","cTime":"1790000000000","uTime":"1790000005000"},{"ordId":"901","clOrdId":"","instId":"ETH-USDT","instType":"SPOT","side":"sell","ordType":"market","state":"live","px":"","sz":"1","accFillSz":"0","avgPx":"","cTime":"1790000001000","uTime":"1790000001000"}]}""");

        var orders = await NewClient(handler).GetOpenOrdersAsync("SPOT", "BTC-USDT", TestContext.Current.CancellationToken);

        Assert.Equal(2, orders.Count);
        Assert.Equal("partially_filled", orders[0].State);
        Assert.Equal(0.2m, orders[0].FilledSize);
        Assert.Equal(95990m, orders[0].AverageFillPrice);
        Assert.Equal("s656f1a2b3c4d5e6f7a8b9c0d0a1b2c", orders[0].ClientOrderId);
        // An empty string from OKX means "no value".
        Assert.Equal(0m, orders[1].Price);
        Assert.Equal(string.Empty, orders[1].ClientOrderId);
        Assert.Equal(
            "https://www.okx.com/api/v5/trade/orders-pending?instType=SPOT&instId=BTC-USDT",
            Assert.Single(handler.Requests).RequestUri!.ToString());
    }

    [Fact]
    public async Task The_order_book_keeps_price_and_size_per_level()
    {
        var handler = new StubHttpHandler().Respond(
            """{"code":"0","msg":"","data":[{"asks":[["97001","0.5","0","2"],["97002","1.5","0","3"]],"bids":[["97000","0.8","0","1"]],"ts":"1790000000000"}]}""");

        var book = await NewClient(handler).GetOrderBookAsync("BTC-USDT", 5000, TestContext.Current.CancellationToken);

        Assert.Equal([new BookLevel(97001m, 0.5m), new BookLevel(97002m, 1.5m)], book.Asks);
        Assert.Equal(new BookLevel(97000m, 0.8m), Assert.Single(book.Bids));
        // The depth asked for is brought into the range OKX accepts.
        Assert.EndsWith("sz=400", Assert.Single(handler.Requests).RequestUri!.Query, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("50113", "Invalid Sign", HttpStatusCode.Unauthorized, OkxFailure.Credentials)]
    [InlineData("50102", "Timestamp request expired", HttpStatusCode.Unauthorized, OkxFailure.Credentials)]
    [InlineData("51001", "Instrument ID does not exist", HttpStatusCode.OK, OkxFailure.Rejected)]
    public async Task A_refusal_by_okx_is_reported_with_its_code_and_is_not_retried(string code, string message, HttpStatusCode status, OkxFailure expected)
    {
        var handler = new StubHttpHandler().Respond($$"""{"code":"{{code}}","msg":"{{message}}","data":[]}""", status);

        var error = await Assert.ThrowsAsync<OkxException>(() => NewClient(handler).GetBalanceAsync(TestContext.Current.CancellationToken));

        Assert.Equal(expected, error.Failure);
        Assert.Equal(code, error.Code);
        Assert.Contains(message, error.Message, StringComparison.Ordinal);
        Assert.Single(handler.Requests);
        Assert.DoesNotContain("test-secret-bbbb", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_request_limit_or_a_dropped_connection_is_retried_once()
    {
        var limited = new StubHttpHandler()
            .Respond("""{"code":"50011","msg":"Too Many Requests","data":[]}""", HttpStatusCode.TooManyRequests)
            .Respond("""{"code":"0","msg":"","data":[{"totalEq":"1"}]}""");
        var dropped = new StubHttpHandler()
            .Fail(new HttpRequestException("connection reset"))
            .Respond("""{"code":"0","msg":"","data":[{"totalEq":"2"}]}""");

        Assert.Equal(1m, (await NewClient(limited).GetBalanceAsync(TestContext.Current.CancellationToken)).TotalEquityUsd);
        Assert.Equal(2m, (await NewClient(dropped).GetBalanceAsync(TestContext.Current.CancellationToken)).TotalEquityUsd);
        Assert.Equal(2, limited.Requests.Count);
        Assert.Equal(2, dropped.Requests.Count);
    }

    [Fact]
    public async Task A_failure_that_repeats_is_reported_after_the_one_retry()
    {
        var handler = new StubHttpHandler()
            .Fail(new HttpRequestException("no route"))
            .Fail(new HttpRequestException("no route"));

        var error = await Assert.ThrowsAsync<OkxException>(() => NewClient(handler).GetBalanceAsync(TestContext.Current.CancellationToken));

        Assert.Equal(OkxFailure.Network, error.Failure);
        Assert.Equal(2, handler.Requests.Count);
    }

    [Fact]
    public async Task An_answer_that_is_not_json_is_a_network_failure()
    {
        var handler = new StubHttpHandler()
            .Respond("<html>502 Bad Gateway</html>", HttpStatusCode.BadGateway)
            .Respond("<html>502 Bad Gateway</html>", HttpStatusCode.BadGateway);

        var error = await Assert.ThrowsAsync<OkxException>(() => NewClient(handler).GetBalanceAsync(TestContext.Current.CancellationToken));

        Assert.Equal(OkxFailure.Network, error.Failure);
    }

    [Fact]
    public async Task An_instrument_okx_does_not_know_is_a_refusal_not_an_empty_ticker()
    {
        var handler = new StubHttpHandler().Respond("""{"code":"0","msg":"","data":[]}""");

        var error = await Assert.ThrowsAsync<OkxException>(() => NewClient(handler).GetTickerAsync("NOPE-USDT", TestContext.Current.CancellationToken));

        Assert.Equal(OkxFailure.Rejected, error.Failure);
    }

    [Fact]
    public void The_client_cannot_change_anything_on_the_exchange()
    {
        // The risk gate is the only way to an order. A write method here would be a way around it.
        var methods = typeof(OkxClient)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Select(method => method.Name)
            .ToList();

        Assert.NotEmpty(methods);
        Assert.All(methods, name => Assert.StartsWith("Get", name, StringComparison.Ordinal));

        var source = File.ReadAllText(SourceFile());
        Assert.DoesNotContain("HttpMethod.Post", source, StringComparison.Ordinal);
        Assert.DoesNotContain("HttpMethod.Put", source, StringComparison.Ordinal);
        Assert.DoesNotContain("HttpMethod.Delete", source, StringComparison.Ordinal);
    }

    private static OkxClient NewClient(StubHttpHandler handler, bool sandbox = false) =>
        new(new HttpClient(handler), () => _credentials, () => sandbox, new FixedTime(_now), NullLogger<OkxClient>.Instance, retryDelay: TimeSpan.Zero);

    private static string Header(HttpRequestMessage request, string name) => Assert.Single(request.Headers.GetValues(name));

    private static string SourceFile([System.Runtime.CompilerServices.CallerFilePath] string thisFile = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(thisFile)!, "..", "..", "src", "TradingAgent.Exchange", "Okx", "OkxClient.cs"));

    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
