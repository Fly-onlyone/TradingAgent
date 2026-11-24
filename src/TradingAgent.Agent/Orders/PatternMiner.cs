using System.Globalization;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Knowledge;
using TradingAgent.Core.Hosting;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.Agent.Orders;

/// <summary>
/// Measures, on past prices, what followed a few well-known signals: an oversold or overbought RSI, a
/// break of the 20-bar high, a cross above the 50-bar average. Off until switched on in Settings.
/// </summary>
/// <remarks>
/// No model is used: the figures are counted, not judged. A pattern with few samples says little, and
/// its sample count is stored with it so that the agent and the user can see that.
/// </remarks>
public sealed partial class PatternMiner(
    TradeRepository trades,
    IOkxReader okx,
    EmbeddingIndexer indexer,
    ISettingsStore settings,
    TimeProvider time,
    ILogger<PatternMiner> logger)
    : IBackgroundService, IDisposable
{
    /// <summary>The bar the patterns are measured on.</summary>
    public const string Bar = "1H";

    /// <summary>How many bars after a signal the price is looked at.</summary>
    public const int Horizon = 12;

    /// <summary>Fewer occurrences than this are not stored.</summary>
    public const int MinimumSamples = 5;

    private static readonly string[] _defaultSymbols = ["BTC-USDT", "ETH-USDT"];
    private static readonly TimeSpan _checkInterval = TimeSpan.FromMinutes(20);
    private CancellationTokenSource? _stop;
    private Task? _loop;

    public string Name => "Pattern miner";

    /// <summary>The signals found in a price history, with what followed each kind.</summary>
    public static IReadOnlyList<(string Signal, string Description, int Samples, double SuccessRate, double AverageReturn)> Measure(IReadOnlyList<Candle> candles)
    {
        ArgumentNullException.ThrowIfNull(candles);
        var close = candles.Select(candle => (double)candle.Close).ToArray();
        var rsi = Rsi(close, 14);
        var found = new List<(string, string, int, double, double)>();
        Add("RSI below 30", "The 14-bar RSI fell below 30 (oversold).", index => rsi[index] < 30 && rsi[index - 1] >= 30);
        Add("RSI above 70", "The 14-bar RSI rose above 70 (overbought).", index => rsi[index] > 70 && rsi[index - 1] <= 70);
        Add("Break of the 20-bar high", "The close rose above the highest high of the 20 bars before.", index => close[index] > Highest(candles, index - 20, index) && close[index - 1] <= Highest(candles, index - 21, index - 1));
        Add("Cross above the 50-bar average", "The close crossed above its 50-bar simple average.", index => close[index] > Average(close, index - 49, index + 1) && close[index - 1] <= Average(close, index - 50, index));
        return found;

        void Add(string signal, string description, Func<int, bool> occurs)
        {
            var returns = new List<double>();
            // From where every measure has enough bars behind it, to where the horizon still fits.
            for (var index = 51; index < close.Length - Horizon; index++)
            {
                if (occurs(index))
                {
                    returns.Add((close[index + Horizon] - close[index]) / close[index] * 100);
                }
            }

            if (returns.Count >= MinimumSamples)
            {
                found.Add((signal, description, returns.Count, returns.Count(value => value > 0) / (double)returns.Count, returns.Average()));
            }
        }
    }

    public Task StartAsync(CancellationToken stopping)
    {
        _stop = CancellationTokenSource.CreateLinkedTokenSource(stopping);
        _loop = Task.Run(() => LoopAsync(_stop.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken deadline)
    {
        if (_stop is not null)
        {
            await _stop.CancelAsync().ConfigureAwait(false);
        }

        if (_loop is not null)
        {
            await _loop.WaitAsync(deadline).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
        }
    }

    public void Dispose() => _stop?.Dispose();

    /// <summary>True when mining is switched on and its interval has passed since the last pass.</summary>
    public bool IsDue()
    {
        if (!settings.GetValue(SettingKeys.PatternMiningEnabled))
        {
            return false;
        }

        var hours = Math.Max(1, settings.GetValue(SettingKeys.PatternMiningIntervalHours));
        return settings.GetValue(SettingKeys.PatternMiningLastRunAt) is not { } last
            || time.GetUtcNow().ToUnixTimeMilliseconds() - last >= TimeSpan.FromHours(hours).TotalMilliseconds;
    }

    /// <summary>Measures the patterns of every symbol in the settings. Returns how many patterns were stored.</summary>
    public async Task<int> RunOnceAsync(CancellationToken cancellationToken)
    {
        var symbols = settings.GetValue(SettingKeys.PatternMiningSymbols) is { Length: > 0 } chosen ? chosen : _defaultSymbols;
        var stored = 0;
        foreach (var symbol in symbols.Select(symbol => symbol.Trim().ToUpperInvariant()).Where(symbol => symbol.Length > 0).Distinct())
        {
            try
            {
                var candles = await okx.GetCandlesAsync(symbol, Bar, 300, cancellationToken).ConfigureAwait(false);
                foreach (var (signal, description, samples, rate, average) in Measure(candles))
                {
                    trades.ReplacePattern(
                        $"{symbol} {Bar}: {signal}",
                        "indicator",
                        string.Create(
                            CultureInfo.InvariantCulture,
                            $"{description} On {symbol}, {Bar} bars: in {samples} cases over the last {candles.Count} bars the price was higher {Horizon} bars later {rate * 100:0} % of the time; the average move was {average:0.##} %."),
                        string.Create(CultureInfo.InvariantCulture, $$"""{"signal":"{{signal}}","bar":"{{Bar}}","horizon_bars":{{Horizon}}}"""),
                        rate,
                        samples,
                        average,
                        Horizon,
                        symbol,
                        Bar);
                    stored++;
                }
            }
            catch (Exception ex) when (ex is OkxException or HttpRequestException || (ex is TaskCanceledException && !cancellationToken.IsCancellationRequested))
            {
                LogSymbolFailed(logger, symbol, ex);
            }
        }

        settings.SetValue(SettingKeys.PatternMiningLastRunAt, time.GetUtcNow().ToUnixTimeMilliseconds());
        if (stored > 0)
        {
            indexer.Request();
        }

        return stored;
    }

    private static double Highest(IReadOnlyList<Candle> candles, int from, int to)
    {
        var highest = double.MinValue;
        for (var index = Math.Max(0, from); index < to; index++)
        {
            highest = Math.Max(highest, (double)candles[index].High);
        }

        return highest;
    }

    private static double Average(double[] values, int from, int to)
    {
        double sum = 0;
        for (var index = from; index < to; index++)
        {
            sum += values[index];
        }

        return sum / (to - from);
    }

    /// <summary>Wilder's RSI for every bar; 50 where there are not yet enough bars.</summary>
    private static double[] Rsi(double[] close, int period)
    {
        var rsi = new double[close.Length];
        Array.Fill(rsi, 50);
        if (close.Length <= period)
        {
            return rsi;
        }

        double gain = 0;
        double loss = 0;
        for (var index = 1; index <= period; index++)
        {
            var change = close[index] - close[index - 1];
            gain += Math.Max(change, 0);
            loss += Math.Max(-change, 0);
        }

        gain /= period;
        loss /= period;
        for (var index = period; index < close.Length; index++)
        {
            if (index > period)
            {
                var change = close[index] - close[index - 1];
                gain = ((gain * (period - 1)) + Math.Max(change, 0)) / period;
                loss = ((loss * (period - 1)) + Math.Max(-change, 0)) / period;
            }

            rsi[index] = loss == 0 ? 100 : 100 - (100 / (1 + (gain / loss)));
        }

        return rsi;
    }

    private async Task LoopAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(_checkInterval, time);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false))
            {
                if (!IsDue())
                {
                    continue;
                }

                try
                {
                    await RunOnceAsync(cancellationToken).ConfigureAwait(false);
                }
#pragma warning disable CA1031 // One bad pass must not end the miner: the next pass may work.
                catch (Exception ex) when (ex is not OperationCanceledException)
#pragma warning restore CA1031
                {
                    LogPassFailed(logger, ex);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // The app is closing.
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The price history of {Symbol} could not be read for pattern mining.")]
    private static partial void LogSymbolFailed(ILogger logger, string symbol, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "A pass of the pattern miner failed.")]
    private static partial void LogPassFailed(ILogger logger, Exception exception);
}
