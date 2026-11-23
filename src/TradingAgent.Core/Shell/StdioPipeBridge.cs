using System.IO.Pipes;
using System.Text;

namespace TradingAgent.Core.Shell;

/// <summary>
/// The app's exe in bridge mode: it connects its standard input and output to a named pipe of the
/// running app and passes bytes both ways until one side closes.
/// </summary>
/// <remarks>
/// Claude Code talks to a tool server over that server's standard streams, so it must start a
/// program. This is that program. It holds no logic and no data: the tools, the risk gate and the
/// database stay in the one running app, which is on the other end of the pipe.
/// <para>
/// The pipe is open to the current user only, and the first line sent over it is a token that the
/// app made for this one run. A process that cannot show the token is cut off.
/// </para>
/// </remarks>
public static class StdioPipeBridge
{
    /// <summary>First command-line argument that selects bridge mode; the pipe's name follows it.</summary>
    public const string Argument = "--mcp-bridge";

    /// <summary>The environment variable the token is passed in, so that it is not on a command line.</summary>
    public const string TokenVariable = "TRADINGAGENT_BRIDGE_TOKEN";

    /// <summary>How long the bridge waits for the app's pipe before it gives up.</summary>
    public static TimeSpan ConnectTimeout { get; } = TimeSpan.FromSeconds(10);

    /// <summary>True when the arguments ask for bridge mode.</summary>
    public static bool IsRequested(IReadOnlyList<string> arguments) =>
        arguments is [Argument, { Length: > 0 }];

    /// <summary>Runs bridge mode over the process's own standard streams. Returns the exit code.</summary>
    public static int Run(string pipeName)
    {
        var token = Environment.GetEnvironmentVariable(TokenVariable);
        if (string.IsNullOrEmpty(token))
        {
            return 2;
        }

        using var input = Console.OpenStandardInput();
        using var output = Console.OpenStandardOutput();
        return RunAsync(pipeName, token, input, output, ConnectTimeout, CancellationToken.None).GetAwaiter().GetResult();
    }

    /// <summary>Connects to the pipe, shows the token, and copies both ways until one side closes.</summary>
    /// <returns>0 after a normal end, 1 when the app's pipe could not be reached.</returns>
    public static async Task<int> RunAsync(
        string pipeName,
        string token,
        Stream input,
        Stream output,
        TimeSpan connectTimeout,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(input);
        ArgumentNullException.ThrowIfNull(output);

        // CurrentUserOnly on the client refuses a pipe that another user's process created under the same name.
        var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await using (pipe.ConfigureAwait(false))
        {
            try
            {
                await pipe.ConnectAsync(connectTimeout, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is TimeoutException or IOException or UnauthorizedAccessException)
            {
                return 1;
            }

            using var stopping = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            try
            {
                await pipe.WriteAsync(Encoding.UTF8.GetBytes(token + "\n"), stopping.Token).ConfigureAwait(false);
                await pipe.FlushAsync(stopping.Token).ConfigureAwait(false);

                var toApp = CopyAsync(input, pipe, stopping.Token);
                var fromApp = CopyAsync(pipe, output, stopping.Token);
                // Either side closing ends the bridge: there is nobody left to talk to.
                await Task.WhenAny(toApp, fromApp).ConfigureAwait(false);
                await stopping.CancelAsync().ConfigureAwait(false);
                await Task.WhenAll(toApp, fromApp).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
            }
            catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException)
            {
                // The app closed the pipe.
            }
        }

        return 0;
    }

    /// <summary>Copies and flushes after every read: a message must not wait in a buffer for the next one.</summary>
    private static async Task CopyAsync(Stream from, Stream to, CancellationToken cancellationToken)
    {
        var buffer = new byte[16 * 1024];
        try
        {
            int read;
            while ((read = await from.ReadAsync(buffer, cancellationToken).ConfigureAwait(false)) > 0)
            {
                await to.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
                await to.FlushAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException)
        {
            // That side is closed.
        }
    }
}
