using System.Diagnostics;
using System.Runtime.Versioning;
using TradingAgent.Platform.Windows;
using Xunit;

namespace TradingAgent.Data.Tests;

[SupportedOSPlatform("windows")]
public sealed class WindowsChildProcessJobTests
{
    [Fact]
    public void A_process_in_the_job_ends_when_the_job_is_closed()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Job objects exist only on Windows.");
        using var process = StartLongRunning("ping.exe", "-n", "120", "127.0.0.1");
        try
        {
            var job = new WindowsChildProcessJob();
            job.Add(process);
            Assert.False(process.HasExited);

            // What happens to the handle when the app ends, however it ends.
            job.Dispose();

            Assert.True(process.WaitForExit(TimeSpan.FromSeconds(10)));
        }
        finally
        {
            KillIfRunning(process);
        }
    }

    [Fact]
    public void A_process_started_by_one_in_the_job_ends_with_it()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Job objects exist only on Windows.");
        // The trade kit is started through a script: the script is the child, the kit its child.
        using var shell = StartLongRunning("cmd.exe", "/d", "/c", "ping.exe -n 120 127.0.0.1");
        try
        {
            using var job = new WindowsChildProcessJob();
            job.Add(shell);
            var grandchild = WaitForChildOf(shell.Id);

            job.Dispose();

            Assert.True(shell.WaitForExit(TimeSpan.FromSeconds(10)));
            Assert.True(grandchild.WaitForExit(TimeSpan.FromSeconds(10)));
            grandchild.Dispose();
        }
        finally
        {
            KillIfRunning(shell);
        }
    }

    [Fact]
    public void A_process_outside_the_job_is_left_alone()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Job objects exist only on Windows.");
        using var process = StartLongRunning("ping.exe", "-n", "120", "127.0.0.1");
        try
        {
            var job = new WindowsChildProcessJob();

            job.Dispose();

            Assert.False(process.WaitForExit(TimeSpan.FromMilliseconds(500)));
        }
        finally
        {
            KillIfRunning(process);
        }
    }

    private static Process StartLongRunning(string fileName, params string[] arguments)
    {
        var start = new ProcessStartInfo(fileName) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true };
        foreach (var argument in arguments)
        {
            start.ArgumentList.Add(argument);
        }

        var process = Process.Start(start) ?? throw new InvalidOperationException($"{fileName} did not start.");
        // Read and dropped, so the process never blocks on a full pipe.
        process.OutputDataReceived += (_, _) => { };
        process.BeginOutputReadLine();
        return process;
    }

    /// <summary>The first <c>ping.exe</c> started after the shell, which is its child here.</summary>
    private static Process WaitForChildOf(int shellId)
    {
        var shellStart = Process.GetProcessById(shellId).StartTime;
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (DateTime.UtcNow < deadline)
        {
            foreach (var candidate in Process.GetProcessesByName("ping"))
            {
                try
                {
                    if (candidate.StartTime >= shellStart)
                    {
                        return candidate;
                    }
                }
                catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
                {
                    // Gone, or not ours to look at.
                }

                candidate.Dispose();
            }

            Thread.Sleep(50);
        }

        throw new InvalidOperationException("The shell did not start its child in time.");
    }

    private static void KillIfRunning(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            // Already gone.
        }
    }
}
