using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Cli;
using TradingAgent.Agent.Mcp;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Shell;
using Xunit;

namespace TradingAgent.Agent.Tests;

/// <summary>The lines here have the shape of what Claude Code 2.1.330 really wrote, cut down to the fields that are read.</summary>
public sealed class CliOutputTests
{
    [Fact]
    public void The_first_line_tells_the_conversation_the_model_the_tools_and_the_tool_servers()
    {
        var init = Assert.IsType<CliInit>(Assert.Single(CliOutput.Parse(
            """{"type":"system","subtype":"init","cwd":"C:\\work","session_id":"0b3f8a52-5e0c-4a57-9f4e-0d3a6a1a2b3c","tools":["mcp__trading__get_ticker","mcp__trading__okx_spot_place_order"],"mcp_servers":[{"name":"trading","status":"connected"}],"model":"claude-haiku-5-5","permissionMode":"dontAsk","slash_commands":["help"],"plugins":[{"name":"cc-plugin-privacy"}]}""")));

        Assert.Equal("0b3f8a52-5e0c-4a57-9f4e-0d3a6a1a2b3c", init.SessionId);
        Assert.Equal("claude-haiku-5-5", init.Model);
        Assert.Equal(["mcp__trading__get_ticker", "mcp__trading__okx_spot_place_order"], init.Tools);
        Assert.Equal([new CliServer("trading", "connected")], init.Servers);
    }

    [Fact]
    public void Text_and_thinking_arrive_in_pieces()
    {
        Assert.Equal(
            [new CliTextDelta("OK")],
            CliOutput.Parse("""{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"OK"}},"session_id":"s","uuid":"u"}"""));
        Assert.Equal(
            [new CliThinkingDelta("Let me see")],
            CliOutput.Parse("""{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me see"}}}"""));
        Assert.Equal([new CliMessageStart()], CliOutput.Parse("""{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_1"}}}"""));
    }

    [Fact]
    public void A_finished_message_gives_its_text_and_its_tool_calls_in_order()
    {
        var events = CliOutput.Parse(
            """{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"hm","signature":"x"},{"type":"text","text":"Looking it up."},{"type":"tool_use","id":"toolu_01","name":"mcp__trading__get_ticker","input":{"symbol":"BTC-USDT"}}]}}""");

        Assert.Equal([new CliText("Looking it up."), new CliToolUse("toolu_01", "mcp__trading__get_ticker")], events);
    }

    [Fact]
    public void The_last_line_of_a_good_run_carries_the_answer_and_every_token_read()
    {
        var result = Assert.IsType<CliResult>(Assert.Single(CliOutput.Parse(
            """{"type":"result","subtype":"success","is_error":false,"result":"OK","session_id":"s","num_turns":1,"total_cost_usd":0.001,"usage":{"input_tokens":12,"cache_creation_input_tokens":300,"cache_read_input_tokens":4000,"output_tokens":5,"service_tier":"standard"}}""")));

        Assert.Equal(new CliResult(false, "success", "OK", 4312, 5), result);
    }

    [Theory]
    [InlineData("""{"type":"result","subtype":"error_max_turns","is_error":true,"session_id":"s"}""", "error_max_turns", "")]
    [InlineData("""{"type":"result","subtype":"error_during_execution","is_error":true,"result":"API Error: 529"}""", "error_during_execution", "API Error: 529")]
    // A subtype that is not "success" is a failure even without the flag.
    [InlineData("""{"type":"result","subtype":"error_during_execution","is_error":false}""", "error_during_execution", "")]
    public void The_last_line_of_a_failed_run_says_how_it_failed(string line, string subtype, string text)
    {
        var result = Assert.IsType<CliResult>(Assert.Single(CliOutput.Parse(line)));

        Assert.True(result.IsError);
        Assert.Equal((subtype, text), (result.Subtype, result.Text));
    }

    [Fact]
    public void A_retry_names_its_reason()
    {
        Assert.Equal(
            [new CliRetry("authentication_failed")],
            CliOutput.Parse("""{"type":"system","subtype":"api_retry","attempt":1,"max_retries":10,"error":"authentication_failed"}"""));
    }

    [Theory]
    [InlineData("""{"type":"system","subtype":"status","status":"requesting","session_id":"s"}""")]
    [InlineData("""{"type":"system","subtype":"hook_response","hook_name":"SessionStart","stdout":"x"}""")]
    [InlineData("""{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}""")]
    [InlineData("""{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01","content":"97000"}]}}""")]
    [InlineData("""{"type":"stream_event","event":{"type":"content_block_stop","index":0}}""")]
    [InlineData("""{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\"a\""}}}""")]
    [InlineData("""{"type":"something_new","payload":1}""")]
    [InlineData("""{"no_type":true}""")]
    [InlineData("[1,2,3]")]
    [InlineData("\"text\"")]
    [InlineData("not json")]
    [InlineData("")]
    [InlineData("   ")]
    public void A_line_the_app_has_no_use_for_gives_nothing_and_does_not_throw(string line)
    {
        Assert.Empty(CliOutput.Parse(line));
    }

    [Theory]
    [InlineData("""{"loggedIn":true,"authMethod":"claude.ai","email":"someone@example.com","orgName":"x"}""", true, "claude.ai")]
    [InlineData("""{"loggedIn":true}""", true, null)]
    [InlineData("""{"loggedIn":false,"authMethod":"none"}""", false, null)]
    [InlineData("""{"authMethod":"claude.ai"}""", false, null)]
    [InlineData("""["loggedIn"]""", false, null)]
    [InlineData("Not logged in", false, null)]
    [InlineData("", false, null)]
    public void Of_the_sign_in_answer_only_two_fields_are_read(string output, bool signedIn, string? method)
    {
        Assert.Equal((signedIn, method), ClaudeCli.ParseStatus(output));
    }
}

public sealed class McpToolServerTests
{
    private static readonly ToolDefinition _ticker = new("get_ticker", "Reads a price.", """{"type":"object","properties":{"symbol":{"type":"string"}}}""");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_client_can_open_a_session_list_the_tools_and_call_one()
    {
        var calls = new List<McpToolCall>();
        await using var harness = Start((call, _) =>
        {
            calls.Add(call);
            return Task.FromResult(new ToolOutcome("97000"));
        });

        var name = await harness.Client.InitializeAsync("claude-code", "2.1.330", Ct);
        var tool = Assert.Single(await harness.Client.ListToolsAsync(Ct));
        var result = await harness.Client.CallToolAsync("get_ticker", """{"symbol":"BTC-USDT"}""", Ct);

        Assert.Equal("trading 1.2.3", name);
        Assert.Equal(("get_ticker", "Reads a price."), (tool.Name, tool.Description));
        Assert.Equal(_ticker.InputSchemaJson, tool.InputSchemaJson);
        Assert.Equal(("97000", false), (result.Text, result.IsError));
        var call = Assert.Single(calls);
        Assert.Equal(("get_ticker", """{"symbol":"BTC-USDT"}""", null), (call.Name, call.Arguments.GetRawText(), call.ToolUseId));
    }

    [Theory]
    [InlineData(Core.Agent.ToolCallStatus.Failed)]
    [InlineData(Core.Agent.ToolCallStatus.Denied)]
    public async Task A_failed_or_refused_call_is_marked_as_an_error_for_the_model(Core.Agent.ToolCallStatus status)
    {
        await using var harness = Start((_, _) => Task.FromResult(new ToolOutcome("Risk check: AVOID", status)));

        var result = await harness.Client.CallToolAsync("get_ticker", "{}", Ct);

        Assert.Equal(("Risk check: AVOID", true), (result.Text, result.IsError));
    }

    [Fact]
    public async Task A_tool_that_throws_is_answered_as_failed_without_the_inner_message()
    {
        await using var harness = Start((_, _) => throw new InvalidOperationException("connection string leaked"));

        var result = await harness.Client.CallToolAsync("get_ticker", "{}", Ct);

        Assert.True(result.IsError);
        Assert.DoesNotContain("connection string", result.Text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Calls_made_at_once_run_side_by_side_and_each_gets_its_own_answer()
    {
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var running = 0;
        await using var harness = Start(async (call, token) =>
        {
            if (Interlocked.Increment(ref running) == 3)
            {
                gate.SetResult();
            }

            // Returns only when all three are in: one after the other they would never meet.
            await gate.Task.WaitAsync(TimeSpan.FromSeconds(10), token);
            return new ToolOutcome(call.Arguments.GetProperty("n").GetRawText());
        });

        var results = await Task.WhenAll(Enumerable.Range(1, 3).Select(n => harness.Client.CallToolAsync("get_ticker", $$"""{"n":{{n}}}""", Ct)));

        Assert.Equal(["1", "2", "3"], results.Select(result => result.Text));
    }

    [Fact]
    public async Task Requests_the_server_does_not_serve_are_refused_and_notifications_get_no_answer()
    {
        await using var harness = Start((_, _) => Task.FromResult(new ToolOutcome("x")), raw: true);

        await harness.Raw.SendAsync("""{"jsonrpc":"2.0","method":"notifications/initialized"}""", Ct);
        await harness.Raw.SendAsync("""{"jsonrpc":"2.0","id":"a","method":"resources/list"}""", Ct);
        await harness.Raw.SendAsync("""{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"arguments":{}}}""", Ct);
        await harness.Raw.SendAsync("""{"jsonrpc":"2.0","id":3,"method":"ping"}""", Ct);
        await harness.Raw.SendAsync("this is not json", Ct);
        await harness.Raw.SendAsync("""{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_ticker","arguments":"not an object","_meta":{"claudecode/toolUseId":"toolu_9"}}}""", Ct);

        var replies = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        for (var index = 0; index < 4; index++)
        {
            using var document = JsonDocument.Parse((await harness.Raw.ReceiveAsync(Ct))!);
            replies[document.RootElement.GetProperty("id").GetRawText()] = document.RootElement.Clone();
        }

        Assert.Equal(-32601, replies["\"a\""].GetProperty("error").GetProperty("code").GetInt32());
        Assert.Equal(-32602, replies["2"].GetProperty("error").GetProperty("code").GetInt32());
        Assert.Equal(JsonValueKind.Object, replies["3"].GetProperty("result").ValueKind);
        // Arguments that are not an object are replaced by none; the id of the model's call is passed on.
        Assert.Equal("{}|toolu_9", replies["4"].GetProperty("result").GetProperty("content")[0].GetProperty("text").GetString());
    }

    /// <param name="callTool">Runs a call. An outcome of "x" is replaced by the call's arguments and id, so a test can see what arrived.</param>
    /// <param name="raw">True when the test writes and reads the protocol lines itself, with no client on the connection.</param>
    private static Harness Start(Func<McpToolCall, CancellationToken, Task<ToolOutcome>> callTool, bool raw = false)
    {
        var (clientSide, serverSide) = DuplexTransport.CreatePair();
        var server = new McpToolServer(
            () => [_ticker],
            async (call, token) =>
            {
                var outcome = await callTool(call, token);
                return outcome.Content == "x" ? new ToolOutcome($"{call.Arguments.GetRawText()}|{call.ToolUseId}") : outcome;
            },
            "trading",
            "1.2.3",
            NullLogger.Instance);
        var stopping = new CancellationTokenSource();
        var serving = server.ServeAsync(serverSide, stopping.Token);
        return new Harness(clientSide, raw ? null : new McpClient(clientSide, NullLogger.Instance, TimeSpan.FromSeconds(10)), stopping, serving);
    }

    private sealed class Harness(DuplexTransport connection, McpClient? client, CancellationTokenSource stopping, Task serving) : IAsyncDisposable
    {
        public McpClient Client => client ?? throw new InvalidOperationException("This connection is used raw.");

        public DuplexTransport Raw => connection;

        public async ValueTask DisposeAsync()
        {
            await stopping.CancelAsync();
            if (client is not null)
            {
                await client.DisposeAsync();
            }

            await connection.DisposeAsync();
            await serving.WaitAsync(TimeSpan.FromSeconds(10));
            stopping.Dispose();
        }
    }
}

public sealed class StdioPipeBridgeTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData(new[] { "--mcp-bridge", "tradingagent-bridge-abc" }, true)]
    [InlineData(new[] { "--mcp-bridge" }, false)]
    [InlineData(new[] { "--mcp-bridge", "" }, false)]
    [InlineData(new[] { "--mcp-bridge", "a", "b" }, false)]
    [InlineData(new[] { "--MCP-BRIDGE", "a" }, false)]
    [InlineData(new[] { "--veloapp-install", "1.0.0" }, false)]
    [InlineData(new string[0], false)]
    public void Bridge_mode_is_asked_for_by_exactly_two_arguments(string[] arguments, bool expected)
    {
        Assert.Equal(expected, StdioPipeBridge.IsRequested(arguments));
    }

    [Fact]
    public async Task What_claude_code_writes_reaches_the_apps_tools_and_the_answer_comes_back()
    {
        var server = new McpToolServer(
            () => [],
            (_, _) => Task.FromResult(new ToolOutcome("97000")),
            "trading",
            "1.2.3",
            NullLogger.Instance);
        await using var endpoint = BridgeEndpoint.Start(server, NullLogger.Instance);
        // The two ends of the bridge exe's standard streams.
        await using var toBridge = new AnonymousPipeServerStream(PipeDirection.Out);
        await using var bridgeInput = new AnonymousPipeClientStream(PipeDirection.In, toBridge.ClientSafePipeHandle);
        await using var fromBridge = new AnonymousPipeServerStream(PipeDirection.In);
        await using var bridgeOutput = new AnonymousPipeClientStream(PipeDirection.Out, fromBridge.ClientSafePipeHandle);

        var bridge = StdioPipeBridge.RunAsync(endpoint.PipeName, endpoint.Token, bridgeInput, bridgeOutput, TimeSpan.FromSeconds(10), Ct);
        await toBridge.WriteAsync(Encoding.UTF8.GetBytes("""{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_ticker","arguments":{}}}""" + "\n"), Ct);
        await toBridge.FlushAsync(Ct);
        using var reader = new StreamReader(fromBridge, Encoding.UTF8);
        var reply = await reader.ReadLineAsync(Ct).AsTask().WaitAsync(TimeSpan.FromSeconds(10), Ct);

        Assert.Contains("97000", reply, StringComparison.Ordinal);
        Assert.Equal(1, endpoint.AcceptedConnections);

        // Claude Code closing its end ends the bridge.
        await toBridge.DisposeAsync();
        Assert.Equal(0, await bridge.WaitAsync(TimeSpan.FromSeconds(10), Ct));
    }

    [Fact]
    public async Task With_the_wrong_token_nothing_is_served_and_the_bridge_ends()
    {
        var called = false;
        var server = new McpToolServer(
            () => [],
            (_, _) =>
            {
                called = true;
                return Task.FromResult(new ToolOutcome("97000"));
            },
            "trading",
            "1.2.3",
            NullLogger.Instance);
        await using var endpoint = BridgeEndpoint.Start(server, NullLogger.Instance);
        await using var toBridge = new AnonymousPipeServerStream(PipeDirection.Out);
        await using var bridgeInput = new AnonymousPipeClientStream(PipeDirection.In, toBridge.ClientSafePipeHandle);
        using var output = new MemoryStream();

        var bridge = StdioPipeBridge.RunAsync(endpoint.PipeName, new string('f', 64), bridgeInput, output, TimeSpan.FromSeconds(10), Ct);
        await toBridge.WriteAsync(Encoding.UTF8.GetBytes("""{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_ticker","arguments":{}}}""" + "\n"), Ct);
        await toBridge.FlushAsync(Ct);

        // The app closes the connection; the bridge sees that and ends by itself.
        Assert.Equal(0, await bridge.WaitAsync(TimeSpan.FromSeconds(10), Ct));
        Assert.False(called);
        Assert.Equal(0, output.Length);
        Assert.Equal(0, endpoint.AcceptedConnections);
    }

    [Fact]
    public async Task Without_a_running_app_the_bridge_gives_up()
    {
        using var input = new MemoryStream();
        using var output = new MemoryStream();

        var code = await StdioPipeBridge.RunAsync("tradingagent-bridge-nobody-listens", "token", input, output, TimeSpan.FromMilliseconds(200), Ct);

        Assert.Equal(1, code);
    }

    [Fact]
    public async Task Each_run_gets_a_pipe_and_a_token_of_its_own()
    {
        var server = new McpToolServer(() => [], (_, _) => Task.FromResult(new ToolOutcome("x")), "trading", "1.2.3", NullLogger.Instance);
        await using var first = BridgeEndpoint.Start(server, NullLogger.Instance);
        await using var second = BridgeEndpoint.Start(server, NullLogger.Instance);

        Assert.NotEqual(first.PipeName, second.PipeName);
        Assert.NotEqual(first.Token, second.Token);
        Assert.Equal(64, first.Token.Length);
        Assert.StartsWith("tradingagent-bridge-", first.PipeName, StringComparison.Ordinal);
    }
}

/// <summary>Two ends of a connection in memory: what one sends, the other receives.</summary>
internal sealed class DuplexTransport : IMcpTransport
{
    private readonly ChannelReader<string> _incoming;
    private readonly ChannelWriter<string> _outgoing;

    private DuplexTransport(ChannelReader<string> incoming, ChannelWriter<string> outgoing)
    {
        _incoming = incoming;
        _outgoing = outgoing;
    }

    public static (DuplexTransport Client, DuplexTransport Server) CreatePair()
    {
        var toServer = Channel.CreateUnbounded<string>();
        var toClient = Channel.CreateUnbounded<string>();
        return (new DuplexTransport(toClient.Reader, toServer.Writer), new DuplexTransport(toServer.Reader, toClient.Writer));
    }

    public Task SendAsync(string message, CancellationToken cancellationToken)
    {
        if (!_outgoing.TryWrite(message))
        {
            throw new IOException("The other side is closed.");
        }

        return Task.CompletedTask;
    }

    public async Task<string?> ReceiveAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await _incoming.ReadAsync(cancellationToken);
        }
        catch (ChannelClosedException)
        {
            return null;
        }
    }

    public ValueTask DisposeAsync()
    {
        _outgoing.TryComplete();
        return ValueTask.CompletedTask;
    }
}
