using System.IO.Pipes;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;
using Avalonia.VisualTree;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Cli;
using TradingAgent.Agent.Mcp;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.App.ViewModels;
using TradingAgent.App.Views;
using TradingAgent.Core;
using TradingAgent.Core.Hosting;
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

        // Chat first: it is what the app is opened for.
        Assert.Equal(["Chat", "Dashboard", "Trading", "Orders", "Trades", "Tasks", "Strategies", "Knowledge", "Memory", "News", "Settings", "Admin", "Diagnostics"], main.Pages.Select(page => page.Title));
        Assert.Same(services.GetRequiredService<ChatViewModel>(), main.SelectedPage);
        Assert.True(File.Exists(_paths.DatabaseFile));
        Assert.True(services.GetRequiredService<ISettingsStore>().GetValue(SettingKeys.OkxSandbox));
        Assert.Equal(SecretState.Unset, services.GetRequiredService<ISecretStore>().GetState(SecretNames.OkxApiKey));
    }

    [Fact]
    public void The_trade_kit_is_one_service_that_runs_in_the_background_and_feeds_the_tool_host()
    {
        using var services = ShellApp.BuildServices(_info, _paths);

        var kit = services.GetRequiredService<AtkService>();

        Assert.Same(kit, Assert.Single(services.GetServices<IToolSource>()));
        Assert.Contains(kit, services.GetServices<IBackgroundService>());
        Assert.Equal(AtkState.Stopped, kit.Status.State);
        // Resolving the graph starts nothing: the app's own tools are there, the kit's are not.
        var tools = services.GetRequiredService<ToolHost>().Definitions.Select(definition => definition.Name).ToList();
        Assert.Contains("get_ticker", tools);
        Assert.DoesNotContain(tools, name => name.StartsWith(AtkToolCatalog.Prefix, StringComparison.Ordinal));
        Assert.False(Directory.Exists(_paths.TradeKitHomeDirectory));
        Assert.StartsWith(_paths.DataDirectory, _paths.TradeKitHomeDirectory, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("anthropic", "subscription", typeof(ClaudeCliRuntime))]
    [InlineData("anthropic", "api_key", typeof(ModelLoopRuntime))]
    [InlineData("openai", "subscription", typeof(ModelLoopRuntime))]
    public void The_sign_in_mode_decides_which_runtime_answers(string provider, string authMode, Type runtime)
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var settings = services.GetRequiredService<ISettingsStore>();
        settings.SetValue(SettingKeys.AgentProvider, provider);
        settings.SetValue(SettingKeys.AgentAuthMode, authMode);
        settings.SetValue(SettingKeys.AgentSubscriptionNoticeConfirmed, true);

        var resolved = services.GetRequiredService<IAgentRuntimeResolver>().Resolve();

        // A subscription means Claude Code runs the model; the app never holds that credential.
        Assert.IsType(runtime, resolved.Runtime);
        Assert.Null(resolved.Problem);
        Assert.StartsWith(_paths.DataDirectory, _paths.ClaudeCodeDirectory, StringComparison.Ordinal);
    }

    [Fact]
    public void The_system_prompt_names_every_tool_of_the_apps_own_and_the_page_has_its_agent_card()
    {
        using var services = ShellApp.BuildServices(_info, _paths);

        var prompt = services.GetRequiredService<ISystemPrompt>().Build();
        var tools = services.GetRequiredService<ToolHost>().Definitions.Select(definition => definition.Name).ToList();

        // A tool the prompt does not mention is one the model has to guess the use of.
        Assert.NotEmpty(tools);
        Assert.All(tools, tool => Assert.Contains($"`{tool}`", prompt, StringComparison.Ordinal));
        var card = services.GetRequiredService<DiagnosticsViewModel>().Agent;
        Assert.NotNull(card);
        Assert.Equal("Not running.", card.TradeKit);
    }

    [Fact]
    public void Every_tool_describes_its_arguments_with_a_json_schema_object()
    {
        using var services = ShellApp.BuildServices(_info, _paths);

        Assert.All(services.GetRequiredService<ToolHost>().Definitions, definition =>
        {
            // Sent as it is to the model provider and to Claude Code; one schema that does not
            // parse loses every tool, not just its own.
            using var schema = System.Text.Json.JsonDocument.Parse(definition.InputSchemaJson);
            Assert.Equal(System.Text.Json.JsonValueKind.Object, schema.RootElement.ValueKind);
            Assert.Equal("object", schema.RootElement.GetProperty("type").GetString());
            Assert.NotEmpty(definition.Description);
        });
    }

    [Fact]
    public async Task The_apps_real_tools_can_be_listed_over_the_bridge_pipe()
    {
        // Found with the real Claude Code: with one test tool the list went through, with the app's
        // own tools it never arrived, and the model answered without tools. Their schemas are
        // written over several lines, which cut the one-line message into pieces.
        using var services = ShellApp.BuildServices(_info, _paths);
        var host = services.GetRequiredService<ToolHost>();
        var log = new CapturingLogger();
        var server = new McpToolServer(
            () => host.Definitions,
            (_, _) => Task.FromResult(new ToolOutcome("unused")),
            "trading",
            "9.8.7",
            log);
        await using var endpoint = BridgeEndpoint.Start(server, log);
        var pipe = new NamedPipeClientStream(".", endpoint.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await pipe.ConnectAsync(TimeSpan.FromSeconds(10), TestContext.Current.CancellationToken);
        await pipe.WriteAsync(System.Text.Encoding.UTF8.GetBytes(endpoint.Token + "\n"), TestContext.Current.CancellationToken);
        await using var client = new McpClient(new StreamTransport(pipe), NullLogger.Instance, TimeSpan.FromSeconds(10));

        await client.InitializeAsync("claude-code", "2.1.330", TestContext.Current.CancellationToken);
        var listing = await Record.ExceptionAsync(() => client.ListToolsAsync(TestContext.Current.CancellationToken));
        Assert.True(listing is null, $"{listing?.Message} Server log: {string.Join(" | ", log.Entries)}");
        var listed = await client.ListToolsAsync(TestContext.Current.CancellationToken);

        Assert.Equal(host.Definitions.Select(definition => definition.Name), listed.Select(tool => tool.Name));
        Assert.Contains(host.Definitions, definition => definition.InputSchemaJson.Contains('\n', StringComparison.Ordinal));
    }

    [Fact]
    public void A_subscription_runs_nothing_until_its_notice_is_confirmed_and_stops_when_that_is_taken_back()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var settings = services.GetRequiredService<ISettingsStore>();
        var resolver = services.GetRequiredService<IAgentRuntimeResolver>();

        // A new install: the subscription mode is the default, and nothing is confirmed.
        var before = resolver.Resolve();
        settings.SetValue(SettingKeys.AgentSubscriptionNoticeConfirmed, true);
        var confirmed = resolver.Resolve();
        settings.Reset(SettingKeys.AgentSubscriptionNoticeConfirmed);
        var takenBack = resolver.Resolve();

        Assert.Null(before.Runtime);
        Assert.Equal(ClaudeCli.NoticeNotConfirmed, before.Problem);
        Assert.IsType<ClaudeCliRuntime>(confirmed.Runtime);
        Assert.Null(takenBack.Runtime);
    }

    [Theory]
    [InlineData("anthropic")]
    [InlineData("openai")]
    public void An_api_key_mode_needs_no_confirmation(string provider)
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var settings = services.GetRequiredService<ISettingsStore>();
        settings.SetValue(SettingKeys.AgentProvider, provider);
        settings.SetValue(SettingKeys.AgentAuthMode, "api_key");

        Assert.IsType<ModelLoopRuntime>(services.GetRequiredService<IAgentRuntimeResolver>().Resolve().Runtime);
    }

    [AvaloniaFact]
    public void Every_page_of_the_rail_has_a_view_that_renders()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var main = services.GetRequiredService<MainViewModel>();
        var window = new MainWindow { DataContext = main };
        window.Show();

        foreach (var page in main.Pages)
        {
            main.SelectedPage = page;
            Dispatcher.UIThread.RunJobs();

            // The locator's fallback is a text block that says no view is registered.
            var host = window.GetVisualDescendants().OfType<ContentControl>().Single(control => control.Name == "PageHost");
            Assert.IsNotType<TextBlock>(host.GetVisualDescendants().OfType<Control>().First(control => control is UserControl or TextBlock));
        }

        Assert.Single(window.GetVisualDescendants().OfType<DiagnosticsView>());
        window.Close();
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
        var main = services.GetRequiredService<MainViewModel>();
        main.SelectedPage = services.GetRequiredService<DiagnosticsViewModel>();
        var window = new MainWindow { DataContext = main };

        window.Show();
        Dispatcher.UIThread.RunJobs();

        var page = Assert.Single(window.GetVisualDescendants().OfType<DiagnosticsView>());
        var texts = page.GetVisualDescendants().OfType<SelectableTextBlock>().Select(t => t.Text).ToList();
        Assert.Contains("9.8.7", texts);
        Assert.Contains(_paths.DataDirectory, texts);
        // The schema version grows with every migration; the page must show whatever the database has.
        var schema = services.GetRequiredService<TradingAgent.Data.Database>().SchemaVersion;
        Assert.True(schema >= 2);
        Assert.Contains(texts, text => text is not null && text.StartsWith($"version {schema}, SQLite 3.", StringComparison.Ordinal));
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

    /// <summary>Keeps what was logged, so a failing test can say what the server ran into.</summary>
    private sealed class CapturingLogger : Microsoft.Extensions.Logging.ILogger
    {
        public List<string> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => true;

        public void Log<TState>(
            Microsoft.Extensions.Logging.LogLevel logLevel,
            Microsoft.Extensions.Logging.EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            lock (Entries)
            {
                Entries.Add($"{logLevel}: {formatter(state, exception)} {exception?.GetType().Name}: {exception?.Message}");
            }
        }
    }
}
