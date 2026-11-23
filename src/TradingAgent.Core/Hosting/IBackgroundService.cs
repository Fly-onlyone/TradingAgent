namespace TradingAgent.Core.Hosting;

/// <summary>Work that runs for as long as the app does: a timer, a child process, a poller.</summary>
/// <remarks>
/// Services are started in the order they are registered and stopped in the reverse order, so a service
/// may rely on the ones registered before it.
/// </remarks>
public interface IBackgroundService
{
    /// <summary>Shown in logs.</summary>
    string Name { get; }

    /// <summary>
    /// Starts the work and returns once it runs; it must not wait for the work to end.
    /// <paramref name="stopping"/> is cancelled when the app begins to shut down.
    /// </summary>
    Task StartAsync(CancellationToken stopping);

    /// <summary>
    /// Ends the work. <paramref name="deadline"/> is cancelled when the app will not wait any longer.
    /// Must be safe to call when <see cref="StartAsync"/> failed or was never called.
    /// </summary>
    Task StopAsync(CancellationToken deadline);
}
