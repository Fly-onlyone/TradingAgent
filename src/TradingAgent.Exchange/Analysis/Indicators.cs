using TradingAgent.Exchange.Okx;

namespace TradingAgent.Exchange.Analysis;

/// <summary>Direction of the price against its 20- and 50-bar averages.</summary>
public enum Trend
{
    Neutral,
    Bullish,
    Bearish,
}

/// <summary>The indicators the risk check and the agent read, for the newest bar of a price history.</summary>
/// <param name="Price">Close of the newest bar.</param>
/// <param name="Sma20">Average close of the last 20 bars.</param>
/// <param name="Sma50">Average close of the last 50 bars.</param>
/// <param name="Trend">Bullish above both averages, bearish below both, else neutral.</param>
/// <param name="Rsi14">Relative strength index over 14 bars, 0 to 100.</param>
/// <param name="Atr14">Average true range over 14 bars, in price units.</param>
/// <param name="BollingerUpper">Upper band: 20-bar average plus two standard deviations.</param>
/// <param name="BollingerMiddle">The 20-bar average.</param>
/// <param name="BollingerLower">Lower band.</param>
public sealed record TechnicalSnapshot(
    double Price,
    double Sma20,
    double Sma50,
    Trend Trend,
    double Rsi14,
    double Atr14,
    double BollingerUpper,
    double BollingerMiddle,
    double BollingerLower)
{
    /// <summary>Where the price sits between the bands: 0 at the lower, 1 at the upper; 0.5 when the bands coincide.</summary>
    public double BollingerPosition =>
        BollingerUpper - BollingerLower > 0 ? (Price - BollingerLower) / (BollingerUpper - BollingerLower) : 0.5;

    /// <summary>The average true range as a percentage of the price: how much the price moves per bar.</summary>
    public double AtrPercent => Price > 0 ? Atr14 / Price * 100 : 0;
}

/// <summary>Technical indicators, computed the way the previous app's library (<c>ta</c>) computes them.</summary>
/// <remarks>
/// The risk check's thresholds were tuned against those exact formulas, so the port matches them: RSI
/// and ATR use Wilder's smoothing, Bollinger bands use the population standard deviation. Unlike the
/// previous app, nothing is rounded to two decimals: that made every indicator of a coin priced in
/// fractions of a cent zero.
/// </remarks>
public static class Indicators
{
    /// <summary>Fewest bars the indicators are computed from; with fewer the result would mislead.</summary>
    public const int MinimumBars = 50;

    /// <summary>The indicators for the newest bar, or null when there are fewer than <see cref="MinimumBars"/> bars.</summary>
    /// <param name="candles">Price history, oldest first.</param>
    public static TechnicalSnapshot? Compute(IReadOnlyList<Candle> candles)
    {
        ArgumentNullException.ThrowIfNull(candles);
        if (candles.Count < MinimumBars)
        {
            return null;
        }

        var closes = new double[candles.Count];
        for (var i = 0; i < closes.Length; i++)
        {
            closes[i] = (double)candles[i].Close;
        }

        var price = closes[^1];
        var sma20 = Sma(closes, 20);
        var sma50 = Sma(closes, 50);
        var deviation = PopulationStandardDeviation(closes, 20, sma20);

        // The same rule as the previous app: both averages must agree, otherwise the trend is neutral.
        var trend = price > sma50
            ? (price > sma20 ? Trend.Bullish : Trend.Neutral)
            : (price < sma20 ? Trend.Bearish : Trend.Neutral);

        return new TechnicalSnapshot(
            price,
            sma20,
            sma50,
            trend,
            Rsi(closes, 14),
            Atr(candles, 14),
            sma20 + (2 * deviation),
            sma20,
            sma20 - (2 * deviation));
    }

    /// <summary>Average of the last <paramref name="window"/> values.</summary>
    internal static double Sma(ReadOnlySpan<double> values, int window)
    {
        var sum = 0.0;
        foreach (var value in values[^window..])
        {
            sum += value;
        }

        return sum / window;
    }

    internal static double PopulationStandardDeviation(ReadOnlySpan<double> values, int window, double mean)
    {
        var sum = 0.0;
        foreach (var value in values[^window..])
        {
            sum += (value - mean) * (value - mean);
        }

        return Math.Sqrt(sum / window);
    }

    /// <summary>
    /// Relative strength index with Wilder's smoothing: an exponential average with weight 1/window,
    /// started from the first change, over rises and falls separately.
    /// </summary>
    internal static double Rsi(ReadOnlySpan<double> closes, int window)
    {
        var alpha = 1.0 / window;
        // The first bar has no change; the library counts it as a change of zero.
        var averageGain = 0.0;
        var averageLoss = 0.0;
        for (var i = 1; i < closes.Length; i++)
        {
            var change = closes[i] - closes[i - 1];
            averageGain = ((1 - alpha) * averageGain) + (alpha * Math.Max(change, 0));
            averageLoss = ((1 - alpha) * averageLoss) + (alpha * Math.Max(-change, 0));
        }

        return averageLoss == 0 ? 100 : 100 - (100 / (1 + (averageGain / averageLoss)));
    }

    /// <summary>
    /// Average true range: the plain average of the first <paramref name="window"/> true ranges, then
    /// Wilder's smoothing. A bar's true range is the largest of its own range and its distances from
    /// the previous close.
    /// </summary>
    internal static double Atr(IReadOnlyList<Candle> candles, int window)
    {
        var atr = 0.0;
        for (var i = 0; i < candles.Count; i++)
        {
            var high = (double)candles[i].High;
            var low = (double)candles[i].Low;
            var trueRange = high - low;
            if (i > 0)
            {
                var previousClose = (double)candles[i - 1].Close;
                trueRange = Math.Max(trueRange, Math.Max(Math.Abs(high - previousClose), Math.Abs(low - previousClose)));
            }

            if (i < window)
            {
                atr += trueRange / window;
            }
            else
            {
                atr = ((atr * (window - 1)) + trueRange) / window;
            }
        }

        return atr;
    }
}
