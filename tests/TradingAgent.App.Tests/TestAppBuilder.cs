using Avalonia;
using Avalonia.Headless;
using TradingAgent.App.Motion;
using TradingAgent.App.Tests;
using Xunit;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

// One test at a time. A test on the headless platform sets the application up anew, and with it the
// UI thread's dispatcher. A plain test that makes a brush or a control on another thread at that
// moment takes the dispatcher for its own thread, and the set-up then fails with "a different
// thread owns it". That happened now and then; in turn it cannot.
[assembly: CollectionBehavior(DisableTestParallelization = true)]

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
