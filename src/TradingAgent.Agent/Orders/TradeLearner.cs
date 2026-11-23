using System.Globalization;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Knowledge;
using TradingAgent.Core.Hosting;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.Agent.Orders;

/// <summary>
/// Works out what each closed trade came to, from the orders the mirror collected, and writes one
/// lesson per closed trade for the agent to find later.
/// </summary>
/// <remarks>
/// Profit and loss is worked out here, first in first out per instrument, because OKX reports it per
/// position and the app needs it per order. It leaves out fees and funding, so it is close to, not
/// equal to, what OKX shows. What it cannot work out it leaves empty: a spot sale of coins bought
/// before the app existed, and inverse contracts, whose value is not in the quote currency.
/// </remarks>
public sealed partial class TradeLearner(
    TradeRepository trades,
    IOkxReader okx,
    EmbeddingIndexer indexer,
    TimeProvider time,
    ILogger<TradeLearner> logger)
    : IBackgroundService, IDisposable
{
    private static readonly TimeSpan _interval = TimeSpan.FromMinutes(5);
    private CancellationTokenSource? _stop;
    private Task? _loop;

    public string Name => "Trade learner";

    /// <summary>
    /// What each closing fill came to. <paramref name="multiplier"/> gives the amount of the coin one
    /// unit of an instrument's quantity stands for; null leaves the instrument out.
    /// </summary>
    public static IReadOnlyList<TradeResult> Compute(IReadOnlyList<Fill> fills, Func<string, double?> multiplier)
    {
        ArgumentNullException.ThrowIfNull(fills);
        ArgumentNullException.ThrowIfNull(multiplier);
        var results = new List<TradeResult>();
        var positions = new Dictionary<string, (double Quantity, double Entry, long OpenedAt)>(StringComparer.Ordinal);
        foreach (var fill in fills)
        {
            if (multiplier(fill.Symbol) is not { } unit || fill.Quantity <= 0 || fill.Price <= 0)
            {
                continue;
            }

            var signed = fill.Side == "buy" ? fill.Quantity : -fill.Quantity;
            var position = positions.GetValueOrDefault(fill.Symbol);
            if (position.Quantity == 0 || Math.Sign(position.Quantity) == Math.Sign(signed))
            {
                // Spot cannot be short: a sale with nothing bought here sold coins the app never saw bought.
                if (signed < 0 && !IsDerivative(fill.Symbol))
                {
                    continue;
                }

                var size = Math.Abs(position.Quantity);
                positions[fill.Symbol] = (
                    position.Quantity + signed,
                    ((size * position.Entry) + (fill.Quantity * fill.Price)) / (size + fill.Quantity),
                    position.Quantity == 0 ? fill.FilledAt : position.OpenedAt);
                continue;
            }

            var direction = Math.Sign(position.Quantity);
            var closed = Math.Min(Math.Abs(position.Quantity), fill.Quantity);
            results.Add(new TradeResult(
                fill.OrderId,
                fill.Symbol,
                direction > 0 ? "buy" : "sell",
                position.Entry,
                fill.Price,
                (fill.Price - position.Entry) * closed * direction * unit,
                (fill.Price - position.Entry) / position.Entry * 100 * direction,
                position.OpenedAt,
                fill.FilledAt));

            var left = fill.Quantity - closed;
            var remaining = position.Quantity + (direction * -closed);
            positions[fill.Symbol] = Math.Abs(remaining) > 1e-12
                ? (remaining, position.Entry, position.OpenedAt)
                // The order closed the position and, on a derivative, opened one the other way with what was left.
                : left > 1e-12 && IsDerivative(fill.Symbol)
                    ? (Math.Sign(signed) * left, fill.Price, fill.FilledAt)
                    : default;
        }

        return results;
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

    /// <summary>Works out the closed trades that have no result yet. Returns how many lessons were written.</summary>
    public async Task<int> RunOnceAsync(CancellationToken cancellationToken)
    {
        var fills = trades.Fills();
        if (fills.Count == 0)
        {
            return 0;
        }

        // One contract of a swap is some amount of the coin; without that the profit cannot be worked out.
        var contracts = new Dictionary<string, double?>(StringComparer.Ordinal);
        if (fills.Any(fill => IsDerivative(fill.Symbol)))
        {
            try
            {
                foreach (var instrument in await okx.GetInstrumentsAsync("SWAP", cancellationToken).ConfigureAwait(false))
                {
                    contracts[instrument.InstrumentId] = instrument.ContractType == "linear" && instrument.ContractValue > 0
                        ? (double)instrument.ContractValue
                        : null;
                }
            }
            catch (Exception ex) when (ex is OkxException or HttpRequestException || (ex is TaskCanceledException && !cancellationToken.IsCancellationRequested))
            {
                // Spot is still worked out; the swaps wait for the next pass.
                LogInstrumentsFailed(logger, ex);
            }
        }

        var lessons = 0;
        foreach (var result in Compute(fills, symbol => IsDerivative(symbol) ? contracts.GetValueOrDefault(symbol) : 1))
        {
            trades.SetResult(result);
            if (trades.InsertLesson(result, Summarize(result), Context(result)))
            {
                lessons++;
            }
        }

        if (lessons > 0)
        {
            indexer.Request();
            LogLearned(logger, lessons);
        }

        return lessons;
    }

    /// <summary>The trade in one sentence, as the lesson is found by.</summary>
    internal static string Summarize(TradeResult result)
    {
        var duration = TimeSpan.FromMilliseconds(Math.Max(0, result.ClosedAt - result.OpenedAt));
        var held = duration.TotalHours >= 48 ? $"{duration.TotalDays:0.#} days"
            : duration.TotalHours >= 1 ? $"{duration.TotalHours:0.#} hours"
            : $"{Math.Max(1, duration.TotalMinutes):0} minutes";
        var outcome = Math.Abs(result.PnlPercent) < 0.1 ? "closed at break-even"
            : result.Pnl > 0 ? $"closed with a profit of {result.PnlPercent:0.##} % ({result.Pnl:0.##})"
            : $"closed with a loss of {Math.Abs(result.PnlPercent):0.##} % ({result.Pnl:0.##})";
        return string.Create(
            CultureInfo.InvariantCulture,
            $"{result.Symbol} {(result.OpeningSide == "buy" ? "long" : "short")} {outcome} after {held}. Entry {result.EntryPrice:0.########}, exit {result.ExitPrice:0.########}.");
    }

    private static string Context(TradeResult result) =>
        string.Create(CultureInfo.InvariantCulture, $$"""{"opened_at":{{result.OpenedAt}},"closed_at":{{result.ClosedAt}},"fees_counted":false}""");

    private static bool IsDerivative(string symbol) => symbol.Count(character => character == '-') >= 2;

    private async Task LoopAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(_interval, time);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false))
            {
                try
                {
                    await RunOnceAsync(cancellationToken).ConfigureAwait(false);
                }
#pragma warning disable CA1031 // One bad pass must not end the learner: the next pass may work.
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

    [LoggerMessage(Level = LogLevel.Information, Message = "Wrote {Count} lessons from closed trades.")]
    private static partial void LogLearned(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The contract sizes could not be read; swap trades wait for the next pass.")]
    private static partial void LogInstrumentsFailed(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "A pass of the trade learner failed.")]
    private static partial void LogPassFailed(ILogger logger, Exception exception);
}
