namespace TradingAgent.Core;

/// <summary>Where the app keeps its database and logs.</summary>
/// <remarks>
/// The data folder is deliberately not the install folder: the installer owns a separate directory, so
/// updating or uninstalling the app never touches user data.
/// </remarks>
public sealed class AppPaths
{
    public const string ProductionFolderName = "TradingAgent";

    /// <summary>Debug builds use their own folder so a development run cannot alter a real install's data.</summary>
    public const string DevelopmentFolderName = "TradingAgent-Dev";

    public AppPaths(string localAppDataRoot, bool isDevelopmentBuild)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(localAppDataRoot);
        DataDirectory = Path.Combine(
            localAppDataRoot,
            isDevelopmentBuild ? DevelopmentFolderName : ProductionFolderName);
    }

    public string DataDirectory { get; }

    public string DatabaseFile => Path.Combine(DataDirectory, "trading-agent.db");

    public string LogDirectory => Path.Combine(DataDirectory, "logs");

    /// <summary>
    /// The folder the OKX trade kit is given as its home, so what it keeps stays with the app's data
    /// and it does not see files of the user's own home folder.
    /// </summary>
    public string TradeKitHomeDirectory => Path.Combine(DataDirectory, "trade-kit");

    /// <summary>
    /// The folder Claude Code is started in. Empty of project files on purpose, and always the same:
    /// Claude Code files a conversation under the folder it ran in and resumes it from there.
    /// </summary>
    public string ClaudeCodeDirectory => Path.Combine(DataDirectory, "claude-code");

    /// <summary>Resolves the paths under the current user's local application data folder.</summary>
    public static AppPaths ForCurrentUser(bool isDevelopmentBuild) =>
        new(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), isDevelopmentBuild);

    /// <summary>Creates the data and log folders if they do not exist yet.</summary>
    public void EnsureCreated()
    {
        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(LogDirectory);
    }
}
