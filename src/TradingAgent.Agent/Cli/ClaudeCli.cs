using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Mcp;
using TradingAgent.Core.Shell;

namespace TradingAgent.Agent.Cli;

/// <summary>A started command-line program and its three streams.</summary>
public interface ICliProcess : IAsyncDisposable
{
    /// <summary>Writes one line to the program's input.</summary>
    Task WriteLineAsync(string line, CancellationToken cancellationToken);

    /// <summary>Closes the program's input: there is nothing more to send.</summary>
    void CloseInput();

    /// <summary>The next line of the program's output, or null when it has ended.</summary>
    Task<string?> ReadLineAsync(CancellationToken cancellationToken);

    /// <summary>The last lines the program wrote to its error stream, for a failure message.</summary>
    string ErrorTail { get; }

    Task<int> WaitForExitAsync(CancellationToken cancellationToken);

    /// <summary>Ends the program and every process it started.</summary>
    void Kill();
}

/// <summary>Starts command-line programs. An interface so tests can stand in for the real program.</summary>
public interface ICliProcessLauncher
{
    /// <exception cref="Win32Exception">The program could not be started.</exception>
    ICliProcess Start(string fileName, IReadOnlyList<string> arguments, string workingDirectory);
}

/// <summary>Starts a program as a child process tied to the app's lifetime, with a minimal environment.</summary>
/// <remarks>
/// The minimal environment matters here for one more reason than elsewhere: Claude Code run with
/// <c>ANTHROPIC_API_KEY</c> or <c>ANTHROPIC_AUTH_TOKEN</c> set uses that key instead of the user's
/// subscription, and the run would be billed to the key. Neither variable is passed on.
/// </remarks>
public sealed class CliProcessLauncher(IChildProcessJob job) : ICliProcessLauncher
{
    public ICliProcess Start(string fileName, IReadOnlyList<string> arguments, string workingDirectory)
    {
        var start = ProcessTransport.CreateStartInfo(fileName, arguments);
        start.WorkingDirectory = workingDirectory;
        var process = Process.Start(start) ?? throw new Win32Exception($"'{fileName}' did not start.");
        try
        {
            job.Add(process);
        }
        catch (Win32Exception)
        {
            // It still runs and is still ended by Kill and on a normal exit of the app.
        }

        return new StartedProcess(process);
    }

    private sealed class StartedProcess : ICliProcess
    {
        private const int ErrorLinesKept = 20;

        private readonly Process _process;
        private readonly Queue<string> _errors = new();
        private readonly Task _errorPump;

        public StartedProcess(Process process)
        {
            _process = process;
            // The error stream must be read, or the program blocks once the pipe is full.
            _errorPump = Task.Run(async () =>
            {
                try
                {
                    while (await process.StandardError.ReadLineAsync().ConfigureAwait(false) is { } line)
                    {
                        lock (_errors)
                        {
                            _errors.Enqueue(line);
                            if (_errors.Count > ErrorLinesKept)
                            {
                                _errors.Dequeue();
                            }
                        }
                    }
                }
                catch (Exception ex) when (ex is IOException or ObjectDisposedException or InvalidOperationException)
                {
                    // The process is gone.
                }
            });
        }

        public string ErrorTail
        {
            get
            {
                lock (_errors)
                {
                    return string.Join('\n', _errors);
                }
            }
        }

        public async Task WriteLineAsync(string line, CancellationToken cancellationToken)
        {
            await _process.StandardInput.WriteLineAsync(line.AsMemory(), cancellationToken).ConfigureAwait(false);
            await _process.StandardInput.FlushAsync(cancellationToken).ConfigureAwait(false);
        }

        public void CloseInput() => _process.StandardInput.Close();

        public async Task<string?> ReadLineAsync(CancellationToken cancellationToken) =>
            await _process.StandardOutput.ReadLineAsync(cancellationToken).ConfigureAwait(false);

        public async Task<int> WaitForExitAsync(CancellationToken cancellationToken)
        {
            await _process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
            return _process.ExitCode;
        }

        public void Kill()
        {
            try
            {
                if (!_process.HasExited)
                {
                    _process.Kill(entireProcessTree: true);
                }
            }
            catch (Exception ex) when (ex is InvalidOperationException or Win32Exception)
            {
                // Already gone.
            }
        }

        public async ValueTask DisposeAsync()
        {
            Kill();
            await _errorPump.WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
            _process.Dispose();
        }
    }
}

public enum CliState
{
    /// <summary>Claude Code is not on this machine.</summary>
    NotInstalled,

    /// <summary>It is installed and nobody is signed in.</summary>
    SignedOut,

    SignedIn,
}

/// <param name="State">Whether Claude Code can be used.</param>
/// <param name="Path">Where the program is; null when it is not installed.</param>
/// <param name="AuthMethod">How the user is signed in, as Claude Code names it; null when signed out.</param>
public sealed record CliStatus(CliState State, string? Path, string? AuthMethod)
{
    /// <summary>What to tell the user when the state is not <see cref="CliState.SignedIn"/>; null when it is.</summary>
    public string? Problem => State switch
    {
        CliState.NotInstalled =>
            "Claude Code is not installed on this computer. Install it from https://code.claude.com, "
            + "run 'claude auth login' in a terminal, then try again. Or choose \"API key\" as the sign-in mode in Settings.",
        CliState.SignedOut =>
            "Claude Code is not signed in. Run 'claude auth login' in a terminal and sign in with your Claude subscription, then try again.",
        _ => null,
    };
}

/// <summary>Finds the Claude Code command line and asks it whether the user is signed in.</summary>
/// <remarks>
/// <b>The app never sees the subscription credential.</b> Signing in is done by the user, in a
/// terminal, with Claude Code's own <c>claude auth login</c>. The app starts the unmodified program
/// and asks it one question, <c>claude auth status</c>, of whose answer it reads two fields: whether
/// someone is signed in, and by which method. The rest of the answer (the account) is not kept, not
/// logged and not shown.
/// </remarks>
public sealed partial class ClaudeCli(ICliProcessLauncher launcher, string workingDirectory, TimeProvider time, ILogger<ClaudeCli> logger)
{
    /// <summary>
    /// What the user must read and confirm before the first run with a Claude subscription. It says
    /// what Anthropic's page on Claude Code's terms says about a subscription in someone else's app;
    /// it is not legal advice, and the page is the authority.
    /// </summary>
    /// <remarks>
    /// The page (https://code.claude.com/docs/en/legal-and-compliance, read 2026-11-23) allows an end
    /// user to sign in to the unmodified Claude Code program with their own subscription. It does not
    /// allow an app to offer the Claude.ai sign-in itself, to collect, store or pass on that sign-in,
    /// or to route requests through plan credentials on behalf of its users. Running Claude Code in a
    /// product needs Anthropic's Commercial Terms unless agreed otherwise. This app's design follows
    /// the first sentence and the notice tells the user the rest.
    /// </remarks>
    public const string SubscriptionNotice =
        "With this choice, the Claude Code program installed on this computer runs the model, signed in with your own Claude subscription. "
        + "Trading agent starts that program unmodified. It never shows a Claude sign-in, and never sees, stores or passes on your sign-in: "
        + "you sign in yourself by running 'claude auth login' in a terminal. "
        + "Use this only with your own subscription, for your own use. Anthropic does not allow an app to route requests through another person's plan, "
        + "and its usage limits assume ordinary use by one person. "
        + "Anthropic's terms for Claude Code apply. Anyone who offers this app to other people with this sign-in mode needs Anthropic's Commercial Terms; "
        + "an API key is the other way to sign in. Details: https://code.claude.com/docs/en/legal-and-compliance";

    /// <summary>What a run says while <see cref="SubscriptionNotice"/> is not confirmed yet.</summary>
    public const string NoticeNotConfirmed =
        "Before the first run with a Claude subscription, read the notice in the Agent section of the Diagnostics page and confirm it. "
        + "Or choose \"API key\" as the sign-in mode.";

    /// <summary>A "signed in" answer is trusted this long, so not every run starts with a question.</summary>
    private static readonly TimeSpan _signedInFor = TimeSpan.FromMinutes(5);

    private static readonly TimeSpan _statusTimeout = TimeSpan.FromSeconds(20);

    private readonly Lock _sync = new();
    private CliStatus? _lastSignedIn;
    private DateTimeOffset _lastSignedInAt;

    /// <summary>Where the program is looked for. A property so tests can point it elsewhere.</summary>
    public Func<string?> Locate { get; init; } = DefaultLocate;

    /// <summary>The native installer's place, then the folders of the PATH.</summary>
    public static string? DefaultLocate()
    {
        var windows = OperatingSystem.IsWindows();
        var installed = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".local",
            "bin",
            windows ? "claude.exe" : "claude");
        if (File.Exists(installed))
        {
            return installed;
        }

        return windows
            ? AtkCommandResolver.FindOnPath("claude.exe") ?? AtkCommandResolver.FindOnPath("claude.cmd")
            : AtkCommandResolver.FindOnPath("claude");
    }

    /// <summary>Forgets a remembered "signed in", so the next question is asked again. Call after a run failed to sign in.</summary>
    public void Forget()
    {
        lock (_sync)
        {
            _lastSignedIn = null;
        }
    }

    /// <summary>Whether Claude Code is installed and signed in.</summary>
    public async Task<CliStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        lock (_sync)
        {
            if (_lastSignedIn is not null && time.GetUtcNow() - _lastSignedInAt < _signedInFor)
            {
                return _lastSignedIn;
            }
        }

        var path = Locate();
        if (path is null)
        {
            return new CliStatus(CliState.NotInstalled, null, null);
        }

        var status = await AskAsync(path, cancellationToken).ConfigureAwait(false);
        if (status.State == CliState.SignedIn)
        {
            lock (_sync)
            {
                _lastSignedIn = status;
                _lastSignedInAt = time.GetUtcNow();
            }
        }

        return status;
    }

    /// <summary>Reads the two fields the app uses out of the answer of <c>claude auth status</c>.</summary>
    internal static (bool SignedIn, string? Method) ParseStatus(string output)
    {
        try
        {
            using var document = JsonDocument.Parse(output);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return (false, null);
            }

            var signedIn = root.TryGetProperty("loggedIn", out var flag) && flag.ValueKind == JsonValueKind.True;
            var method = root.TryGetProperty("authMethod", out var name) && name.ValueKind == JsonValueKind.String ? name.GetString() : null;
            return (signedIn, signedIn ? method : null);
        }
        catch (JsonException)
        {
            return (false, null);
        }
    }

    private async Task<CliStatus> AskAsync(string path, CancellationToken cancellationToken)
    {
        try
        {
            Directory.CreateDirectory(workingDirectory);
            var process = launcher.Start(path, ["auth", "status"], workingDirectory);
            await using (process.ConfigureAwait(false))
            {
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                deadline.CancelAfter(_statusTimeout);
                process.CloseInput();
                var output = new System.Text.StringBuilder();
                while (await process.ReadLineAsync(deadline.Token).ConfigureAwait(false) is { } line)
                {
                    output.Append(line).Append('\n');
                }

                await process.WaitForExitAsync(deadline.Token).ConfigureAwait(false);
                var (signedIn, method) = ParseStatus(output.ToString());
                return signedIn ? new CliStatus(CliState.SignedIn, path, method) : new CliStatus(CliState.SignedOut, path, null);
            }
        }
        catch (Win32Exception ex)
        {
            LogStartFailed(logger, ex);
            return new CliStatus(CliState.NotInstalled, null, null);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // It did not answer in time. Treated as signed out: a run would hang the same way.
            LogNoAnswer(logger);
            return new CliStatus(CliState.SignedOut, path, null);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Claude Code was found but could not be started.")]
    private static partial void LogStartFailed(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Claude Code did not answer 'auth status' in time.")]
    private static partial void LogNoAnswer(ILogger logger);
}
