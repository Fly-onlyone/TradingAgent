using System.Runtime.Versioning;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Platform.Windows;
using Xunit;

namespace TradingAgent.Data.Tests;

[SupportedOSPlatform("windows")]
public sealed class WindowsAutostartTests
{
    [Fact]
    public void Enable_writes_a_shortcut_to_the_program_and_disable_removes_it()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Shell shortcuts exist only on Windows.");
        using var temp = new TempDatabase(initialize: false);
        var executable = Path.Combine(temp.Folder, "TradingAgent.exe");
        File.WriteAllBytes(executable, []);
        var autostart = new WindowsAutostart(
            "TradingAgent-Test", executable, "Trading agent", NullLogger<WindowsAutostart>.Instance, startupFolder: temp.Folder);
        var shortcut = Path.Combine(temp.Folder, "TradingAgent-Test.lnk");

        Assert.False(autostart.IsEnabled);

        autostart.Enable();

        Assert.True(autostart.IsEnabled);
        var bytes = File.ReadAllBytes(shortcut);
        // A shell link starts with its header size (0x4C) and stores the target path as UTF-16.
        Assert.Equal(0x4C, bytes[0]);
        Assert.Contains("TradingAgent.exe", Encoding.Unicode.GetString(bytes), StringComparison.OrdinalIgnoreCase);

        autostart.Enable(); // enabling twice overwrites, it does not fail
        autostart.Disable();

        Assert.False(autostart.IsEnabled);
        autostart.Disable(); // disabling twice is harmless
    }

    [Fact]
    public void Enable_reports_a_folder_it_cannot_write_to()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Shell shortcuts exist only on Windows.");
        using var temp = new TempDatabase(initialize: false);
        var missingFolder = Path.Combine(temp.Folder, "does", "not", "exist");
        var autostart = new WindowsAutostart(
            "TradingAgent-Test", @"C:\TradingAgent.exe", "Trading agent", NullLogger<WindowsAutostart>.Instance, missingFolder);

        Assert.Throws<InvalidOperationException>(autostart.Enable);
        Assert.False(autostart.IsEnabled);
    }
}
