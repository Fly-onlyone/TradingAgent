using System.Globalization;
using System.Text;
using System.Text.Json;
using TradingAgent.Agent.Models;
using TradingAgent.Exchange.Analysis;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.Agent.Tools;

/// <summary>Helpers shared by the tools that read from the exchange.</summary>
internal static class ToolJson
{
    /// <summary>The text of a string argument, trimmed; null when it is missing, empty or not a string.</summary>
    public static string? Text(JsonElement input, string name) =>
        input.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString())
            ? value.GetString()!.Trim()
            : null;

    /// <summary>A whole-number argument. Models also send numbers as text ("20"), which is accepted.</summary>
    public static int Integer(JsonElement input, string name, int fallback)
    {
        if (!input.TryGetProperty(name, out var value))
        {
            return fallback;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetInt32(out var number) => number,
            JsonValueKind.String when int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => fallback,
        };
    }

    public static string Write(Action<Utf8JsonWriter> write)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            write(writer);
        }

        return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
    }

    public static ToolOutcome MissingSymbol { get; } =
        ToolOutcome.Failed("'symbol' is required, for example \"BTC-USDT\".");
}

/// <summary>Latest price and 24-hour figures of one instrument.</summary>
public sealed class GetTickerTool(IOkxReader okx) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "get_ticker",
        "Get the latest price, best bid and ask, and 24-hour high, low, volume and change of one instrument on OKX.",
        """
        {
          "type": "object",
          "properties": {
            "symbol": { "type": "string", "description": "Instrument id, for example BTC-USDT or BTC-USDT-SWAP." }
          },
          "required": ["symbol"]
        }
        """);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        if (ToolJson.Text(input, "symbol") is not { } symbol)
        {
            return ToolJson.MissingSymbol;
        }

        var ticker = await okx.GetTickerAsync(symbol.ToUpperInvariant(), cancellationToken).ConfigureAwait(false);
        return new ToolOutcome(
            ToolJson.Write(writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("symbol", ticker.InstrumentId);
                writer.WriteNumber("last_price", ticker.Last);
                writer.WriteNumber("bid", ticker.Bid);
                writer.WriteNumber("ask", ticker.Ask);
                writer.WriteNumber("open_24h", ticker.Open24h);
                writer.WriteNumber("high_24h", ticker.High24h);
                writer.WriteNumber("low_24h", ticker.Low24h);
                writer.WriteNumber("volume_24h", ticker.Volume24h);
                writer.WriteNumber("change_24h_pct", Math.Round(ticker.ChangePercent24h, 2));
                writer.WriteNumber("timestamp_ms", ticker.Timestamp);
                writer.WriteEndObject();
            }),
            SummaryJson: ticker.Last.ToString(CultureInfo.InvariantCulture));
    }
}

/// <summary>Price history of one instrument.</summary>
public sealed class GetCandlesticksTool(IOkxReader okx) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "get_candlesticks",
        "Get price history (open, high, low, close, volume per bar) of one instrument on OKX, oldest bar first. "
        + "Use get_technical_indicators instead when you only need RSI, moving averages, ATR or Bollinger bands.",
        """
        {
          "type": "object",
          "properties": {
            "symbol": { "type": "string", "description": "Instrument id, for example BTC-USDT." },
            "timeframe": { "type": "string", "description": "Bar size: 1m, 5m, 15m, 1H, 4H, 1D or 1W. Default 1H." },
            "limit": { "type": "integer", "description": "Number of bars, 1 to 300. Default 100." }
          },
          "required": ["symbol"]
        }
        """);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        if (ToolJson.Text(input, "symbol") is not { } symbol)
        {
            return ToolJson.MissingSymbol;
        }

        var timeframe = ToolJson.Text(input, "timeframe") ?? "1H";
        var candles = await okx
            .GetCandlesAsync(symbol.ToUpperInvariant(), timeframe, ToolJson.Integer(input, "limit", 100), cancellationToken)
            .ConfigureAwait(false);

        return new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("symbol", symbol.ToUpperInvariant());
            writer.WriteString("timeframe", timeframe);
            writer.WriteNumber("count", candles.Count);
            // Arrays, not objects: the same data in a third of the tokens.
            writer.WriteString("columns", "time_ms, open, high, low, close, volume");
            writer.WriteStartArray("candles");
            foreach (var candle in candles)
            {
                writer.WriteStartArray();
                writer.WriteNumberValue(candle.OpenTime);
                writer.WriteNumberValue(candle.Open);
                writer.WriteNumberValue(candle.High);
                writer.WriteNumberValue(candle.Low);
                writer.WriteNumberValue(candle.Close);
                writer.WriteNumberValue(candle.Volume);
                writer.WriteEndArray();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }));
    }
}

/// <summary>Resting orders around the current price.</summary>
public sealed class GetOrderBookTool(IOkxReader okx) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "get_orderbook",
        "Get the order book of one instrument on OKX: the best bids (highest first) and asks (lowest first) as [price, size].",
        """
        {
          "type": "object",
          "properties": {
            "symbol": { "type": "string", "description": "Instrument id, for example BTC-USDT." },
            "depth": { "type": "integer", "description": "Levels per side, 1 to 100. Default 20." }
          },
          "required": ["symbol"]
        }
        """);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        if (ToolJson.Text(input, "symbol") is not { } symbol)
        {
            return ToolJson.MissingSymbol;
        }

        var depth = Math.Clamp(ToolJson.Integer(input, "depth", 20), 1, 100);
        var book = await okx.GetOrderBookAsync(symbol.ToUpperInvariant(), depth, cancellationToken).ConfigureAwait(false);

        return new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("symbol", book.InstrumentId);
            WriteLevels(writer, "bids", book.Bids);
            WriteLevels(writer, "asks", book.Asks);
            if (book.Bids.Count > 0 && book.Asks.Count > 0)
            {
                writer.WriteNumber("spread", book.Asks[0].Price - book.Bids[0].Price);
            }

            writer.WriteNumber("timestamp_ms", book.Timestamp);
            writer.WriteEndObject();
        }));
    }

    private static void WriteLevels(Utf8JsonWriter writer, string name, IReadOnlyList<BookLevel> levels)
    {
        writer.WriteStartArray(name);
        foreach (var level in levels)
        {
            writer.WriteStartArray();
            writer.WriteNumberValue(level.Price);
            writer.WriteNumberValue(level.Size);
            writer.WriteEndArray();
        }

        writer.WriteEndArray();
    }
}

/// <summary>RSI, moving averages, ATR and Bollinger bands of one instrument.</summary>
public sealed class GetTechnicalIndicatorsTool(IOkxReader okx) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "get_technical_indicators",
        "Get technical indicators of one instrument on OKX for the newest bar: price, SMA 20 and 50, trend, "
        + "RSI 14, ATR 14 and Bollinger bands (20, 2). Computed from the last 200 bars.",
        """
        {
          "type": "object",
          "properties": {
            "symbol": { "type": "string", "description": "Instrument id, for example BTC-USDT." },
            "timeframe": { "type": "string", "description": "Bar size: 15m, 1H, 4H or 1D. Default 1H." }
          },
          "required": ["symbol"]
        }
        """);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        if (ToolJson.Text(input, "symbol") is not { } symbol)
        {
            return ToolJson.MissingSymbol;
        }

        var timeframe = ToolJson.Text(input, "timeframe") ?? "1H";
        var candles = await okx.GetCandlesAsync(symbol.ToUpperInvariant(), timeframe, 200, cancellationToken).ConfigureAwait(false);
        if (Indicators.Compute(candles) is not { } snapshot)
        {
            return ToolOutcome.Failed(string.Create(
                CultureInfo.InvariantCulture,
                $"Only {candles.Count} bars of history exist for {symbol} at {timeframe}; {Indicators.MinimumBars} are needed."));
        }

        return new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("symbol", symbol.ToUpperInvariant());
            writer.WriteString("timeframe", timeframe);
            writer.WriteNumber("price", snapshot.Price);
            writer.WriteNumber("sma_20", snapshot.Sma20);
            writer.WriteNumber("sma_50", snapshot.Sma50);
            writer.WriteString("trend", snapshot.Trend switch { Trend.Bullish => "bullish", Trend.Bearish => "bearish", _ => "neutral" });
            writer.WriteNumber("rsi_14", Math.Round(snapshot.Rsi14, 2));
            writer.WriteString("rsi_signal", snapshot.Rsi14 > 70 ? "overbought" : snapshot.Rsi14 < 30 ? "oversold" : "neutral");
            writer.WriteNumber("atr_14", snapshot.Atr14);
            writer.WriteNumber("atr_pct_of_price", Math.Round(snapshot.AtrPercent, 2));
            writer.WriteStartObject("bollinger_bands");
            writer.WriteNumber("upper", snapshot.BollingerUpper);
            writer.WriteNumber("middle", snapshot.BollingerMiddle);
            writer.WriteNumber("lower", snapshot.BollingerLower);
            writer.WriteNumber("position", Math.Round(snapshot.BollingerPosition, 2));
            writer.WriteEndObject();
            writer.WriteEndObject();
        }));
    }
}

/// <summary>The account's equity and balances.</summary>
public sealed class GetAccountBalanceTool(IOkxReader okx) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "get_account_balance",
        "Get the OKX trading account: total equity in US dollars and, per currency, the equity, what is available, and its US dollar value.",
        """{ "type": "object", "properties": {} }""");

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var balance = await okx.GetBalanceAsync(cancellationToken).ConfigureAwait(false);
        return new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteNumber("total_equity_usd", balance.TotalEquityUsd);
            writer.WriteStartArray("balances");
            foreach (var asset in balance.Assets)
            {
                writer.WriteStartObject();
                writer.WriteString("currency", asset.Currency);
                writer.WriteNumber("equity", asset.Equity);
                writer.WriteNumber("available", asset.Available);
                writer.WriteNumber("equity_usd", asset.EquityUsd);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }));
    }
}

/// <summary>Open positions.</summary>
public sealed class GetPositionsTool(IOkxReader okx) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "get_positions",
        "Get the open positions of the OKX account (swap, futures, margin, option). Spot holdings are balances: use get_account_balance for them.",
        """
        {
          "type": "object",
          "properties": {
            "inst_type": { "type": "string", "description": "Only this type: SWAP, FUTURES, MARGIN or OPTION. All types when left out." }
          }
        }
        """);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var positions = await okx.GetPositionsAsync(ToolJson.Text(input, "inst_type")?.ToUpperInvariant(), cancellationToken).ConfigureAwait(false);
        return new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteNumber("count", positions.Count);
            writer.WriteStartArray("positions");
            foreach (var position in positions)
            {
                writer.WriteStartObject();
                writer.WriteString("symbol", position.InstrumentId);
                writer.WriteString("type", position.InstrumentType);
                writer.WriteString("side", position.Side);
                writer.WriteNumber("size", position.Size);
                writer.WriteNumber("average_price", position.AveragePrice);
                writer.WriteNumber("mark_price", position.MarkPrice);
                writer.WriteNumber("unrealized_pnl", position.UnrealizedPnl);
                writer.WriteNumber("leverage", position.Leverage);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }));
    }
}

/// <summary>Orders that are not finished yet.</summary>
public sealed class GetOpenOrdersTool(IOkxReader okx) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "get_open_orders",
        "Get the orders of the OKX account that are still open (live or partially filled).",
        """
        {
          "type": "object",
          "properties": {
            "inst_type": { "type": "string", "description": "SPOT (default), SWAP, FUTURES, MARGIN or OPTION." },
            "symbol": { "type": "string", "description": "Only orders of this instrument, for example BTC-USDT." }
          }
        }
        """);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var orders = await okx
            .GetOpenOrdersAsync(
                ToolJson.Text(input, "inst_type")?.ToUpperInvariant() ?? "SPOT",
                ToolJson.Text(input, "symbol")?.ToUpperInvariant(),
                cancellationToken)
            .ConfigureAwait(false);

        return new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteNumber("count", orders.Count);
            writer.WriteStartArray("orders");
            foreach (var order in orders)
            {
                writer.WriteStartObject();
                writer.WriteString("order_id", order.OrderId);
                writer.WriteString("symbol", order.InstrumentId);
                writer.WriteString("side", order.Side);
                writer.WriteString("type", order.OrderType);
                writer.WriteString("state", order.State);
                writer.WriteNumber("price", order.Price);
                writer.WriteNumber("size", order.Size);
                writer.WriteNumber("filled_size", order.FilledSize);
                writer.WriteNumber("created_ms", order.CreatedAt);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }));
    }
}
