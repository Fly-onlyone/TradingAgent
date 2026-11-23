using System.Text.Json;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using TradingAgent.Exchange.Okx;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class MarketToolsTests
{
    private static readonly ToolContext _context = new("session", "message", "toolu_1");

    [Fact]
    public async Task The_ticker_tool_reports_the_price_and_the_change_over_a_day()
    {
        var okx = new StubOkx { Ticker = new Ticker("BTC-USDT", 97000m, 96999m, 97001m, 95000m, 98000m, 94000m, 1234.5m, 1790000000000) };

        var outcome = await Invoke(new GetTickerTool(okx), """{"symbol":"btc-usdt"}""");

        Assert.Equal(ToolCallStatus.Succeeded, outcome.Status);
        using var result = JsonDocument.Parse(outcome.Content);
        Assert.Equal(97000m, result.RootElement.GetProperty("last_price").GetDecimal());
        Assert.Equal(2.11m, result.RootElement.GetProperty("change_24h_pct").GetDecimal());
        // Symbols are sent to the exchange in its spelling, whatever the model typed.
        Assert.Equal("BTC-USDT", okx.LastSymbol);
        Assert.Equal("97000", outcome.SummaryJson);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("""{"symbol":""}""")]
    [InlineData("""{"symbol":42}""")]
    public async Task A_tool_that_needs_a_symbol_says_so_without_calling_the_exchange(string input)
    {
        var okx = new StubOkx();

        foreach (ITool tool in new ITool[] { new GetTickerTool(okx), new GetCandlesticksTool(okx), new GetOrderBookTool(okx), new GetTechnicalIndicatorsTool(okx) })
        {
            var outcome = await Invoke(tool, input);

            Assert.Equal(ToolCallStatus.Failed, outcome.Status);
            Assert.Contains("symbol", outcome.Content, StringComparison.Ordinal);
        }

        Assert.Null(okx.LastSymbol);
    }

    [Fact]
    public async Task Price_history_is_given_as_rows_with_named_columns()
    {
        var okx = new StubOkx { Candles = [new Candle(1000, 101m, 102m, 100m, 101.5m, 10m), new Candle(2000, 102m, 103m, 101m, 102.5m, 20m)] };

        var outcome = await Invoke(new GetCandlesticksTool(okx), """{"symbol":"BTC-USDT","timeframe":"4H","limit":"2"}""");

        using var result = JsonDocument.Parse(outcome.Content);
        Assert.Equal("4H", result.RootElement.GetProperty("timeframe").GetString());
        Assert.Equal(2, result.RootElement.GetProperty("count").GetInt32());
        Assert.Equal("time_ms, open, high, low, close, volume", result.RootElement.GetProperty("columns").GetString());
        Assert.Equal(101.5m, result.RootElement.GetProperty("candles")[0][4].GetDecimal());
        // A limit sent as text is still a number.
        Assert.Equal(2, okx.LastLimit);
        Assert.Equal("4H", okx.LastBar);
    }

    [Fact]
    public async Task Indicators_need_enough_history()
    {
        var okx = new StubOkx { Candles = [new Candle(1000, 101m, 102m, 100m, 101.5m, 10m)] };

        var outcome = await Invoke(new GetTechnicalIndicatorsTool(okx), """{"symbol":"NEW-USDT"}""");

        Assert.Equal(ToolCallStatus.Failed, outcome.Status);
        Assert.Contains("50", outcome.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Indicators_are_reported_with_their_reading()
    {
        var candles = new List<Candle>();
        for (var i = 0; i < 60; i++)
        {
            var close = 100m + i;
            candles.Add(new Candle(i * 3_600_000L, close, close + 1, close - 1, close, 10));
        }

        var outcome = await Invoke(new GetTechnicalIndicatorsTool(new StubOkx { Candles = candles }), """{"symbol":"BTC-USDT"}""");

        using var result = JsonDocument.Parse(outcome.Content);
        Assert.Equal("bullish", result.RootElement.GetProperty("trend").GetString());
        Assert.Equal("overbought", result.RootElement.GetProperty("rsi_signal").GetString());
        Assert.Equal(100, result.RootElement.GetProperty("rsi_14").GetDouble());
        Assert.True(result.RootElement.GetProperty("bollinger_bands").GetProperty("upper").GetDouble() > 159);
    }

    [Fact]
    public async Task The_balance_tool_lists_every_currency()
    {
        var okx = new StubOkx { Balance = new AccountBalance(12500.5m, [new AssetBalance("USDT", 10000m, 9000m, 10000m), new AssetBalance("BTC", 0.025m, 0.025m, 2500.5m)]) };

        var outcome = await Invoke(new GetAccountBalanceTool(okx), "{}");

        using var result = JsonDocument.Parse(outcome.Content);
        Assert.Equal(12500.5m, result.RootElement.GetProperty("total_equity_usd").GetDecimal());
        Assert.Equal(2, result.RootElement.GetProperty("balances").GetArrayLength());
        Assert.Equal(9000m, result.RootElement.GetProperty("balances")[0].GetProperty("available").GetDecimal());
    }

    [Fact]
    public async Task Open_orders_default_to_spot_and_can_be_narrowed_to_a_symbol()
    {
        var okx = new StubOkx
        {
            Orders = [new OkxOrder("900", "", "BTC-USDT", "SPOT", "buy", "limit", "live", 96000m, 0.5m, 0m, 0m, 1790000000000, 1790000000000)],
        };

        var all = await Invoke(new GetOpenOrdersTool(okx), "{}");
        Assert.Equal(("SPOT", null), (okx.LastInstrumentType, okx.LastSymbol));
        await Invoke(new GetOpenOrdersTool(okx), """{"inst_type":"swap","symbol":"btc-usdt-swap"}""");
        Assert.Equal(("SWAP", "BTC-USDT-SWAP"), (okx.LastInstrumentType, okx.LastSymbol));

        using var result = JsonDocument.Parse(all.Content);
        Assert.Equal(1, result.RootElement.GetProperty("count").GetInt32());
        Assert.Equal("900", result.RootElement.GetProperty("orders")[0].GetProperty("order_id").GetString());
    }

    [Fact]
    public async Task Through_the_host_a_failure_of_the_exchange_becomes_an_answer_for_the_model()
    {
        var okx = new StubOkx { Failure = new OkxException(OkxFailure.Credentials, "No OKX API key is saved. Add one in Settings.") };
        var host = new ToolHost([new GetAccountBalanceTool(okx)], [], Microsoft.Extensions.Logging.Abstractions.NullLogger<ToolHost>.Instance);

        var outcome = await host.InvokeAsync(new Models.ToolRequest("toolu_1", "get_account_balance", "{}"), _context, TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Failed, outcome.Status);
        Assert.Contains("No OKX API key is saved", outcome.Content, StringComparison.Ordinal);
    }

    [Fact]
    public void No_exchange_tool_can_change_anything()
    {
        string[] names =
        [
            new GetTickerTool(new StubOkx()).Definition.Name,
            new GetCandlesticksTool(new StubOkx()).Definition.Name,
            new GetOrderBookTool(new StubOkx()).Definition.Name,
            new GetTechnicalIndicatorsTool(new StubOkx()).Definition.Name,
            new GetAccountBalanceTool(new StubOkx()).Definition.Name,
            new GetPositionsTool(new StubOkx()).Definition.Name,
            new GetOpenOrdersTool(new StubOkx()).Definition.Name,
        ];

        Assert.All(names, name => Assert.StartsWith("get_", name, StringComparison.Ordinal));
        Assert.Equal(names.Length, names.Distinct().Count());
    }

    private static async Task<ToolOutcome> Invoke(ITool tool, string input)
    {
        using var document = JsonDocument.Parse(input);
        return await tool.InvokeAsync(document.RootElement, _context, TestContext.Current.CancellationToken);
    }

    private sealed class StubOkx : IOkxReader
    {
        public Ticker Ticker { get; init; } = new("BTC-USDT", 1, 1, 1, 1, 1, 1, 1, 0);

        public IReadOnlyList<Candle> Candles { get; init; } = [];

        public AccountBalance Balance { get; init; } = new(0, []);

        public IReadOnlyList<OkxOrder> Orders { get; init; } = [];

        public Exception? Failure { get; init; }

        public string? LastSymbol { get; private set; }

        public string? LastInstrumentType { get; private set; }

        public string? LastBar { get; private set; }

        public int LastLimit { get; private set; }

        public Task<Ticker> GetTickerAsync(string instrumentId, CancellationToken cancellationToken)
        {
            LastSymbol = instrumentId;
            return Result(Ticker);
        }

        public Task<IReadOnlyList<Candle>> GetCandlesAsync(string instrumentId, string bar, int limit, CancellationToken cancellationToken)
        {
            (LastSymbol, LastBar, LastLimit) = (instrumentId, bar, limit);
            return Result(Candles);
        }

        public Task<OrderBook> GetOrderBookAsync(string instrumentId, int depth, CancellationToken cancellationToken)
        {
            LastSymbol = instrumentId;
            return Result(new OrderBook(instrumentId, [], [], 0));
        }

        public Task<AccountBalance> GetBalanceAsync(CancellationToken cancellationToken) => Result(Balance);

        public Task<IReadOnlyList<Position>> GetPositionsAsync(string? instrumentType, CancellationToken cancellationToken)
        {
            LastInstrumentType = instrumentType;
            return Result<IReadOnlyList<Position>>([]);
        }

        public Task<IReadOnlyList<OkxOrder>> GetOpenOrdersAsync(string instrumentType, string? instrumentId, CancellationToken cancellationToken)
        {
            (LastInstrumentType, LastSymbol) = (instrumentType, instrumentId);
            return Result(Orders);
        }

        public Task<IReadOnlyList<Ticker>> GetTickersAsync(string instrumentType, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<IReadOnlyList<Instrument>> GetInstrumentsAsync(string instrumentType, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<IReadOnlyList<OkxOrder>> GetOrderHistoryAsync(string instrumentType, int limit, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<IReadOnlyList<OkxAlgoOrder>> GetPendingAlgoOrdersAsync(string instrumentType, string orderType, CancellationToken cancellationToken) => throw new NotSupportedException();

        private Task<T> Result<T>(T value) => Failure is null ? Task.FromResult(value) : Task.FromException<T>(Failure);
    }
}
