using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Tools;
using TradingAgent.Core;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Settings;
using TradingAgent.Exchange.Okx;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class AtkServiceTests : IAsyncDisposable
{
    private static readonly TimeSpan _patience = TimeSpan.FromSeconds(10);
    private static readonly ToolContext _context = new("session", "message", "toolu_1");

    private readonly FakeAtkLauncher _launcher = new();
    private readonly FakeSettings _settings = new();
    private readonly AtkService _service;
    private OkxCredentials? _credentials;

    public AtkServiceTests()
    {
        _service = new AtkService(
            _launcher,
            () => _credentials,
            _settings,
            new AppInfo("1.2.3", IsDevelopmentBuild: true),
            TimeProvider.System,
            NullLogger<AtkService>.Instance);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask DisposeAsync()
    {
        using var deadline = new CancellationTokenSource(_patience);
        await _service.StopAsync(deadline.Token);
    }

    [Fact]
    public async Task Only_the_reading_tools_of_the_inventory_reach_the_agent()
    {
        _launcher.Returns(new FakeMcpServer().Offers(
            ("market_get_ticker", true),
            ("account_get_balance", true),
            ("spot_place_order", false),
            ("account_transfer", false),
            ("account_set_position_mode", false),
            ("brand_new_tool", true)));

        await StartAndWaitFor(AtkState.Running);

        Assert.Equal(["okx_market_get_ticker", "okx_account_get_balance"], _service.GetTools().Select(tool => tool.Definition.Name));
        Assert.Equal(new AtkStatus(AtkState.Running, null, 2, Sandbox: true, HasKey: false), _service.Status);
        Assert.True(_service.IsAccepting);
    }

    [Fact]
    public async Task The_kit_is_started_read_only_in_the_mode_of_the_settings_with_the_saved_key()
    {
        _credentials = new OkxCredentials("key", "secret", "pass");
        _settings.SetValue(SettingKeys.OkxSandbox, false);

        await StartAndWaitFor(AtkState.Running);

        var options = Assert.Single(_launcher.Launches);
        Assert.Equal(new AtkLaunchOptions(Sandbox: false, AtkToolCatalog.DefaultModules, ReadOnly: true, _credentials), options);
        Assert.Equal((false, true), (_service.Status.Sandbox, _service.Status.HasKey));
        var hello = Assert.Single(_launcher.Servers[0].RequestsOf("initialize")).GetProperty("params").GetProperty("clientInfo");
        Assert.Equal(("trading-agent", "1.2.3"), (hello.GetProperty("name").GetString(), hello.GetProperty("version").GetString()));
    }

    [Fact]
    public async Task A_tool_the_inventory_lists_as_reading_is_hidden_when_the_kit_says_it_writes()
    {
        // The kit changed under the inventory: the stricter of the two statements wins.
        _launcher.Returns(new FakeMcpServer().Offers(("market_get_ticker", false), ("market_get_candles", null)));

        await StartAndWaitFor(AtkState.Running);

        Assert.Equal(["okx_market_get_candles"], _service.GetTools().Select(tool => tool.Definition.Name));
    }

    [Fact]
    public async Task A_tool_call_reaches_the_kit_under_the_kits_own_name_with_the_models_arguments()
    {
        var server = new FakeMcpServer()
            .Offers(("market_get_ticker", true))
            .On("tools/call", _ => """{"content":[{"type":"text","text":"{\"last\":\"61594.8\"}"}]}""");
        _launcher.Returns(server);
        await StartAndWaitFor(AtkState.Running);
        var tool = Assert.Single(_service.GetTools());
        using var input = JsonDocument.Parse("""{"instId":"BTC-USDT"}""");

        var outcome = await tool.InvokeAsync(input.RootElement, _context, Ct);

        Assert.Equal(new ToolOutcome("""{"last":"61594.8"}"""), outcome);
        var call = Assert.Single(server.RequestsOf("tools/call")).GetProperty("params");
        Assert.Equal("market_get_ticker", call.GetProperty("name").GetString());
        Assert.Equal("""{"instId":"BTC-USDT"}""", call.GetProperty("arguments").GetRawText());
    }

    [Fact]
    public async Task The_definition_the_model_sees_carries_the_kits_description_and_schema()
    {
        _launcher.Returns(new FakeMcpServer().On(
            "tools/list",
            _ => $$$"""{"tools":[{"name":"market_get_ticker","description":"{{{new string('d', 1500)}}}","inputSchema":{"type":"object","required":["instId"]}}]}"""));
        await StartAndWaitFor(AtkState.Running);

        var definition = Assert.Single(_service.GetTools()).Definition;

        Assert.Equal(1024, definition.Description.Length);
        Assert.Equal("""{"type":"object","required":["instId"]}""", definition.InputSchemaJson);
    }

    [Fact]
    public async Task No_tool_that_writes_can_be_called_by_name_and_the_kit_is_never_asked()
    {
        var server = new FakeMcpServer().On("tools/call", _ => """{"content":[{"type":"text","text":"order placed"}]}""");
        _launcher.Returns(server);
        await StartAndWaitFor(AtkState.Running);
        var writes = AtkToolCatalog.Names.Where(name => AtkToolCatalog.IsWrite(AtkToolCatalog.Kind(name))).ToList();

        foreach (var name in writes)
        {
            var outcome = await _service.CallAsync(name, """{"instId":"BTC-USDT","sz":"1"}""", Ct);
            Assert.Equal(ToolCallStatus.Denied, outcome.Status);
        }

        Assert.Equal(27, writes.Count);
        Assert.Empty(server.RequestsOf("tools/call"));
    }

    [Theory]
    [InlineData("withdraw_everything")]
    [InlineData("account_set_position_mode")]
    [InlineData("okx_market_get_ticker")]
    [InlineData("")]
    public async Task A_tool_that_is_not_in_the_inventory_is_refused_and_the_kit_is_never_asked(string name)
    {
        var server = new FakeMcpServer().On("tools/call", _ => """{"content":[]}""");
        _launcher.Returns(server);
        await StartAndWaitFor(AtkState.Running);

        var outcome = await _service.CallAsync(name, "{}", Ct);

        Assert.Equal(ToolCallStatus.Denied, outcome.Status);
        Assert.Empty(server.RequestsOf("tools/call"));
    }

    [Fact]
    public async Task A_failure_the_kit_reports_is_a_failed_call_and_names_the_missing_key_when_none_is_saved()
    {
        _launcher.Returns(new FakeMcpServer().On("tools/call", _ => """{"content":[{"type":"text","text":"No credentials found."}],"isError":true}"""));
        await StartAndWaitFor(AtkState.Running);

        var outcome = await _service.CallAsync("account_get_balance", "{}", Ct);

        Assert.Equal(ToolCallStatus.Failed, outcome.Status);
        Assert.StartsWith("No credentials found.", outcome.Content, StringComparison.Ordinal);
        Assert.Contains("No OKX API key is saved in this app", outcome.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task With_a_saved_key_the_kits_failure_is_passed_on_as_it_is()
    {
        _credentials = new OkxCredentials("key", "secret", "pass");
        _launcher.Returns(new FakeMcpServer().On("tools/call", _ => """{"content":[{"type":"text","text":"Invalid OK-ACCESS-KEY"}],"isError":true}"""));
        await StartAndWaitFor(AtkState.Running);

        var outcome = await _service.CallAsync("account_get_balance", "{}", Ct);

        Assert.Equal(ToolOutcome.Failed("Invalid OK-ACCESS-KEY"), outcome);
    }

    [Fact]
    public async Task A_protocol_error_from_the_kit_is_a_failed_call_not_an_exception()
    {
        _launcher.Returns(new FakeMcpServer().On("tools/call", _ => """{"error":{"code":-32602,"message":"Invalid arguments"}}"""));
        await StartAndWaitFor(AtkState.Running);

        var outcome = await _service.CallAsync("market_get_ticker", "{}", Ct);

        Assert.Equal(ToolOutcome.Failed("Invalid arguments"), outcome);
    }

    [Fact]
    public async Task Before_the_kit_runs_there_are_no_tools_and_a_call_says_to_try_again()
    {
        var outcome = await _service.CallAsync("market_get_ticker", "{}", Ct);

        Assert.Equal(ToolCallStatus.Failed, outcome.Status);
        Assert.Contains("starting or restarting", outcome.Content, StringComparison.Ordinal);
        Assert.Empty(_service.GetTools());
        Assert.False(_service.IsAccepting);
        Assert.Equal(AtkState.Stopped, _service.Status.State);
    }

    [Fact]
    public async Task On_a_machine_without_the_kit_the_status_says_so_and_nothing_is_retried_until_asked()
    {
        _launcher.IsNotInstalled();

        await StartAndWaitFor(AtkState.Unavailable);
        var outcome = await _service.CallAsync("market_get_ticker", "{}", Ct);

        Assert.Equal("The OKX trade kit is not installed.", _service.Status.Detail);
        Assert.Equal(ToolOutcome.Failed("The OKX trade kit is not installed."), outcome);
        Assert.Empty(_service.GetTools());
        // No second attempt on its own: installing the kit does not happen in two seconds.
        await Task.Delay(TimeSpan.FromMilliseconds(300), Ct);
        Assert.Single(_launcher.Launches);

        _service.Reload();

        await WaitFor(AtkState.Running);
        Assert.Equal(2, _launcher.Launches.Count);
    }

    [Fact]
    public async Task When_the_kit_dies_its_tools_go_away_and_it_is_started_again()
    {
        var first = new FakeMcpServer().Offers(("market_get_ticker", true));
        var second = new FakeMcpServer().Offers(("market_get_ticker", true), ("market_get_candles", true));
        _launcher.Returns(first).Returns(second);
        await StartAndWaitFor(AtkState.Running);

        first.Close();

        await WaitFor(AtkState.Failed);
        Assert.Empty(_service.GetTools());
        Assert.False(_service.IsAccepting);
        Assert.Contains("stopped unexpectedly", _service.Status.Detail, StringComparison.Ordinal);
        // Started again after a wait; asked here so the test does not sit through it.
        _service.Reload();
        await WaitFor(AtkState.Running);
        Assert.Equal(2, _service.GetTools().Count);
        Assert.True(first.Disposed);
    }

    [Fact]
    public async Task A_kit_that_cannot_open_the_session_counts_as_failed_and_is_shut_down()
    {
        var broken = new FakeMcpServer().On("initialize", _ => """{"error":{"code":-32603,"message":"boom"}}""");
        _launcher.Returns(broken);

        await StartAndWaitFor(AtkState.Failed);

        Assert.Equal("boom", _service.Status.Detail);
        Assert.True(broken.Disposed);
        Assert.Empty(_service.GetTools());
    }

    [Fact]
    public async Task Switching_between_demo_and_live_restarts_the_kit_in_the_other_mode()
    {
        await StartAndWaitFor(AtkState.Running);
        Assert.True(_service.Status.Sandbox);

        _settings.SetValue(SettingKeys.OkxSandbox, false);

        await WaitFor(status => status is { State: AtkState.Running, Sandbox: false });
        Assert.Equal([true, false], _launcher.Launches.Select(options => options.Sandbox));
        // The kit of the old mode is gone before the new one takes calls.
        Assert.True(_launcher.Servers[0].Disposed);
        Assert.False(_launcher.Servers[1].Disposed);
    }

    [Fact]
    public async Task Another_setting_does_not_restart_the_kit()
    {
        await StartAndWaitFor(AtkState.Running);

        _settings.SetValue(SettingKeys.AgentModel, "opus");
        await Task.Delay(TimeSpan.FromMilliseconds(300), Ct);

        Assert.Single(_launcher.Launches);
        Assert.Equal(AtkState.Running, _service.Status.State);
    }

    [Fact]
    public async Task A_reload_picks_up_a_key_saved_after_the_start()
    {
        await StartAndWaitFor(AtkState.Running);
        Assert.Null(_launcher.Launches[0].Credentials);

        _credentials = new OkxCredentials("key", "secret", "pass");
        _service.Reload();

        await WaitFor(status => status is { State: AtkState.Running, HasKey: true });
        Assert.Equal(_credentials, _launcher.Launches[1].Credentials);
    }

    [Fact]
    public async Task A_restart_waits_for_a_call_that_is_under_way_and_refuses_new_ones_meanwhile()
    {
        var server = new FakeMcpServer().On("tools/call", _ => null);
        _launcher.Returns(server);
        await StartAndWaitFor(AtkState.Running);

        var underWay = _service.CallAsync("market_get_ticker", "{}", Ct);
        await Eventually(() => server.RequestsOf("tools/call").Any());
        _service.Reload();
        await Eventually(() => !_service.IsAccepting);

        var refused = await _service.CallAsync("market_get_candles", "{}", Ct);
        Assert.Contains("starting or restarting", refused.Content, StringComparison.Ordinal);
        // Still connected: the call under way has not been cut off.
        Assert.False(server.Disposed);
        Assert.False(underWay.IsCompleted);

        var id = server.RequestsOf("tools/call").Single().GetProperty("id").GetRawText();
        server.Push($$$"""{"jsonrpc":"2.0","id":{{{id}}},"result":{"content":[{"type":"text","text":"answered"}]}}""");

        Assert.Equal(new ToolOutcome("answered"), await underWay.WaitAsync(_patience, Ct));
        await WaitFor(status => status.State == AtkState.Running && _launcher.Launches.Count == 2);
        Assert.True(server.Disposed);
    }

    [Fact]
    public async Task Stopping_shuts_the_kit_down_and_takes_its_tools_away()
    {
        var server = new FakeMcpServer().Offers(("market_get_ticker", true));
        _launcher.Returns(server);
        await StartAndWaitFor(AtkState.Running);

        await _service.StopAsync(Ct);

        Assert.True(server.Disposed);
        Assert.Empty(_service.GetTools());
        Assert.Equal(AtkState.Stopped, _service.Status.State);
        Assert.False(_service.IsAccepting);
        // A change of mode after the stop starts nothing.
        _settings.SetValue(SettingKeys.OkxSandbox, false);
        await Task.Delay(TimeSpan.FromMilliseconds(200), Ct);
        Assert.Single(_launcher.Launches);
    }

    [Fact]
    public async Task Stopping_while_the_kit_is_not_installed_returns_at_once()
    {
        _launcher.IsNotInstalled();
        await StartAndWaitFor(AtkState.Unavailable);

        await _service.StopAsync(Ct).WaitAsync(_patience, Ct);

        Assert.Equal(AtkState.Stopped, _service.Status.State);
    }

    [Fact]
    public async Task Starting_twice_starts_one_kit()
    {
        await _service.StartAsync(Ct);
        await _service.StartAsync(Ct);
        await WaitFor(AtkState.Running);
        await Task.Delay(TimeSpan.FromMilliseconds(200), Ct);

        Assert.Single(_launcher.Launches);
    }

    [Fact]
    public async Task The_tool_host_shows_the_kits_tools_next_to_the_apps_own_while_the_kit_runs()
    {
        var server = new FakeMcpServer()
            .Offers(("market_get_ticker", true))
            .On("tools/call", _ => """{"content":[{"type":"text","text":"from the kit"}]}""");
        _launcher.Returns(server);
        var host = new ToolHost([new FakeTool("get_ticker", "from the app")], [], NullLogger<ToolHost>.Instance, sources: [_service]);

        Assert.Equal(["get_ticker"], host.Definitions.Select(definition => definition.Name));
        await StartAndWaitFor(AtkState.Running);
        Assert.Equal(["get_ticker", "okx_market_get_ticker"], host.Definitions.Select(definition => definition.Name));

        var outcome = await host.InvokeAsync(new("toolu_1", "okx_market_get_ticker", """{"instId":"BTC-USDT"}"""), _context, Ct);
        Assert.Equal("from the kit", outcome.Content);

        await _service.StopAsync(Ct);
        Assert.Equal(["get_ticker"], host.Definitions.Select(definition => definition.Name));
        var gone = await host.InvokeAsync(new("toolu_2", "okx_market_get_ticker", "{}"), _context, Ct);
        Assert.Equal(ToolCallStatus.Failed, gone.Status);
    }

    private async Task StartAndWaitFor(AtkState state)
    {
        await _service.StartAsync(Ct);
        await WaitFor(state);
    }

    private Task WaitFor(AtkState state) => WaitFor(status => status.State == state);

    private async Task WaitFor(Func<AtkStatus, bool> reached)
    {
        var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        void Check(object? sender, EventArgs e)
        {
            if (reached(_service.Status))
            {
                done.TrySetResult();
            }
        }

        _service.StatusChanged += Check;
        try
        {
            Check(null, EventArgs.Empty);
            await done.Task.WaitAsync(_patience, Ct);
        }
        catch (TimeoutException)
        {
            Assert.Fail($"The trade kit service did not reach the expected state; it is {_service.Status}.");
        }
        finally
        {
            _service.StatusChanged -= Check;
        }
    }

    private static async Task Eventually(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow + _patience;
        while (!condition())
        {
            Assert.True(DateTime.UtcNow < deadline, "The expected condition was not reached in time.");
            await Task.Delay(TimeSpan.FromMilliseconds(10), Ct);
        }
    }
}
