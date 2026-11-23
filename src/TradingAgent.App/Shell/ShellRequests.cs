namespace TradingAgent.App.Shell;

/// <summary>Lets a page ask the shell for an app-level action without knowing the shell.</summary>
/// <remarks>The shell owns the window and the exit sequence; pages only raise the request.</remarks>
public sealed class ShellRequests
{
    public event EventHandler? RestartToUpdateRequested;

    public void RequestRestartToUpdate() => RestartToUpdateRequested?.Invoke(this, EventArgs.Empty);
}
