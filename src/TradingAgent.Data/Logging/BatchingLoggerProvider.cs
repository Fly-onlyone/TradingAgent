using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using TradingAgent.Core.Logging;

namespace TradingAgent.Data.Logging;

/// <summary>
/// Base for log sinks that write in batches on a background task, so logging never blocks the caller on
/// disk or database I/O.
/// </summary>
/// <remarks>
/// Every message and exception text is passed through <see cref="Redactor"/> before it is queued. When the
/// queue is full the oldest entries are dropped: losing log lines is better than stalling the app.
/// Disposing the provider writes whatever is still queued.
/// </remarks>
public abstract class BatchingLoggerProvider : ILoggerProvider
{
    private const int QueueCapacity = 4096;
    private static readonly TimeSpan _shutdownTimeout = TimeSpan.FromSeconds(3);

    private readonly Channel<LogEntry> _queue = Channel.CreateBounded<LogEntry>(
        new BoundedChannelOptions(QueueCapacity) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });

    private readonly LogLevel _minimumLevel;
    private readonly int _batchSize;
    private readonly TimeSpan _flushInterval;
    private readonly TimeProvider _time;
    private readonly Task _worker;
    private bool _disposed;

    /// <param name="minimumLevel">Entries below this level are ignored by this sink.</param>
    /// <param name="batchSize">A batch is written as soon as it holds this many entries.</param>
    /// <param name="flushInterval">Longest time an entry waits before it is written.</param>
    /// <param name="time">Clock that measures the flush interval. Tests pass one they control.</param>
    protected BatchingLoggerProvider(LogLevel minimumLevel, int batchSize, TimeSpan flushInterval, TimeProvider time)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(batchSize);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(flushInterval, TimeSpan.Zero);
        _minimumLevel = minimumLevel;
        _batchSize = batchSize;
        _flushInterval = flushInterval;
        _time = time;
        _worker = Task.Run(RunAsync);
    }

    public ILogger CreateLogger(string categoryName) => new BatchingLogger(this, categoryName);

    public void Dispose()
    {
        Dispose(disposing: true);
        GC.SuppressFinalize(this);
    }

    /// <summary>Writes one batch. Called on the background task, never concurrently.</summary>
    protected abstract void Write(IReadOnlyList<LogEntry> batch);

    protected virtual void Dispose(bool disposing)
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        if (disposing)
        {
            _queue.Writer.TryComplete();
            _worker.Wait(_shutdownTimeout);
        }
    }

    private async Task RunAsync()
    {
        var reader = _queue.Reader;
        var batch = new List<LogEntry>(_batchSize);

        // WaitToReadAsync returns false once the queue is completed and empty.
        while (await reader.WaitToReadAsync().ConfigureAwait(false))
        {
            using var deadline = new CancellationTokenSource(_flushInterval);
            try
            {
                while (batch.Count < _batchSize)
                {
                    if (reader.TryRead(out var entry))
                    {
                        batch.Add(entry);
                    }
                    else if (!await reader.WaitToReadAsync(deadline.Token).ConfigureAwait(false))
                    {
                        break;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // The flush interval elapsed: write what has been collected.
            }

            Flush(batch);
        }
    }

    private void Flush(List<LogEntry> batch)
    {
        if (batch.Count == 0)
        {
            return;
        }

        try
        {
            Write(batch);
        }
#pragma warning disable CA1031 // A failing log sink must never take the app down, whatever the failure.
        catch (Exception ex)
#pragma warning restore CA1031
        {
            // Not through ILogger: that would feed the failure back into this sink.
            Console.Error.WriteLine($"{GetType().Name} could not write {batch.Count} log entries: {ex.Message}");
        }
        finally
        {
            batch.Clear();
        }
    }

    private sealed class BatchingLogger(BatchingLoggerProvider provider, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None && logLevel >= provider._minimumLevel;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            ArgumentNullException.ThrowIfNull(formatter);
            if (!IsEnabled(logLevel))
            {
                return;
            }

            var entry = new LogEntry(
                provider._time.GetUtcNow().ToUnixTimeMilliseconds(),
                logLevel,
                category,
                Redactor.Redact(formatter(state, exception)),
                exception is null ? null : Redactor.Redact(exception.ToString()));
            provider._queue.Writer.TryWrite(entry);
        }
    }
}
