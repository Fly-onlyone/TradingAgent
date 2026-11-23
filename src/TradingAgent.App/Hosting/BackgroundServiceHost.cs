using Microsoft.Extensions.Logging;
using TradingAgent.Core.Hosting;

namespace TradingAgent.App.Hosting;

/// <summary>Starts the app's <see cref="IBackgroundService"/>s and stops them when the app exits.</summary>
/// <remarks>
/// Start order is registration order; stop order is the reverse. One service failing to start or stop
/// is logged and does not keep the others from running: a broken poller must not take the app down.
/// </remarks>
internal sealed partial class BackgroundServiceHost(
    IEnumerable<IBackgroundService> services,
    ILogger<BackgroundServiceHost> logger) : IDisposable
{
    private readonly IBackgroundService[] _services = [.. services];
    private readonly CancellationTokenSource _stopping = new();
    private readonly List<IBackgroundService> _started = [];
    private bool _stopped;

    /// <summary>Cancelled when the app begins to shut down.</summary>
    public CancellationToken Stopping => _stopping.Token;

    public async Task StartAsync()
    {
        foreach (var service in _services)
        {
            try
            {
                await service.StartAsync(_stopping.Token).ConfigureAwait(false);
                _started.Add(service);
            }
#pragma warning disable CA1031 // Any failure of one service is reported and the next one still starts.
            catch (Exception ex)
#pragma warning restore CA1031
            {
                LogStartFailed(logger, service.Name, ex);
            }
        }
    }

    /// <summary>Stops every started service, giving all of them together at most <paramref name="timeout"/>.</summary>
    public async Task StopAsync(TimeSpan timeout)
    {
        if (_stopped)
        {
            return;
        }

        _stopped = true;
        await _stopping.CancelAsync().ConfigureAwait(false);

        using var deadline = new CancellationTokenSource(timeout);
        for (var i = _started.Count - 1; i >= 0; i--)
        {
            var service = _started[i];
            try
            {
                await service.StopAsync(deadline.Token).WaitAsync(deadline.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                LogStopTimedOut(logger, service.Name);
            }
#pragma warning disable CA1031 // Any failure of one service is reported and the next one is still stopped.
            catch (Exception ex)
#pragma warning restore CA1031
            {
                LogStopFailed(logger, service.Name, ex);
            }
        }
    }

    public void Dispose() => _stopping.Dispose();

    [LoggerMessage(Level = LogLevel.Error, Message = "Background service '{Service}' failed to start.")]
    private static partial void LogStartFailed(ILogger logger, string service, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Background service '{Service}' did not stop in time.")]
    private static partial void LogStopTimedOut(ILogger logger, string service);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Background service '{Service}' failed while stopping.")]
    private static partial void LogStopFailed(ILogger logger, string service, Exception exception);
}
