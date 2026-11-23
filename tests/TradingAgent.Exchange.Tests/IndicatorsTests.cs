using TradingAgent.Exchange.Analysis;
using Xunit;

namespace TradingAgent.Exchange.Tests;

public sealed class IndicatorsTests
{
    // Expected values come from the library the previous app used (ta 0.11 on pandas), run on the same
    // series: see Series.Wave. The risk rules were tuned on that library's numbers.
    private const double Tolerance = 1e-6;

    [Fact]
    public void Two_hundred_bars_give_the_same_values_as_the_previous_apps_library()
    {
        var snapshot = Indicators.Compute(Series.Wave(200));

        Assert.NotNull(snapshot);
        Assert.Equal(108.41373258592752, snapshot.Price, Tolerance);
        Assert.Equal(115.9461674578426, snapshot.Sma20, Tolerance);
        Assert.Equal(108.9617791596447, snapshot.Sma50, Tolerance);
        Assert.Equal(32.48981110179848, snapshot.Rsi14, Tolerance);
        Assert.Equal(3.48419328663967, snapshot.Atr14, Tolerance);
        Assert.Equal(122.41895702969092, snapshot.BollingerUpper, Tolerance);
        Assert.Equal(115.9461674578426, snapshot.BollingerMiddle, Tolerance);
        Assert.Equal(109.4733778859943, snapshot.BollingerLower, Tolerance);
        // Below both averages.
        Assert.Equal(Trend.Bearish, snapshot.Trend);
    }

    [Fact]
    public void Sixty_bars_give_the_same_values_as_the_previous_apps_library()
    {
        var snapshot = Indicators.Compute(Series.Wave(60));

        Assert.NotNull(snapshot);
        Assert.Equal(111.34415315779103, snapshot.Price, Tolerance);
        Assert.Equal(107.39287153388675, snapshot.Sma20, Tolerance);
        Assert.Equal(102.86563073013674, snapshot.Sma50, Tolerance);
        Assert.Equal(74.68434763602912, snapshot.Rsi14, Tolerance);
        Assert.Equal(3.2949800508119047, snapshot.Atr14, Tolerance);
        Assert.Equal(118.09663822325668, snapshot.BollingerUpper, Tolerance);
        Assert.Equal(96.68910484451682, snapshot.BollingerLower, Tolerance);
        Assert.Equal(Trend.Bullish, snapshot.Trend);
    }

    [Fact]
    public void Too_little_history_gives_no_indicators_instead_of_misleading_ones()
    {
        Assert.Null(Indicators.Compute(Series.Wave(Indicators.MinimumBars - 1)));
        Assert.NotNull(Indicators.Compute(Series.Wave(Indicators.MinimumBars)));
    }

    [Fact]
    public void A_price_that_only_rises_has_an_rsi_of_one_hundred()
    {
        var snapshot = Indicators.Compute(Series.Line(60, 100, 160, 2));

        Assert.NotNull(snapshot);
        Assert.Equal(100, snapshot.Rsi14);
        Assert.Equal(Trend.Bullish, snapshot.Trend);
        Assert.True(snapshot.BollingerPosition > 0.5);
    }

    [Fact]
    public void A_flat_price_sits_in_the_middle_of_bands_that_coincide()
    {
        var snapshot = Indicators.Compute(Series.Line(60, 100, 100, 0));

        Assert.NotNull(snapshot);
        Assert.Equal(0.5, snapshot.BollingerPosition);
        Assert.Equal(0, snapshot.AtrPercent);
        Assert.Equal(Trend.Neutral, snapshot.Trend);
    }

    [Fact]
    public void A_coin_priced_in_fractions_of_a_cent_keeps_its_indicators()
    {
        // The previous app rounded to two decimals, which made every value of such a coin zero.
        var tiny = Series.Wave(200).ConvertAll(candle => candle with
        {
            Open = candle.Open / 10_000_000,
            High = candle.High / 10_000_000,
            Low = candle.Low / 10_000_000,
            Close = candle.Close / 10_000_000,
        });

        var snapshot = Indicators.Compute(tiny);
        var reference = Indicators.Compute(Series.Wave(200));

        Assert.NotNull(snapshot);
        Assert.NotNull(reference);
        Assert.True(snapshot.Atr14 > 0);
        // Scale-free measures do not depend on the price level.
        Assert.Equal(reference.Rsi14, snapshot.Rsi14, 1e-3);
        Assert.Equal(reference.AtrPercent, snapshot.AtrPercent, 1e-3);
        Assert.Equal(reference.BollingerPosition, snapshot.BollingerPosition, 1e-3);
    }
}
