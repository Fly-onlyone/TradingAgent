using System.Globalization;
using TradingAgent.Core.Settings;
using TradingAgent.Exchange.Analysis;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.Exchange.Risk;

/// <summary>What the risk check advises for a proposed trade.</summary>
public enum RiskRecommendation
{
    /// <summary>Score below 20.</summary>
    Proceed,

    /// <summary>Score 20 to 39.</summary>
    Acceptable,

    /// <summary>Score 40 to 59. The trade is allowed.</summary>
    Caution,

    /// <summary>Score 60 or more. The risk gate refuses the trade.</summary>
    Avoid,
}

/// <summary>The outcome of <see cref="RiskManager.AssessTradeAsync"/>.</summary>
public sealed record RiskAssessment
{
    public required string Symbol { get; init; }

    public required string Side { get; init; }

    public decimal Quantity { get; init; }

    public decimal EntryPrice { get; init; }

    public decimal PositionValueUsd { get; init; }

    /// <summary>The position as a percentage of the account's equity.</summary>
    public decimal PositionPercent { get; init; }

    /// <summary>0 to 115. Higher is riskier.</summary>
    public int Score { get; init; }

    public RiskRecommendation Recommendation { get; init; }

    /// <summary>One sentence per rule that added to the score.</summary>
    public IReadOnlyList<string> Warnings { get; init; } = [];

    /// <summary>Null when there was too little price history to compute indicators.</summary>
    public TechnicalSnapshot? Indicators { get; init; }
}

/// <summary>Scores a proposed trade against the account and the market. No model is involved.</summary>
/// <remarks>
/// The scoring is the previous app's, rule for rule, because the risk gate's behaviour is defined by
/// it: only a score of 60 or more refuses a trade, and position size alone can add at most 45, so a
/// trade is refused only when size and market conditions are bad together.
/// <code>
/// position larger than the limit                      +30
/// position larger than 80 % of the limit               +15  (also when the rule above fired)
/// buying with RSI above 70, selling with RSI below 30  +20
/// buying above 90 % of the Bollinger range,
///   selling below 10 %                                 +15
/// average true range above 5 % of the price            +20
/// buying in a bearish trend, selling in a bullish one  +15
/// </code>
/// </remarks>
public sealed class RiskManager(IOkxReader okx, ISettingsStore settings)
{
    /// <summary>Bar size the indicators are computed on.</summary>
    public const string IndicatorBar = "1H";

    private const int IndicatorBars = 200;

    /// <summary>Assesses a trade of <paramref name="quantity"/> units of <paramref name="symbol"/>.</summary>
    /// <param name="symbol">The instrument, for example <c>BTC-USDT</c>.</param>
    /// <param name="side"><c>buy</c> or <c>sell</c>.</param>
    /// <param name="quantity">Size in units of the instrument.</param>
    /// <param name="entryPrice">The price to value the trade at; the latest price when null.</param>
    /// <param name="cancellationToken">Cancels the requests to the exchange.</param>
    /// <exception cref="OkxException">
    /// The balance or the price could not be read. There is then no assessment: the caller must treat
    /// the trade as not assessed, never as safe.
    /// </exception>
    public async Task<RiskAssessment> AssessTradeAsync(
        string symbol,
        string side,
        decimal quantity,
        decimal? entryPrice,
        CancellationToken cancellationToken)
    {
        var maxPositionPercent = (decimal)settings.GetValue(SettingKeys.RiskMaxPositionSizePercent);
        var buying = string.Equals(side, "buy", StringComparison.OrdinalIgnoreCase);
        var selling = string.Equals(side, "sell", StringComparison.OrdinalIgnoreCase);

        var balance = await okx.GetBalanceAsync(cancellationToken).ConfigureAwait(false);
        var price = entryPrice ?? (await okx.GetTickerAsync(symbol, cancellationToken).ConfigureAwait(false)).Last;

        var positionValue = quantity * price;
        // With no equity every position is the whole account.
        var positionPercent = balance.TotalEquityUsd > 0 ? positionValue / balance.TotalEquityUsd * 100 : 100;

        var warnings = new List<string>();
        var score = 0;

        if (positionPercent > maxPositionPercent)
        {
            warnings.Add(string.Create(
                CultureInfo.InvariantCulture,
                $"Position size ({positionPercent:0.0}%) exceeds the limit ({maxPositionPercent:0.#}%)"));
            score += 30;
        }

        if (positionPercent > maxPositionPercent * 0.8m)
        {
            warnings.Add("Position size is close to the limit");
            score += 15;
        }

        // Indicators are a help, not a requirement: without them only the size rules apply, as before.
        var indicators = await TryGetIndicatorsAsync(symbol, cancellationToken).ConfigureAwait(false);
        if (indicators is not null)
        {
            if (buying && indicators.Rsi14 > 70)
            {
                warnings.Add(string.Create(CultureInfo.InvariantCulture, $"RSI ({indicators.Rsi14:0}) is overbought: risky to buy"));
                score += 20;
            }
            else if (selling && indicators.Rsi14 < 30)
            {
                warnings.Add(string.Create(CultureInfo.InvariantCulture, $"RSI ({indicators.Rsi14:0}) is oversold: risky to sell"));
                score += 20;
            }

            if (buying && indicators.BollingerPosition > 0.9)
            {
                warnings.Add("Price is near the upper Bollinger band: possible resistance");
                score += 15;
            }
            else if (selling && indicators.BollingerPosition < 0.1)
            {
                warnings.Add("Price is near the lower Bollinger band: possible support");
                score += 15;
            }

            if (indicators.AtrPercent > 5)
            {
                warnings.Add(string.Create(CultureInfo.InvariantCulture, $"High volatility (ATR {indicators.AtrPercent:0.0}% of the price)"));
                score += 20;
            }

            if (buying && indicators.Trend == Trend.Bearish)
            {
                warnings.Add("Buying against a bearish trend");
                score += 15;
            }
            else if (selling && indicators.Trend == Trend.Bullish)
            {
                warnings.Add("Selling against a bullish trend");
                score += 15;
            }
        }

        return new RiskAssessment
        {
            Symbol = symbol,
            Side = side,
            Quantity = quantity,
            EntryPrice = price,
            PositionValueUsd = positionValue,
            PositionPercent = positionPercent,
            Score = score,
            Recommendation = score switch
            {
                >= 60 => RiskRecommendation.Avoid,
                >= 40 => RiskRecommendation.Caution,
                >= 20 => RiskRecommendation.Acceptable,
                _ => RiskRecommendation.Proceed,
            },
            Warnings = warnings,
            Indicators = indicators,
        };
    }

    private async Task<TechnicalSnapshot?> TryGetIndicatorsAsync(string symbol, CancellationToken cancellationToken)
    {
        try
        {
            var candles = await okx.GetCandlesAsync(symbol, IndicatorBar, IndicatorBars, cancellationToken).ConfigureAwait(false);
            return Indicators.Compute(candles);
        }
        catch (OkxException)
        {
            return null;
        }
    }
}
