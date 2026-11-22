using System.IO.Pipes;

namespace TradingAgent.Core.Shell;

/// <summary>Lets only one copy of the app run per user, and lets a second launch wake the first.</summary>
/// <remarks>
/// Two copies would run two schedulers and two trade-execution sidecars against one database. The first
/// copy holds a named mutex and listens on a named pipe; a later copy sees the mutex, sends one byte down
/// the pipe so the first shows its window, and exits. Mutex and pipe are scoped to the current user and
/// session.
/// </remarks>
public sealed class SingleInstanceGuard : IDisposable
{
    private const byte ActivateSignal = 1;

    private readonly string _pipeName;
    private readonly string _mutexName;
    private readonly CancellationTokenSource _stop = new();
    private Mutex? _mutex;
    private Task? _listener;

    /// <param name="applicationId">Distinguishes this app (and its development build) from every other.</param>
    public SingleInstanceGuard(string applicationId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(applicationId);
        _pipeName = PipeName(applicationId);
        _mutexName = $@"Local\{applicationId}.instance";
    }

    /// <summary>Raised on a background thread when another launch asked this instance to show itself.</summary>
    public event EventHandler? ActivationRequested;

    /// <summary>
    /// Returns true when this is the first instance, and starts listening for later launches.
    /// Returns false when another instance already runs; call <see cref="SignalFirstInstance"/> and exit.
    /// </summary>
    public bool TryAcquire()
    {
        if (_mutex is not null)
        {
            return true;
        }

        // Only "did we create it" matters. The mutex is never waited on, so an abandoned one cannot block.
        var mutex = new Mutex(initiallyOwned: false, _mutexName, out var createdNew);
        if (!createdNew)
        {
            mutex.Dispose();
            return false;
        }

        _mutex = mutex;
        _listener = Task.Run(ListenAsync);
        return true;
    }

    /// <summary>Asks the running instance to show its window. Returns false when it did not answer in time.</summary>
    public static bool SignalFirstInstance(string applicationId, TimeSpan timeout)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(applicationId);
        try
        {
            using var client = new NamedPipeClientStream(
                ".", PipeName(applicationId), PipeDirection.Out, PipeOptions.CurrentUserOnly);
            client.Connect(timeout);
            client.WriteByte(ActivateSignal);
            client.Flush();
            return true;
        }
        catch (TimeoutException)
        {
            return false;
        }
        catch (IOException)
        {
            return false;
        }
    }

    public void Dispose()
    {
        _stop.Cancel();
        try
        {
            _listener?.Wait(TimeSpan.FromSeconds(1));
        }
        catch (AggregateException)
        {
            // The listener ended by cancellation.
        }

        _mutex?.Dispose();
        _stop.Dispose();
    }

    private static string PipeName(string applicationId) => $"{applicationId}.activate";

    private async Task ListenAsync()
    {
        var token = _stop.Token;
        while (!token.IsCancellationRequested)
        {
            try
            {
                using var server = new NamedPipeServerStream(
                    _pipeName,
                    PipeDirection.In,
                    maxNumberOfServerInstances: 1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await server.WaitForConnectionAsync(token).ConfigureAwait(false);

                var buffer = new byte[1];
                var read = await server.ReadAsync(buffer, token).ConfigureAwait(false);
                if (read == 1 && buffer[0] == ActivateSignal)
                {
                    ActivationRequested?.Invoke(this, EventArgs.Empty);
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (IOException)
            {
                // A client disconnected mid-handshake; keep listening.
            }
        }
    }
}
