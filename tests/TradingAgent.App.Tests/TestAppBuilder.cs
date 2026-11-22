using Avalonia;
using Avalonia.Headless;
using TradingAgent.App.Tests;

[assembly: AvaloniaTestApplication(typeof(TestAppBuilder))]

namespace TradingAgent.App.Tests;

/// <summary>Starts the real application class on the headless platform: no window system, no GPU.</summary>
public static class TestAppBuilder
{
    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<ShellApp>().UseHeadless(new AvaloniaHeadlessPlatformOptions());
}
