using TradingAgent.Core.Settings;
using TradingAgent.Exchange.Analysis;
using TradingAgent.Exchange.Okx;
using TradingAgent.Exchange.Risk;
using Xunit;

namespace TradingAgent.Exchange.Tests;

public sealed class RiskManagerTests
{
    // Equity 10,000 and price 100: one unit is 1 % of the account. The limit is 5 %.

    [Fact]
    public async Task A_small_trade_in_a_calm_market_may_proceed()
    {
        var okx = new FakeOkx { Candles = Series.Calm() };

        var assessment = await Assess(okx, "buy", quantity: 1);

        Assert.Equal(0, assessment.Score);
        Assert.Equal(RiskRecommendation.Proceed, assessment.Recommendation);
        Assert.Empty(assessment.Warnings);
        Assert.Equal(100m, assessment.PositionValueUsd);
        Assert.Equal(1m, assessment.PositionPercent);
    }

    [Theory]
    [InlineData(4.0, 0, RiskRecommendation.Proceed)] // 4 %: at 80 % of the limit, not above it
    [InlineData(4.1, 15, RiskRecommendation.Proceed)] // above 80 % of the limit
    [InlineData(5.0, 15, RiskRecommendation.Proceed)] // at the limit, not above it
    [InlineData(5.1, 45, RiskRecommendation.Caution)] // above the limit: both size rules fire
    [InlineData(500, 45, RiskRecommendation.Caution)] // size alone never refuses a trade
    public async Task Position_size_adds_to_the_score_in_two_steps(double quantity, int expectedScore, RiskRecommendation expected)
    {
        var okx = new FakeOkx { Candles = Series.Calm() };

        var assessment = await Assess(okx, "buy", (decimal)quantity);

        Assert.Equal(expectedScore, assessment.Score);
        Assert.Equal(expected, assessment.Recommendation);
    }

    [Fact]
    public async Task The_size_limit_comes_from_settings()
    {
        var okx = new FakeOkx { Candles = Series.Calm() };
        var settings = new FakeSettings();
        settings.SetValue(SettingKeys.RiskMaxPositionSizePercent, 20.0);

        var assessment = await new RiskManager(okx, settings).AssessTradeAsync("BTC-USDT", "buy", 10, null, TestContext.Current.CancellationToken);

        Assert.Equal(0, assessment.Score);
    }

    [Fact]
    public async Task Buying_a_steep_rise_scores_for_rsi_and_the_upper_band()
    {
        // Rising in a straight line: RSI 100, price at the top of its bands, trend bullish.
        var okx = new FakeOkx { Candles = Series.Line(60, 100, 130, 1), LastPrice = 130 };

        var buy = await Assess(okx, "buy", 1);
        var sell = await Assess(okx, "sell", 1);

        Assert.Equal(35, buy.Score); // RSI 20 + band 15
        Assert.Equal(RiskRecommendation.Acceptable, buy.Recommendation);
        Assert.Contains(buy.Warnings, warning => warning.Contains("RSI", StringComparison.Ordinal));
        Assert.Contains(buy.Warnings, warning => warning.Contains("upper Bollinger", StringComparison.Ordinal));
        // The same market, sold: only the trend rule applies.
        Assert.Equal(15, sell.Score);
        Assert.Contains("bullish trend", Assert.Single(sell.Warnings), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Selling_a_steep_fall_scores_for_rsi_and_the_lower_band_and_buying_it_for_the_trend()
    {
        var okx = new FakeOkx { Candles = Series.Line(60, 130, 100, 1), LastPrice = 100 };

        var sell = await Assess(okx, "sell", 1);
        var buy = await Assess(okx, "buy", 1);

        Assert.Equal(35, sell.Score);
        Assert.Contains(sell.Warnings, warning => warning.Contains("oversold", StringComparison.Ordinal));
        Assert.Contains(sell.Warnings, warning => warning.Contains("lower Bollinger", StringComparison.Ordinal));
        Assert.Equal(15, buy.Score);
        Assert.Contains("bearish trend", Assert.Single(buy.Warnings), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_volatile_market_adds_to_the_score()
    {
        // Each bar spans 12 % of the price.
        var okx = new FakeOkx { Candles = Series.Calm(range: 12) };

        var assessment = await Assess(okx, "buy", 1);

        Assert.Equal(20, assessment.Score);
        Assert.Contains("volatility", Assert.Single(assessment.Warnings), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_large_buy_into_an_overbought_volatile_rise_is_refused()
    {
        var candles = Series.Line(60, 100, 130, 14);
        var okx = new FakeOkx { Candles = candles, LastPrice = 130 };

        var assessment = await Assess(okx, "buy", quantity: 10); // 13 % of the account

        // size 30 + 15, RSI 20, band 15, volatility 20
        Assert.Equal(100, assessment.Score);
        Assert.Equal(RiskRecommendation.Avoid, assessment.Recommendation);
        Assert.Equal(5, assessment.Warnings.Count);
    }

    [Fact]
    public async Task Sixty_is_the_score_from_which_a_trade_is_refused()
    {
        // Scores move in steps of five. 55: a small buy into an overbought, volatile rise
        // (RSI 20 + band 15 + volatility 20).
        var rising = new FakeOkx { Candles = Series.Line(60, 100, 130, 14), LastPrice = 130 };
        // 60: a buy above the size limit (30 + 15) against a bearish trend (15).
        var falling = new FakeOkx { Candles = Series.Line(60, 130, 100, 1), LastPrice = 100 };

        var justBelow = await Assess(rising, "buy", 0.1m);
        var atTheLine = await Assess(falling, "buy", 6);

        Assert.Equal(55, justBelow.Score);
        Assert.Equal(RiskRecommendation.Caution, justBelow.Recommendation);
        Assert.Equal(60, atTheLine.Score);
        Assert.Equal(RiskRecommendation.Avoid, atTheLine.Recommendation);
    }

    [Theory]
    [InlineData(4.5, 30, RiskRecommendation.Acceptable)] // close to the limit 15 + against the trend 15
    [InlineData(1, 15, RiskRecommendation.Proceed)]
    public async Task Lower_scores_are_acceptable_or_free_to_proceed(double quantity, int expectedScore, RiskRecommendation expected)
    {
        var falling = new FakeOkx { Candles = Series.Line(60, 130, 100, 1), LastPrice = 100 };

        var assessment = await Assess(falling, "buy", (decimal)quantity);

        Assert.Equal(expectedScore, assessment.Score);
        Assert.Equal(expected, assessment.Recommendation);
    }

    [Fact]
    public async Task Without_price_history_only_the_size_rules_apply()
    {
        var okx = new FakeOkx { CandlesFailure = new OkxException(OkxFailure.Network, "down") };
        var tooShort = new FakeOkx { Candles = Series.Line(20, 100, 130, 1) };

        var failed = await Assess(okx, "buy", 6);
        var shortHistory = await Assess(tooShort, "buy", 6);

        Assert.Equal(45, failed.Score);
        Assert.Null(failed.Indicators);
        Assert.Equal(45, shortHistory.Score);
        Assert.Null(shortHistory.Indicators);
    }

    [Fact]
    public async Task An_account_without_equity_makes_every_position_the_whole_account()
    {
        var okx = new FakeOkx { Balance = new AccountBalance(0, []), Candles = Series.Calm() };

        var assessment = await Assess(okx, "buy", 0.001m);

        Assert.Equal(100m, assessment.PositionPercent);
        Assert.Equal(45, assessment.Score);
    }

    [Fact]
    public async Task A_given_entry_price_is_used_instead_of_the_latest_price()
    {
        var okx = new FakeOkx { LastPrice = 100, Candles = Series.Calm() };

        var assessment = await new RiskManager(okx, new FakeSettings())
            .AssessTradeAsync("BTC-USDT", "buy", 1, entryPrice: 250, TestContext.Current.CancellationToken);

        Assert.Equal(250m, assessment.EntryPrice);
        Assert.Equal(2.5m, assessment.PositionPercent);
        Assert.Equal(0, okx.TickerCalls);
    }

    [Fact]
    public async Task There_is_no_assessment_when_the_balance_or_the_price_cannot_be_read()
    {
        var noBalance = new FakeOkx { BalanceFailure = new OkxException(OkxFailure.Credentials, "No OKX API key is saved.") };
        var noPrice = new FakeOkx { TickerFailure = new OkxException(OkxFailure.Rejected, "OKX has no instrument 'XYZ'.") };

        // An exception, not a low score: a caller must never read "could not assess" as "safe".
        await Assert.ThrowsAsync<OkxException>(() => Assess(noBalance, "buy", 1));
        await Assert.ThrowsAsync<OkxException>(() => Assess(noPrice, "buy", 1));
    }

    [Fact]
    public async Task The_snapshot_used_is_part_of_the_assessment()
    {
        var okx = new FakeOkx { Candles = Series.Wave(200), LastPrice = 108.41373258592752m };

        var assessment = await Assess(okx, "buy", 1);

        Assert.NotNull(assessment.Indicators);
        Assert.Equal(Trend.Bearish, assessment.Indicators.Trend);
        Assert.Equal(15, assessment.Score);
    }

    private static Task<RiskAssessment> Assess(FakeOkx okx, string side, decimal quantity) =>
        new RiskManager(okx, new FakeSettings()).AssessTradeAsync("BTC-USDT", side, quantity, null, TestContext.Current.CancellationToken);
}
