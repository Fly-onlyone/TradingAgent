using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;
using Avalonia.VisualTree;
using Microsoft.Extensions.DependencyInjection;
using TradingAgent.App.ViewModels;
using TradingAgent.App.Views;
using TradingAgent.Core;
using Xunit;

namespace TradingAgent.App.Tests;

public sealed class ShellTests
{
    private static readonly AppInfo _info = new("9.8.7", IsDevelopmentBuild: false);
    private static readonly AppPaths _paths = new(Path.GetTempPath(), isDevelopmentBuild: true);

    [Fact]
    public void Service_graph_resolves()
    {
        using var services = ShellApp.BuildServices(_info, _paths);

        var main = services.GetRequiredService<MainViewModel>();

        Assert.Same(services.GetRequiredService<DiagnosticsViewModel>(), main.SelectedPage);
        Assert.Single(main.Pages);
    }

    [Fact]
    public void Development_build_is_marked_in_the_title()
    {
        var dev = new AppInfo("1.0.0", IsDevelopmentBuild: true);
        using var services = ShellApp.BuildServices(dev, _paths);

        Assert.Equal("Trading agent (dev)", services.GetRequiredService<MainViewModel>().WindowTitle);
    }

    [AvaloniaFact]
    public void Main_window_shows_title_and_enforces_minimum_size()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var window = new MainWindow { DataContext = services.GetRequiredService<MainViewModel>() };

        window.Show();
        Dispatcher.UIThread.RunJobs();

        Assert.Equal("Trading agent", window.Title);
        Assert.Equal(1024, window.MinWidth);
        Assert.Equal(700, window.MinHeight);
        window.Close();
    }

    [AvaloniaFact]
    public void Page_host_renders_the_diagnostics_page_with_build_facts()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var window = new MainWindow { DataContext = services.GetRequiredService<MainViewModel>() };

        window.Show();
        Dispatcher.UIThread.RunJobs();

        var page = Assert.Single(window.GetVisualDescendants().OfType<DiagnosticsView>());
        var texts = page.GetVisualDescendants().OfType<SelectableTextBlock>().Select(t => t.Text).ToList();
        Assert.Contains("9.8.7", texts);
        Assert.Contains(_paths.DataDirectory, texts);
        window.Close();
    }

    [AvaloniaFact]
    public void View_locator_falls_back_to_a_message_for_an_unknown_page()
    {
        var locator = new ViewLocator();

        var control = locator.Build(new UnknownPage());

        Assert.True(locator.Match(new UnknownPage()));
        Assert.False(locator.Match("not a page"));
        Assert.Contains(nameof(UnknownPage), Assert.IsType<TextBlock>(control).Text);
    }

    private sealed class UnknownPage : PageViewModel
    {
        public override string Title => "Unknown";
    }
}
