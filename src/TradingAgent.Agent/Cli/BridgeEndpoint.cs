using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Mcp;

namespace TradingAgent.Agent.Cli;

/// <summary>
/// The app's end of the bridge for one run: a named pipe on which the app's tools are served to the
/// Claude Code process of that run.
/// </summary>
/// <remarks>
/// A new pipe name and a new token for every run. The pipe takes connections of the current user
/// only, and a connection must send the token as its first line within a few seconds or it is closed.
/// Claude Code may start its tool server more than once during a run, so more than one connection is
/// taken; all of them serve the same run and end with it.
/// </remarks>
public sealed partial class BridgeEndpoint : IAsyncDisposable
{
    private static readonly TimeSpan _tokenTimeout = TimeSpan.FromSeconds(5);

    private readonly McpToolServer _server;
    private readonly ILogger _logger;
    private readonly CancellationTokenSource _closing = new();
    private readonly Task _accepting;

    private BridgeEndpoint(McpToolServer server, ILogger logger)
    {
        _server = server;
        _logger = logger;
        PipeName = "tradingagent-bridge-" + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));
        Token = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
        // The first instance exists before this returns, so a client that connects at once finds it.
        var first = NewPipe();
        _accepting = Task.Run(() => AcceptAsync(first));
    }

    /// <summary>The pipe's name, without the <c>\\.\pipe\</c> prefix.</summary>
    public string PipeName { get; }

    /// <summary>What a connection must send as its first line.</summary>
    public string Token { get; }

    /// <summary>How many connections showed the right token so far.</summary>
    public int AcceptedConnections => Volatile.Read(ref _accepted);

    private int _accepted;

    /// <summary>Opens the pipe and starts taking connections.</summary>
    public static BridgeEndpoint Start(McpToolServer server, ILogger logger)
    {
        ArgumentNullException.ThrowIfNull(server);
        ArgumentNullException.ThrowIfNull(logger);
        return new BridgeEndpoint(server, logger);
    }

    public async ValueTask DisposeAsync()
    {
        await _closing.CancelAsync().ConfigureAwait(false);
        await _accepting.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
        _closing.Dispose();
    }

    private NamedPipeServerStream NewPipe() =>
        new(
            PipeName,
            PipeDirection.InOut,
            NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);

    private async Task AcceptAsync(NamedPipeServerStream pipe)
    {
        var connections = new List<Task>();
        try
        {
            while (true)
            {
                await pipe.WaitForConnectionAsync(_closing.Token).ConfigureAwait(false);
                var connected = pipe;
                // The next instance is created before this one is served, so the name never disappears.
                pipe = NewPipe();
                connections.RemoveAll(connection => connection.IsCompleted);
                connections.Add(ServeAsync(connected));
            }
        }
        catch (Exception ex) when (ex is OperationCanceledException or IOException or ObjectDisposedException)
        {
            // Closing.
        }
        finally
        {
            await pipe.DisposeAsync().ConfigureAwait(false);
            await Task.WhenAll(connections).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
        }
    }

    private async Task ServeAsync(NamedPipeServerStream pipe)
    {
        var transport = new StreamTransport(pipe);
        await using (transport.ConfigureAwait(false))
        {
            try
            {
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(_closing.Token);
                deadline.CancelAfter(_tokenTimeout);
                var shown = await transport.ReceiveAsync(deadline.Token).ConfigureAwait(false);
                if (shown is null || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(shown), Encoding.UTF8.GetBytes(Token)))
                {
                    LogRefused(_logger);
                    return;
                }

                Interlocked.Increment(ref _accepted);
                await _server.ServeAsync(transport, _closing.Token).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is OperationCanceledException or IOException or ObjectDisposedException)
            {
                // No token in time, or the run ended.
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "A connection to the tool bridge did not show the run's token and was closed.")]
    private static partial void LogRefused(ILogger logger);
}
