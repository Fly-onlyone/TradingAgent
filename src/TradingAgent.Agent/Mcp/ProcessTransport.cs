using System.Diagnostics;
using System.Text;

namespace TradingAgent.Agent.Mcp;

/// <summary>
/// Talks to a tool server that runs as a child process, over its standard input and output: one JSON
/// message per line, as the Model Context Protocol defines for local servers.
/// </summary>
public sealed class ProcessTransport : IMcpTransport
{
    private static readonly UTF8Encoding _utf8 = new(encoderShouldEmitUTF8Identifier: false);

    private readonly Process _process;
    private readonly Task _errorPump;
    private bool _disposed;

    /// <param name="process">
    /// A started process whose input, output and error streams are redirected. The transport owns it:
    /// disposing the transport ends the process and everything it started.
    /// </param>
    /// <param name="onErrorLine">Receives each line the server writes to its error stream (its log).</param>
    public ProcessTransport(Process process, Action<string> onErrorLine)
    {
        ArgumentNullException.ThrowIfNull(process);
        ArgumentNullException.ThrowIfNull(onErrorLine);
        _process = process;
        // The error stream must be read, or a chatty server blocks once the pipe is full.
        _errorPump = Task.Run(async () =>
        {
            try
            {
                while (await process.StandardError.ReadLineAsync().ConfigureAwait(false) is { } line)
                {
                    if (line.Length > 0)
                    {
                        onErrorLine(line);
                    }
                }
            }
            catch (Exception ex) when (ex is IOException or ObjectDisposedException or InvalidOperationException)
            {
                // The process is gone.
            }
        });
    }

    /// <summary>Environment variables a tool server is started with. Nothing else of the app's environment is passed on.</summary>
    /// <remarks>
    /// A child process normally inherits the whole environment, which on a developer's machine holds
    /// tokens for other services. A tool server needs none of them.
    /// </remarks>
    public static IReadOnlyList<string> InheritedVariables { get; } =
    [
        "APPDATA", "COMSPEC", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS", "OS", "PATH", "PATHEXT",
        "PROCESSOR_ARCHITECTURE", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP",
        "TMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR",
        // Not Windows: what a tool server needs there.
        "HOME", "LANG", "LOGNAME", "SHELL", "USER",
    ];

    /// <summary>Start settings for a tool server: no window, redirected streams, a minimal environment.</summary>
    public static ProcessStartInfo CreateStartInfo(string fileName, IEnumerable<string> arguments)
    {
        ArgumentNullException.ThrowIfNull(arguments);
        var start = new ProcessStartInfo(fileName)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardInputEncoding = _utf8,
            StandardOutputEncoding = _utf8,
            StandardErrorEncoding = _utf8,
        };
        foreach (var argument in arguments)
        {
            start.ArgumentList.Add(argument);
        }

        var inherited = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in InheritedVariables)
        {
            if (Environment.GetEnvironmentVariable(name) is { Length: > 0 } value)
            {
                inherited[name] = value;
            }
        }

        start.Environment.Clear();
        foreach (var (name, value) in inherited)
        {
            start.Environment[name] = value;
        }

        return start;
    }

    public async Task SendAsync(string message, CancellationToken cancellationToken)
    {
        McpClient.EnsureOneLine(message);
        await _process.StandardInput.WriteLineAsync(message.AsMemory(), cancellationToken).ConfigureAwait(false);
        await _process.StandardInput.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<string?> ReceiveAsync(CancellationToken cancellationToken) =>
        await _process.StandardOutput.ReadLineAsync(cancellationToken).ConfigureAwait(false);

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        try
        {
            if (!_process.HasExited)
            {
                // The whole tree: a launcher script starts the real server as its child.
                _process.Kill(entireProcessTree: true);
            }

            await _process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5)).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception or TimeoutException)
        {
            // Already gone, or it will not die: nothing more can be done from here.
        }

        await _errorPump.WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
        _process.Dispose();
    }
}
