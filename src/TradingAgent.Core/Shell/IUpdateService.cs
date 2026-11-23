namespace TradingAgent.Core.Shell;

/// <summary>Finds, downloads and installs new versions of the app.</summary>
/// <remarks>
/// An update is never applied while the app runs: the trading agent may be in the middle of an order. It
/// is installed when the app exits, or when the user asks to restart for it.
/// </remarks>
public interface IUpdateService
{
    /// <summary>Raised on a background thread whenever <see cref="Status"/> changes.</summary>
    event EventHandler? StatusChanged;

    UpdateStatus Status { get; }

    /// <summary>Looks for a newer version and downloads it. Does nothing while another check is running.</summary>
    Task CheckAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Arranges for the downloaded update to be installed once this process has exited.
    /// Returns false when no update is waiting; the caller then exits normally.
    /// </summary>
    bool ApplyOnExit(bool restart);
}

public enum UpdateState
{
    /// <summary>The app runs from a build folder, not from an installation; it cannot update itself.</summary>
    NotInstalled,
    Idle,
    Checking,
    Downloading,

    /// <summary>A new version is downloaded and will be installed at the next exit.</summary>
    ReadyToInstall,
    Failed,
}

/// <param name="AvailableVersion">The newer version, once one has been found.</param>
/// <param name="Message">One sentence for the user.</param>
public sealed record UpdateStatus(UpdateState State, string? AvailableVersion, string Message);
