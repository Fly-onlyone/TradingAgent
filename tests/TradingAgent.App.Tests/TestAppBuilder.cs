using Avalonia;
using Avalonia.Headless;
using TradingAgent.App.Motion;
using TradingAgent.App.Tests;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

namespace TradingAgent.App.Tests;

/// <summary>Starts the real application class on the headless platform: no window system, no GPU.</summary>
public static class TestAppBuilder
{
    public static AppBuilder BuildAvaloniaApp()
    {
        // Nothing draws frames here, so an animation would never get past its first one. Off, every
        // control is in its final state at once, which is what a test looks at.
        FrameDriver.IsInstant = true;
        return AppBuilder.Configure<ShellApp>().UseHeadless(new AvaloniaHeadlessPlatformOptions());
    }
}
