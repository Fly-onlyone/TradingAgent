using Microsoft.Extensions.Logging;
using TradingAgent.Core.Shell;
using Velopack;
using Velopack.Sources;

namespace TradingAgent.App.Shell;

/// <summary>Updates the installed app from the project's GitHub Releases, using Velopack.</summary>
/// <remarks>
/// Checks shortly after start and then every six hours, and downloads what it finds. Nothing is installed
/// until the app exits. Setting the environment variable <c>TRADINGAGENT_UPDATE_SOURCE</c> to a folder or
/// URL replaces GitHub as the source; that exists to test the update flow against local packages.
/// </remarks>
internal sealed partial class VelopackUpdateService : IUpdateService, IDisposable
{
    private const string RepositoryUrl = "https://github.com/Fly-onlyone/TradingAgent";
    private const string SourceOverrideVariable = "TRADINGAGENT_UPDATE_SOURCE";

    private static readonly TimeSpan _firstCheckDelay = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan _checkInterval = TimeSpan.FromHours(6);

    /// <summary>Null when the app was not started through its normal entry point, as under the UI tests.</summary>
    private readonly UpdateManager? _manager;
    private readonly TimeProvider _time;
    private readonly ILogger<VelopackUpdateService> _logger;
    private readonly SemaphoreSlim _checking = new(1, 1);
    private UpdateInfo? _downloaded;
    private ITimer? _timer;

    public VelopackUpdateService(TimeProvider time, ILogger<VelopackUpdateService> logger)
    {
        _time = time;
        _logger = logger;

        _manager = CreateManager();
        Status = IsInstalled
            ? new UpdateStatus(UpdateState.Idle, null, "Not checked yet.")
            : new UpdateStatus(UpdateState.NotInstalled, null, "This copy was not installed with the installer, so it does not update itself.");
    }

    public event EventHandler? StatusChanged;

    public UpdateStatus Status { get; private set; }

    private bool IsInstalled => _manager is { IsInstalled: true };

    /// <summary>Starts the periodic checks. Does nothing for a copy that was not installed.</summary>
    public void Start()
    {
        if (IsInstalled)
        {
            _timer ??= _time.CreateTimer(_ => _ = CheckAsync(), null, _firstCheckDelay, _checkInterval);
        }
    }

    public async Task CheckAsync(CancellationToken cancellationToken = default)
    {
        if (_manager is null || !IsInstalled)
        {
            return;
        }

        if (!await _checking.WaitAsync(0, cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        try
        {
            SetStatus(UpdateState.Checking, _downloaded?.TargetFullRelease.Version.ToString(), "Checking for updates...");
            var update = await _manager.CheckForUpdatesAsync().ConfigureAwait(false);
            if (update is null)
            {
                if (_downloaded is null)
                {
                    SetStatus(UpdateState.Idle, null, "You have the latest version.");
                }
                else
                {
                    SetReady(_downloaded);
                }

                return;
            }

            var version = update.TargetFullRelease.Version.ToString();
            SetStatus(UpdateState.Downloading, version, $"Downloading version {version}...");
            await _manager.DownloadUpdatesAsync(update, cancelToken: cancellationToken).ConfigureAwait(false);
            _downloaded = update;
            LogDownloaded(_logger, version);
            SetReady(update);
        }
#pragma warning disable CA1031 // An update check talks to the network and the file system; no failure there may take the app down.
        catch (Exception ex)
#pragma warning restore CA1031
        {
            LogCheckFailed(_logger, ex);
            SetStatus(UpdateState.Failed, _downloaded?.TargetFullRelease.Version.ToString(), "The update check failed. It will be tried again later.");
        }
        finally
        {
            _checking.Release();
        }
    }

    public bool ApplyOnExit(bool restart)
    {
        if (_manager is null || _downloaded is null)
        {
            return false;
        }

        _manager.WaitExitThenApplyUpdates(_downloaded.TargetFullRelease, silent: true, restart: restart);
        return true;
    }

    public void Dispose()
    {
        _timer?.Dispose();
        _checking.Dispose();
    }

    private UpdateManager? CreateManager()
    {
        try
        {
            var sourceOverride = Environment.GetEnvironmentVariable(SourceOverrideVariable);
            if (string.IsNullOrWhiteSpace(sourceOverride))
            {
                return new UpdateManager(new GithubSource(RepositoryUrl, accessToken: null, prerelease: false));
            }

            LogSourceOverride(_logger, sourceOverride);
            return new UpdateManager(sourceOverride);
        }
        catch (InvalidOperationException)
        {
            // Velopack was not initialised: VelopackApp.Build().Run() in Main did not run in this process.
            return null;
        }
    }

    private void SetReady(UpdateInfo update)
    {
        var version = update.TargetFullRelease.Version.ToString();
        SetStatus(UpdateState.ReadyToInstall, version, $"Version {version} is ready. It installs when the app exits.");
    }

    private void SetStatus(UpdateState state, string? version, string message)
    {
        Status = new UpdateStatus(state, version, message);
        StatusChanged?.Invoke(this, EventArgs.Empty);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Updates are read from {Source} instead of GitHub Releases (TRADINGAGENT_UPDATE_SOURCE is set).")]
    private static partial void LogSourceOverride(ILogger logger, string source);

    [LoggerMessage(Level = LogLevel.Information, Message = "Downloaded version {Version}; it installs when the app exits.")]
    private static partial void LogDownloaded(ILogger logger, string version);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Checking for updates failed.")]
    private static partial void LogCheckFailed(ILogger logger, Exception exception);
}
