using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Tools;
using TradingAgent.Core;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Data.Agent;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Okx;
using TradingAgent.Exchange.Risk;
using Xunit;

namespace TradingAgent.Agent.Tests;

/// <summary>
/// Starts the real OKX trade kit (through <c>npx</c>, or an installed copy) and talks to it. Skipped
/// unless the environment variable <c>TRADINGAGENT_LIVE_TESTS</c> is <c>1</c>, so an ordinary test run
/// and CI need neither Node nor the network.
/// </summary>
/// <remarks>
/// No real key is used. Where a test needs the kit to believe it has one, it gets a made-up one and
/// only tools that do not call the exchange with it are used. The kit runs in a throwaway home folder.
/// </remarks>
public sealed class LiveAtkTests : IAsyncDisposable
{
    private const string MadeUpKey = "live-test-not-a-real-key";

    private static readonly TimeSpan _patience = TimeSpan.FromMinutes(3);

    private readonly string _home = Path.Combine(Path.GetTempPath(), "trading-agent-tests", "kit-" + Guid.NewGuid().ToString("N"));
    private readonly FakeSettings _settings = new();
    private AtkService? _service;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask DisposeAsync()
    {
        if (_service is not null)
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            await _service.StopAsync(deadline.Token);
        }

        try
        {
            Directory.Delete(_home, recursive: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // The kit may still hold a file for a moment; a leftover temp folder is harmless.
        }
    }

    [Fact]
    public async Task The_real_kit_offers_every_tool_of_the_inventory_the_agent_may_use()
    {
        SkipUnlessLive();

        var service = await StartAsync(credentials: null);

        var expected = AtkToolCatalog.Names
            .Where(name => AtkToolCatalog.Kind(name) == AtkToolKind.Read || AtkToolCatalog.IsSupportedWrite(name))
            .Select(AtkToolCatalog.ModelName)
            .Order(StringComparer.Ordinal);
        Assert.Equal(expected, service.GetTools().Select(tool => tool.Definition.Name).Order(StringComparer.Ordinal));
        Assert.All(service.GetTools(), tool =>
        {
            Assert.NotEmpty(tool.Definition.Description);
            Assert.Equal("object", JsonDocument.Parse(tool.Definition.InputSchemaJson).RootElement.GetProperty("type").GetString());
        });
    }

    [Fact]
    public async Task The_real_kit_reads_public_market_data_without_a_key_and_says_so_when_one_is_needed()
    {
        SkipUnlessLive();
        var service = await StartAsync(credentials: null);

        var ticker = await CallAsync(service, "market_get_ticker", """{"instId":"BTC-USDT"}""");
        var balance = await CallAsync(service, "account_get_balance", "{}");
        var capabilities = await CapabilitiesAsync(service);

        Assert.Equal(ToolCallStatus.Succeeded, ticker.Status);
        Assert.Contains("BTC-USDT", ticker.Content, StringComparison.Ordinal);
        Assert.Equal(ToolCallStatus.Failed, balance.Status);
        Assert.Contains("No OKX API key is saved in this app", balance.Content, StringComparison.Ordinal);
        Assert.False(capabilities.GetProperty("hasAuth").GetBoolean());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task The_real_kit_takes_the_key_from_its_environment_and_the_mode_from_its_arguments(bool sandbox)
    {
        SkipUnlessLive();
        _settings.SetValue(SettingKeys.OkxSandbox, sandbox);

        var service = await StartAsync(new OkxCredentials(MadeUpKey, MadeUpKey, MadeUpKey));
        var capabilities = await CapabilitiesAsync(service);

        Assert.True(capabilities.GetProperty("hasAuth").GetBoolean());
        Assert.Equal(sandbox, capabilities.GetProperty("demo").GetBoolean());
        Assert.False(capabilities.GetProperty("readOnly").GetBoolean());
        // The kit keeps files in its home folder; the key must be in none of them, and it must
        // not have made itself a config file or a log.
        var files = Directory.EnumerateFiles(_home, "*", SearchOption.AllDirectories).ToList();
        Assert.DoesNotContain(files, file => Path.GetFileName(file) == "config.toml");
        Assert.DoesNotContain(files, file => file.Contains("logs", StringComparison.OrdinalIgnoreCase));
        Assert.All(files.Where(file => new FileInfo(file).Length < 1_000_000), file =>
            Assert.DoesNotContain(MadeUpKey, File.ReadAllText(file), StringComparison.Ordinal));
    }

    [Fact]
    public async Task The_real_kit_refuses_to_place_an_order_when_asked_behind_the_services_back()
    {
        SkipUnlessLive();
        var launcher = NewLauncher();
        await using var client = new Mcp.McpClient(
            await launcher.LaunchAsync(new AtkLaunchOptions(Sandbox: true, AtkToolCatalog.DefaultModules, ReadOnly: true, Credentials: null), Ct),
            NullLogger.Instance,
            _patience);
        await client.InitializeAsync("trading-agent-tests", "0", Ct);

        // What the service's own refusal stands in front of: the kit, started read-only, has no such tool.
        var offered = await client.ListToolsAsync(Ct);
        Mcp.McpCallResult? result = null;
        var refusal = await Record.ExceptionAsync(async () => result = await client.CallToolAsync(
            "spot_place_order",
            """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"1"}""",
            Ct));

        Assert.DoesNotContain(offered, tool => tool.ReadOnly == false);
        Assert.DoesNotContain(offered, tool => tool.Name == "spot_place_order");
        // Refused as a protocol error or as a failed result, depending on the kit; never carried out.
        Assert.True(refusal is Mcp.McpException || result is { IsError: true });
    }

    [Theory]
    [InlineData("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"10"}""")]
    [InlineData("swap_place_order", """{"instId":"BTC-USDT-SWAP","tdMode":"cross","side":"buy","ordType":"market","sz":"1"}""")]
    public async Task The_real_gate_reads_the_real_market_and_refuses_an_order_it_cannot_measure_against_an_account(string tool, string input)
    {
        SkipUnlessLive();
        // The real gate over the real exchange, without a key: the price and the contract are
        // read from OKX, the balance cannot be, so the order is refused and the kit is not asked.
        using var temp = new TempDatabase();
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        var okx = new OkxClient(http, () => null, () => true, TimeProvider.System, NullLogger<OkxClient>.Instance);
        var orders = new OrderStubRepository(temp.Database, TimeProvider.System);
        var gate = new RiskGate(okx, new RiskManager(okx, _settings), _settings, orders, TimeProvider.System, NullLogger<RiskGate>.Instance);
        var session = new AgentSessionRepository(temp.Database, TimeProvider.System).Create();
        var message = new SessionMessageRepository(temp.Database, TimeProvider.System).Append(session.Id, MessageRole.Assistant, string.Empty, MessageStatus.Running);
        var context = new ToolContext(session.Id, message.Id, "toolu_live");
        var service = await StartAsync(credentials: null, gate);
        using var document = JsonDocument.Parse(input);

        var outcome = await service.CallAsync(tool, document.RootElement.Clone(), context, Ct);

        Assert.Equal(ToolCallStatus.Denied, outcome.Status);
        // Not "the price or the contract could not be read": those two steps worked.
        Assert.StartsWith("The account could not be read from OKX", outcome.Content, StringComparison.Ordinal);
        Assert.False(orders.ExistsForToolCall(session.Id, "toolu_live"));
    }

    private static void SkipUnlessLive() =>
        Assert.SkipUnless(
            Environment.GetEnvironmentVariable("TRADINGAGENT_LIVE_TESTS") == "1",
            "Set TRADINGAGENT_LIVE_TESTS=1 to start the real OKX trade kit.");

    private static async Task<JsonElement> CapabilitiesAsync(AtkService service)
    {
        var outcome = await CallAsync(service, "system_get_capabilities", "{}");
        Assert.Equal(ToolCallStatus.Succeeded, outcome.Status);
        using var document = JsonDocument.Parse(outcome.Content);
        return document.RootElement.GetProperty("data").GetProperty("capabilities").Clone();
    }

    private static async Task<ToolOutcome> CallAsync(AtkService service, string tool, string json)
    {
        using var document = JsonDocument.Parse(json);
        return await service.CallAsync(tool, document.RootElement.Clone(), new ToolContext("session", "message", "toolu_live"), Ct);
    }

    private AtkProcessLauncher NewLauncher() =>
        new(AppContext.BaseDirectory, isDevelopmentBuild: true, _home, new NoJob(), NullLogger<AtkProcessLauncher>.Instance);

    private async Task<AtkService> StartAsync(OkxCredentials? credentials, IAtkGate? gate = null)
    {
        _service = new AtkService(
            NewLauncher(),
            gate ?? new FakeGate { Decide = (_, _) => GateDecision.Deny("The live tests place no orders.") },
            () => credentials,
            _settings,
            new AppInfo("0.0.0-test", IsDevelopmentBuild: true),
            TimeProvider.System,
            NullLogger<AtkService>.Instance);
        var running = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _service.StatusChanged += (_, _) =>
        {
            if (_service.Status.State == AtkState.Running)
            {
                running.TrySetResult();
            }
            else if (_service.Status.State is AtkState.Unavailable or AtkState.Failed)
            {
                running.TrySetException(new InvalidOperationException($"The trade kit did not start: {_service.Status.Detail}"));
            }
        };
        await _service.StartAsync(Ct);
        // The first start may download the package.
        await running.Task.WaitAsync(_patience, Ct);
        return _service;
    }

    /// <summary>The test ends the kit itself by disposing the service.</summary>
    private sealed class NoJob : IChildProcessJob
    {
        public void Add(Process process)
        {
        }
    }
}
