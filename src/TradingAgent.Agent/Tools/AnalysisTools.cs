using System.Text.Json;
using TradingAgent.Agent.Models;
using TradingAgent.Data.News;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Analysis;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.Agent.Tools;

/// <summary>
/// One call for the whole picture of an instrument: price, indicators on four timeframes, the order
/// book's balance, what past signals were worth, and the newest news.
/// </summary>
/// <remarks>
/// This stands where the previous app had helper agents for technical, news and risk analysis. It is
/// plain computation: the same data in one result, without a second model run to pay for and wait on.
/// </remarks>
public sealed class AnalyzeMarketTool(IOkxReader okx, NewsRepository news, TradeRepository trades) : ITool
{
    private static readonly string[] _timeframes = ["15m", "1H", "4H", "1D"];

    public ToolDefinition Definition { get; } = new(
        "analyze_market",
        "Get the whole picture of one instrument in one call: price, trend, RSI, averages, ATR and Bollinger position on the 15m, 1H, 4H and 1D "
        + "timeframes, the balance of the order book, what past signals on this instrument were worth, and the newest news about the coin. "
        + "Start an analysis with this; use the single tools for more detail.",
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
        if (ToolJson.Text(input, "symbol") is not { } given)
        {
            return ToolJson.MissingSymbol;
        }

        var symbol = given.ToUpperInvariant();
        var ticker = await okx.GetTickerAsync(symbol, cancellationToken).ConfigureAwait(false);
        var histories = await Task
            .WhenAll(_timeframes.Select(timeframe => okx.GetCandlesAsync(symbol, timeframe, 120, cancellationToken)))
            .ConfigureAwait(false);
        var book = await okx.GetOrderBookAsync(symbol, 20, cancellationToken).ConfigureAwait(false);
        var bids = book.Bids.Sum(level => level.Size);
        var asks = book.Asks.Sum(level => level.Size);
        var asset = symbol.Split('-')[0];
        // The patterns are measured on the spot instrument; a swap of the same coin moves with it.
        var spot = symbol.Split('-') is [var coin, var quote, ..] ? $"{coin}-{quote}" : symbol;

        return new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("symbol", symbol);
            writer.WriteNumber("last_price", ticker.Last);
            writer.WriteNumber("change_24h_pct", Math.Round(ticker.ChangePercent24h, 2));
            writer.WriteNumber("high_24h", ticker.High24h);
            writer.WriteNumber("low_24h", ticker.Low24h);

            writer.WriteStartObject("timeframes");
            for (var index = 0; index < _timeframes.Length; index++)
            {
                writer.WriteStartObject(_timeframes[index]);
                if (Indicators.Compute(histories[index]) is { } snapshot)
                {
                    writer.WriteString("trend", snapshot.Trend.ToString().ToLowerInvariant());
                    writer.WriteNumber("rsi_14", Math.Round(snapshot.Rsi14, 1));
                    writer.WriteNumber("sma_20", Math.Round(snapshot.Sma20, 8));
                    writer.WriteNumber("sma_50", Math.Round(snapshot.Sma50, 8));
                    writer.WriteNumber("atr_pct", Math.Round(snapshot.AtrPercent, 2));
                    writer.WriteNumber("bollinger_position", Math.Round(snapshot.BollingerPosition, 2));
                }
                else
                {
                    writer.WriteString("note", "Not enough price history.");
                }

                writer.WriteEndObject();
            }

            writer.WriteEndObject();

            writer.WriteStartObject("order_book");
            writer.WriteNumber("bid_share_top_20", bids + asks > 0 ? Math.Round(bids / (bids + asks), 2) : 0.5m);
            writer.WriteString("meaning", "Share of the resting size on the bid side in the best 20 levels. Above 0.5: more buyers waiting.");
            writer.WriteEndObject();

            writer.WriteStartArray("past_signals");
            foreach (var pattern in trades.ListPatterns(spot, 8))
            {
                writer.WriteStartObject();
                writer.WriteString("signal", pattern.Name);
                writer.WriteNumber("higher_after_pct_of_cases", Math.Round(pattern.SuccessRate * 100));
                writer.WriteNumber("average_move_pct", Math.Round(pattern.AverageReturn, 2));
                writer.WriteNumber("cases", pattern.SampleCount);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();

            writer.WriteStartArray("news");
            foreach (var article in news.Recent(5, asset))
            {
                writer.WriteStartObject();
                writer.WriteString("title", article.Title);
                writer.WriteString("source", article.SourceName);
                writer.WriteString("published", ToolArgs.Time(article.PublishedAt ?? article.FetchedAt));
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }));
    }
}

/// <summary>The closed trades and what they came to.</summary>
public sealed class GetTradeHistoryTool(TradeRepository trades, TimeProvider time) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "get_trade_history",
        "Get the trades closed through this app with their profit or loss, newest first, and the totals of the last 1, 7 and 30 days. "
        + "Profit and loss is worked out by the app without fees, so it is close to, not equal to, what OKX shows.",
        """
        {
          "type": "object",
          "properties": {
            "limit": { "type": "integer", "description": "How many trades, 1 to 50. Default 20." }
          }
        }
        """);

    public Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var closed = trades.ListTrades(Math.Clamp(ToolJson.Integer(input, "limit", 20), 1, 50));
        var now = time.GetUtcNow();
        return Task.FromResult(new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            foreach (var days in (int[])[1, 7, 30])
            {
                var summary = trades.RealizedSince(now.AddDays(-days).ToUnixTimeMilliseconds());
                writer.WriteStartObject($"last_{days}_days");
                writer.WriteNumber("realized_pnl", Math.Round(summary.Pnl, 2));
                writer.WriteNumber("trades", summary.Trades);
                writer.WriteNumber("winning_trades", summary.Wins);
                writer.WriteEndObject();
            }

            writer.WriteStartArray("trades");
            foreach (var trade in closed)
            {
                writer.WriteStartObject();
                writer.WriteString("symbol", trade.Symbol);
                writer.WriteString("closed_with", trade.Side);
                writer.WriteNumber("quantity", trade.FilledQuantity);
                writer.WriteNumber("entry_price", trade.EntryPrice ?? 0);
                writer.WriteNumber("exit_price", trade.AverageFillPrice ?? 0);
                writer.WriteNumber("pnl", Math.Round(trade.RealizedPnl ?? 0, 2));
                writer.WriteNumber("pnl_pct", Math.Round(trade.RealizedPnlPercent ?? 0, 2));
                writer.WriteString("closed", ToolArgs.Time(trade.ClosedAt));
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        })));
    }
}
