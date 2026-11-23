using System.ComponentModel;
using System.Diagnostics;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Mcp;
using TradingAgent.Core.Shell;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.Agent.Atk;

/// <summary>How the trade kit is started.</summary>
/// <param name="FileName">The program or script to run.</param>
/// <param name="Arguments">Arguments that come before the trade kit's own.</param>
/// <param name="Source">Where it was found: <c>bundled</c>, <c>path</c> or <c>npx</c>. For the log and the status page.</param>
public sealed record AtkCommand(string FileName, IReadOnlyList<string> Arguments, string Source);

/// <summary>What the trade kit is started with.</summary>
/// <param name="Sandbox">True for OKX demo trading, false for the live exchange. Always told to the kit explicitly.</param>
/// <param name="Modules">The tool groups to switch on, separated by commas.</param>
/// <param name="ReadOnly">True makes the kit itself drop every tool that writes.</param>
/// <param name="Credentials">The OKX key, or null to run without one: public market data still works.</param>
public sealed record AtkLaunchOptions(bool Sandbox, string Modules, bool ReadOnly, OkxCredentials? Credentials);

/// <summary>The trade kit cannot be started on this machine; the message says what is missing.</summary>
public sealed class AtkUnavailableException : Exception
{
    public AtkUnavailableException()
        : this("The OKX trade kit is not installed.")
    {
    }

    public AtkUnavailableException(string message)
        : base(message)
    {
    }

    public AtkUnavailableException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>Finds the OKX Agent Trade Kit on this machine.</summary>
/// <remarks>
/// Looked for in this order:
/// <list type="number">
/// <item>A copy shipped with the app: <c>atk\launch.cmd</c> next to the executable.</item>
/// <item>A copy the user installed (<c>npm install -g @okx_ai/okx-trade-mcp</c>): <c>okx-trade-mcp</c> on the PATH.</item>
/// <item>Development builds only: <c>npx</c> with the pinned version.</item>
/// </list>
/// A release build never uses <c>npx</c>: that would download and run code from the network at the
/// moment the app starts, on a machine that trades with real money.
/// </remarks>
public static class AtkCommandResolver
{
    /// <summary>The version the tool inventory was written for. An update is a deliberate change here.</summary>
    public const string PinnedVersion = "1.3.3";

    public const string PackageName = "@okx_ai/okx-trade-mcp";

    /// <summary>
    /// A profile name no config file has. The kit is told to use it so that, should it ever find a
    /// config file of the user's own, it takes no key from it: asked for a profile that does not
    /// exist, the kit runs without a key instead of falling back to the file's default.
    /// </summary>
    public const string NoProfile = "trading-agent-no-profile";

    /// <param name="appDirectory">The folder of the app's executable.</param>
    /// <param name="isDevelopmentBuild">True for a Debug build.</param>
    /// <param name="fileExists">Tells whether a file exists. A parameter so tests need no real files.</param>
    /// <param name="findOnPath">Returns the full path of a program on the PATH, or null.</param>
    /// <returns>The command, or null when the trade kit is not available.</returns>
    public static AtkCommand? Resolve(
        string appDirectory,
        bool isDevelopmentBuild,
        Func<string, bool> fileExists,
        Func<string, string?> findOnPath)
    {
        ArgumentNullException.ThrowIfNull(fileExists);
        ArgumentNullException.ThrowIfNull(findOnPath);

        var windows = OperatingSystem.IsWindows();
        var bundled = Path.Combine(appDirectory, "atk", windows ? "launch.cmd" : "launch.sh");
        if (fileExists(bundled))
        {
            return new AtkCommand(bundled, [], "bundled");
        }

        if (findOnPath(windows ? "okx-trade-mcp.cmd" : "okx-trade-mcp") is { } installed)
        {
            return new AtkCommand(installed, [], "path");
        }

        if (isDevelopmentBuild && findOnPath(windows ? "npx.cmd" : "npx") is { } npx)
        {
            return new AtkCommand(npx, ["-y", $"{PackageName}@{PinnedVersion}"], "npx");
        }

        return null;
    }

    /// <summary>The trade kit's own arguments. None of them is a secret.</summary>
    public static IReadOnlyList<string> KitArguments(AtkLaunchOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        List<string> arguments =
        [
            "--modules", options.Modules,
            "--profile", NoProfile,
            // Said outright on every start. Left out, the kit would decide by a config file.
            options.Sandbox ? "--demo" : "--live",
            // The kit's own log holds the arguments and the full result of every call, account data
            // included, as plain text that nothing prunes. The app records tool calls in its database.
            "--no-log",
        ];
        if (options.ReadOnly)
        {
            arguments.Add("--read-only");
        }

        return arguments;
    }

    /// <summary>The full path of <paramref name="fileName"/> in a folder of the PATH variable, or null.</summary>
    public static string? FindOnPath(string fileName)
    {
        var path = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrEmpty(path))
        {
            return null;
        }

        foreach (var folder in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            try
            {
                var candidate = Path.Combine(folder, fileName);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            catch (ArgumentException)
            {
                // A PATH entry with characters a path cannot have; skip it.
            }
        }

        return null;
    }
}

/// <summary>Starts the trade kit and returns the connection to it.</summary>
public interface IAtkLauncher
{
    /// <exception cref="AtkUnavailableException">The trade kit is not installed.</exception>
    Task<IMcpTransport> LaunchAsync(AtkLaunchOptions options, CancellationToken cancellationToken);
}

/// <summary>Starts the trade kit as a child process tied to the app's lifetime.</summary>
/// <remarks>
/// <b>The key is handed over in the child's environment and nowhere else.</b> The kit can also read a
/// key from <c>.okx\config.toml</c> in the home folder; this app never writes that file, so the key is
/// not put on disk in plain text.
/// <para>
/// <b>The kit gets a home folder of its own</b> under the app's data folder. Whatever it keeps (its
/// update check, its cache) stays there, and a config file the user made for OKX's own command line
/// tools, which may hold another key for another mode, is out of its sight.
/// </para>
/// </remarks>
/// <param name="appDirectory">The folder of the app's executable, where a bundled copy is looked for.</param>
/// <param name="isDevelopmentBuild">True for a Debug build, which may fall back to <c>npx</c>.</param>
/// <param name="homeDirectory">The folder the kit sees as the user's home. Created when missing.</param>
/// <param name="job">Ends the process when the app ends.</param>
/// <param name="logger">Receives the start and the trade kit's own messages. Never the environment.</param>
public sealed partial class AtkProcessLauncher(
    string appDirectory,
    bool isDevelopmentBuild,
    string homeDirectory,
    IChildProcessJob job,
    ILogger<AtkProcessLauncher> logger) : IAtkLauncher
{
    public Task<IMcpTransport> LaunchAsync(AtkLaunchOptions options, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(options);
        var command = AtkCommandResolver.Resolve(appDirectory, isDevelopmentBuild, File.Exists, AtkCommandResolver.FindOnPath)
            ?? throw new AtkUnavailableException(
                $"The OKX trade kit is not installed. Install it with: npm install -g {AtkCommandResolver.PackageName}@{AtkCommandResolver.PinnedVersion}");

        Directory.CreateDirectory(homeDirectory);
        var start = ProcessTransport.CreateStartInfo(command.FileName, [.. command.Arguments, .. AtkCommandResolver.KitArguments(options)]);
        ApplyEnvironment(start.Environment, homeDirectory, options.Credentials);

        Process process;
        try
        {
            process = Process.Start(start) ?? throw new AtkUnavailableException("The OKX trade kit could not be started.");
        }
        catch (Win32Exception ex)
        {
            throw new AtkUnavailableException($"The OKX trade kit could not be started: {ex.Message}", ex);
        }

        try
        {
            job.Add(process);
        }
        catch (Win32Exception ex)
        {
            // It still runs and is still stopped on a normal exit; only a crash of the app would leave it.
            LogJobFailed(logger, ex);
        }

        LogStarted(logger, command.Source, options.Sandbox ? "demo" : "live", options.Credentials is not null, process.Id);
        IMcpTransport transport = new ProcessTransport(process, line => LogKit(logger, line));
        return Task.FromResult(transport);
    }

    /// <summary>Sets the kit's home folder and its key. <c>internal</c> for tests.</summary>
    internal static void ApplyEnvironment(IDictionary<string, string?> environment, string homeDirectory, OkxCredentials? credentials)
    {
        // Node takes the home folder from USERPROFILE on Windows and from HOME elsewhere.
        environment["USERPROFILE"] = homeDirectory;
        environment["HOME"] = homeDirectory;

        // Removed first: the minimal environment has none of them, but a key must never come from
        // anywhere except the app's own secret store.
        environment.Remove("OKX_API_KEY");
        environment.Remove("OKX_SECRET_KEY");
        environment.Remove("OKX_PASSPHRASE");
        if (credentials is not null)
        {
            environment["OKX_API_KEY"] = credentials.ApiKey;
            environment["OKX_SECRET_KEY"] = credentials.SecretKey;
            environment["OKX_PASSPHRASE"] = credentials.Passphrase;
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Started the OKX trade kit ({Source}, {Mode} mode, key saved: {HasKey}, process {ProcessId}).")]
    private static partial void LogStarted(ILogger logger, string source, string mode, bool hasKey, int processId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The OKX trade kit could not be tied to the app's lifetime; it is stopped on a normal exit only.")]
    private static partial void LogJobFailed(ILogger logger, Exception exception);

    // What the trade kit writes to its error stream. Every log sink of the app redacts keys and tokens before writing.
    [LoggerMessage(Level = LogLevel.Information, Message = "[atk] {Line}")]
    private static partial void LogKit(ILogger logger, string line);
}
