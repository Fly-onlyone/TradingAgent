using System.Diagnostics;

namespace TradingAgent.Core.Shell;

/// <summary>
/// Ties child processes to this app: when the app ends, however it ends, the operating system ends
/// them too. Without it a crash of the app would leave helper processes running with nobody to stop them.
/// </summary>
public interface IChildProcessJob
{
    /// <summary>Puts a started process, and every process it starts later, under the app's lifetime.</summary>
    void Add(Process process);
}
