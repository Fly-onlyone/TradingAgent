using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;
using Avalonia.VisualTree;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using TradingAgent.App.ViewModels;
using TradingAgent.App.Views;
using TradingAgent.Core;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;
using Xunit;

namespace TradingAgent.App.Tests;

public sealed class ShellTests : IDisposable
{
    private static readonly AppInfo _info = new("9.8.7", IsDevelopmentBuild: false);

    private readonly string _root = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));
    private readonly AppPaths _paths;

    public ShellTests()
    {
        _paths = new AppPaths(_root, isDevelopmentBuild: true);
        _paths.EnsureCreated();
    }

    public void Dispose()
    {
        // Pooled connections keep the database file open; release them before deleting it.
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
            // A leftover temp folder is harmless.
        }
    }

    [Fact]
    public void Service_graph_resolves_and_creates_the_database()
    {
        using var services = ShellApp.BuildServices(_info, _paths);

        var main = services.GetRequiredService<MainViewModel>();

        Assert.Same(services.GetRequiredService<DiagnosticsViewModel>(), main.SelectedPage);
        Assert.Single(main.Pages);
        Assert.True(File.Exists(_paths.DatabaseFile));
        Assert.True(services.GetRequiredService<ISettingsStore>().GetValue(SettingKeys.OkxSandbox));
        Assert.Equal(SecretState.Unset, services.GetRequiredService<ISecretStore>().GetState(SecretNames.OkxApiKey));
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
        Assert.Contains(texts, text => text is not null && text.StartsWith("version 1, SQLite 3.", StringComparison.Ordinal));
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
