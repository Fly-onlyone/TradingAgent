using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Cli;
using TradingAgent.Agent.Mcp;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.Core;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Shell;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class ClaudeCliRuntimeTests : IDisposable
{
    private const string CliPath = @"C:\fake\claude.exe";
    private const string BridgeExe = @"C:\app\TradingAgent.exe";

    private readonly AgentStore _store = new();
    private readonly FakeCliLauncher _launcher = new();
    private readonly string _work = Path.Combine(Path.GetTempPath(), "trading-agent-tests", "cli-" + Guid.NewGuid().ToString("N"));
    private readonly FakeTool _ticker = new("get_ticker", "97000");
    private readonly ClaudeCli _cli;
    private string? _cliPath = CliPath;

    public ClaudeCliRuntimeTests()
    {
        _cli = new ClaudeCli(_launcher, _work, TimeProvider.System, NullLogger<ClaudeCli>.Instance) { Locate = () => _cliPath };
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose()
    {
        _store.Dispose();
        try
        {
            Directory.Delete(_work, recursive: true);
        }
        catch (IOException)
        {
            // A leftover temp folder is harmless.
        }
    }

    // ---- an answer ----

    [Fact]
    public async Task The_answer_is_recorded_as_it_streams_and_the_conversation_id_is_kept()
    {
        _launcher.Plays(run =>
        {
            run.Init("mcp__trading__get_ticker");
            run.MessageStart();
            run.Delta("Bitcoin is at ");
            run.Delta("97,000.");
            run.AssistantText("Bitcoin is at 97,000.");
            run.Success("Bitcoin is at 97,000.", input: 120, output: 30);
            return Task.CompletedTask;
        });

        var (outcome, reply, session) = await RunAsync("Price of BTC?");

        Assert.Equal(RunOutcome.Complete, outcome);
        // The whole text arrives again after its pieces; it is recorded once.
        Assert.Equal("Bitcoin is at 97,000.", reply.Content);
        Assert.Equal(120, reply.InputTokens);
        Assert.Equal(30, reply.OutputTokens);
        Assert.Equal("claude-sonnet-5-5", reply.Model);
        var run = Assert.Single(_launcher.Runs);
        Assert.Equal(run.Arg("--session-id"), session.SdkSessionId);
        Assert.True(Guid.TryParse(session.SdkSessionId, out _));
        Assert.Empty(_launcher.ScriptFailures);
    }

    [Fact]
    public async Task Text_that_comes_only_as_a_whole_is_recorded_too()
    {
        _launcher.Plays(run =>
        {
            run.Init();
            run.MessageStart();
            run.AssistantText("No pieces this time.");
            run.Success("No pieces this time.");
            return Task.CompletedTask;
        });

        var (_, reply, _) = await RunAsync("Hello");

        Assert.Equal("No pieces this time.", reply.Content);
    }

    [Fact]
    public async Task An_answer_that_is_only_in_the_last_line_is_not_lost()
    {
        _launcher.Plays(run =>
        {
            run.Init();
            run.Success("Short answer.");
            return Task.CompletedTask;
        });

        var (outcome, reply, _) = await RunAsync("Hello");

        Assert.Equal(RunOutcome.Complete, outcome);
        Assert.Equal("Short answer.", reply.Content);
    }

    // ---- how Claude Code is started ----

    [Fact]
    public async Task Claude_code_is_started_with_its_own_tools_off_and_only_this_app_as_tool_server()
    {
        string? config = null;
        string? prompt = null;
        _launcher.Plays(async run =>
        {
            config = await File.ReadAllTextAsync(run.Arg("--mcp-config")!);
            prompt = await File.ReadAllTextAsync(run.Arg("--system-prompt-file")!);
            run.Init();
            run.Success("ok");
        });

        await RunAsync("Hello");

        var start = _launcher.Starts.Single(started => started.Arguments is not ["auth", "status"]);
        Assert.Equal(CliPath, start.File);
        Assert.Equal(_work, start.Directory);
        var arguments = start.Arguments.ToList();
        Assert.Equal(string.Empty, arguments[arguments.IndexOf("--tools") + 1]);
        Assert.Equal("mcp__trading", arguments[arguments.IndexOf("--allowedTools") + 1]);
        Assert.Equal("dontAsk", arguments[arguments.IndexOf("--permission-mode") + 1]);
        Assert.Contains("--strict-mcp-config", arguments);
        Assert.Equal(string.Empty, arguments[arguments.IndexOf("--setting-sources") + 1]);
        // Tried against the real program: safe mode also drops the tool server of --mcp-config.
        Assert.DoesNotContain("--safe-mode", arguments);
        Assert.Contains("-p", arguments);
        Assert.Equal("stream-json", arguments[arguments.IndexOf("--input-format") + 1]);
        Assert.Equal("stream-json", arguments[arguments.IndexOf("--output-format") + 1]);
        Assert.Equal("claude-sonnet-5-5", arguments[arguments.IndexOf("--model") + 1]);
        Assert.Equal("high", arguments[arguments.IndexOf("--effort") + 1]);
        // Never: these would let the model act without the app's tools, or load the user's own setup.
        Assert.DoesNotContain("bypassPermissions", arguments);
        Assert.DoesNotContain("--dangerously-skip-permissions", arguments);
        Assert.DoesNotContain("--bare", arguments);
        Assert.DoesNotContain("--resume", arguments);

        Assert.Equal("You are a test.", prompt);
        using var document = JsonDocument.Parse(config!);
        var server = Assert.Single(document.RootElement.GetProperty("mcpServers").EnumerateObject());
        Assert.Equal("trading", server.Name);
        Assert.Equal(BridgeExe, server.Value.GetProperty("command").GetString());
        Assert.Equal(StdioPipeBridge.Argument, server.Value.GetProperty("args")[0].GetString());
        Assert.Equal(64, server.Value.GetProperty("env").GetProperty(StdioPipeBridge.TokenVariable).GetString()!.Length);
    }

    [Fact]
    public async Task The_prompt_is_one_line_of_json_and_then_the_input_is_closed()
    {
        _launcher.Plays(run =>
        {
            run.Init();
            run.Success("ok");
            return Task.CompletedTask;
        });

        await RunAsync("Line one\nLine \"two\"");

        var line = Assert.Single(_launcher.Runs[0].Process.Input);
        Assert.DoesNotContain('\n', line);
        using var document = JsonDocument.Parse(line);
        Assert.Equal("user", document.RootElement.GetProperty("type").GetString());
        Assert.Equal("Line one\nLine \"two\"", document.RootElement.GetProperty("message").GetProperty("content").GetString());
        Assert.True(_launcher.Runs[0].Process.InputClosed.IsCompleted);
    }

    [Fact]
    public async Task What_was_written_for_the_run_is_deleted_when_it_ends()
    {
        string? configFile = null;
        _launcher.Plays(run =>
        {
            configFile = run.Arg("--mcp-config");
            Assert.True(File.Exists(configFile));
            run.Init();
            run.Success("ok");
            return Task.CompletedTask;
        });

        await RunAsync("Hello");

        // The file held the run's token.
        Assert.False(File.Exists(configFile));
        Assert.False(Directory.Exists(Path.GetDirectoryName(configFile)));
        Assert.Empty(_launcher.ScriptFailures);
    }

    // ---- tools ----

    [Fact]
    public async Task A_tool_call_comes_through_the_bridge_into_the_tool_host_and_is_recorded_under_the_models_id()
    {
        _launcher.Plays(async run =>
        {
            run.Init("mcp__trading__get_ticker");
            run.MessageStart();
            run.ToolUse("toolu_abc", "mcp__trading__get_ticker");
            await using var bridge = await run.ConnectBridgeAsync();
            await bridge.InitializeAsync("claude-code", "2.1.330", Ct);
            var offered = await bridge.ListToolsAsync(Ct);
            Assert.Equal(["get_ticker"], offered.Select(tool => tool.Name));
            var result = await bridge.CallToolAsync("get_ticker", """{"symbol":"BTC-USDT"}""", Ct);
            Assert.Equal(("97000", false), (result.Text, result.IsError));
            run.MessageStart();
            run.Delta("It is 97,000.");
            run.Success("It is 97,000.");
        });

        var (outcome, reply, _) = await RunAsync("Price of BTC?");

        Assert.Empty(_launcher.ScriptFailures);
        Assert.Equal(RunOutcome.Complete, outcome);
        Assert.Equal("""{"symbol":"BTC-USDT"}""", Assert.Single(_ticker.Inputs));
        var call = Assert.Single(reply.ToolCalls);
        Assert.Equal(("toolu_abc", "get_ticker", ToolCallStatus.Succeeded), (call.ToolUseId, call.Name, call.Status));
        Assert.Equal("It is 97,000.", reply.Content);
    }

    [Fact]
    public async Task The_id_claude_code_sends_with_a_call_wins_over_guessing()
    {
        _launcher.Plays(async run =>
        {
            run.Init("mcp__trading__get_ticker");
            await using var bridge = await run.ConnectRawAsync();
            // Two calls of the same tool at once: only the id that travels with each call tells them apart.
            run.ToolUse("toolu_first", "mcp__trading__get_ticker");
            run.ToolUse("toolu_second", "mcp__trading__get_ticker");
            foreach (var (requestId, toolUseId) in new[] { (1, "toolu_second"), (2, "toolu_first") })
            {
                await bridge.SendAsync(
                    $$"""{"jsonrpc":"2.0","id":{{requestId}},"method":"tools/call","params":{"name":"get_ticker","arguments":{},"_meta":{"claudecode/toolUseId":"{{toolUseId}}"}""" + "}}",
                    Ct);
                Assert.Contains("97000", await bridge.ReceiveAsync(Ct), StringComparison.Ordinal);
            }

            run.Success("done");
        });

        var (_, reply, _) = await RunAsync("Twice");

        Assert.Empty(_launcher.ScriptFailures);
        Assert.Equal(["toolu_second", "toolu_first"], reply.ToolCalls.Select(call => call.ToolUseId));
    }

    [Fact]
    public async Task A_call_claude_code_never_announced_still_runs_under_an_id_of_its_own()
    {
        _launcher.Plays(async run =>
        {
            run.Init("mcp__trading__get_ticker");
            await using var bridge = await run.ConnectBridgeAsync();
            await bridge.InitializeAsync("claude-code", "2.1.330", Ct);
            await bridge.CallToolAsync("get_ticker", "{}", Ct);
            run.Success("done");
        });

        var (_, reply, _) = await RunAsync("Once");

        Assert.Empty(_launcher.ScriptFailures);
        Assert.StartsWith("cli_", Assert.Single(reply.ToolCalls).ToolUseId, StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_order_asked_for_through_claude_code_reaches_the_risk_gate_and_a_refusal_goes_back_as_a_failure()
    {
        var gate = new FakeGate { Decide = (_, _) => GateDecision.Deny("Risk check: AVOID (score 80).") };
        var kit = new FakeMcpServer().Offers(("spot_place_order", false)).On("tools/call", _ => """{"content":[{"type":"text","text":"ordId 42"}]}""");
        var service = await StartKitAsync(gate, kit);
        McpCallResult? refused = null;
        _launcher.Plays(async run =>
        {
            run.Init("mcp__trading__get_ticker", "mcp__trading__okx_spot_place_order");
            run.ToolUse("toolu_order", "mcp__trading__okx_spot_place_order");
            await using var bridge = await run.ConnectBridgeAsync();
            await bridge.InitializeAsync("claude-code", "2.1.330", Ct);
            refused = await bridge.CallToolAsync("okx_spot_place_order", """{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100000"}""", Ct);
            run.Success("The order was refused.");
        });

        var (_, reply, session) = await RunAsync("Buy a lot of BTC", sources: [service]);
        await service.StopAsync(Ct);

        Assert.Empty(_launcher.ScriptFailures);
        // The gate was asked, with the run it belongs to.
        var asked = Assert.Single(gate.Asked);
        Assert.Equal("spot_place_order", asked.Tool);
        Assert.Equal(new ToolContext(session.Id, reply.Id, "toolu_order"), asked.Context);
        // The kit was not.
        Assert.Empty(kit.RequestsOf("tools/call"));
        Assert.Equal(("Risk check: AVOID (score 80).", true), (refused!.Text, refused.IsError));
        Assert.Equal(ToolCallStatus.Denied, Assert.Single(reply.ToolCalls).Status);
    }

    [Fact]
    public async Task A_program_without_the_runs_token_gets_no_tools()
    {
        _launcher.Plays(async run =>
        {
            run.Init("mcp__trading__get_ticker");
            await using var intruder = await run.ConnectBridgeAsync(token: new string('0', 64));
            await Assert.ThrowsAsync<McpException>(() => intruder.CallToolAsync("get_ticker", "{}", Ct));
            run.Success("done");
        });

        var (_, reply, _) = await RunAsync("Hello");

        Assert.Empty(_launcher.ScriptFailures);
        Assert.Empty(_ticker.Inputs);
        Assert.Empty(reply.ToolCalls);
    }

    // ---- what Claude Code must not start with ----

    [Theory]
    [InlineData("Bash")]
    [InlineData("Read")]
    [InlineData("WebFetch")]
    [InlineData("mcp__github__create_issue")]
    [InlineData("mcp__tradingx__get_ticker")]
    public async Task A_run_is_stopped_when_claude_code_reports_a_tool_that_is_not_this_apps(string foreign)
    {
        FakeCliProcess? process = null;
        _launcher.Plays(async run =>
        {
            process = run.Process;
            run.Init("mcp__trading__get_ticker", foreign);
            await run.Process.WhenKilled.WaitAsync(TimeSpan.FromSeconds(10));
        });

        var (outcome, reply, _) = await RunAsync("Hello");

        Assert.Equal(MessageStatus.Failed, outcome.Status);
        Assert.Contains("tools of its own", outcome.Error, StringComparison.Ordinal);
        Assert.True(process!.Killed);
        Assert.Equal(string.Empty, reply.Content);
    }

    [Theory]
    [InlineData("""[{"name":"trading","status":"failed"}]""", "could not reach this app's tools")]
    // What --safe-mode does: the server is not loaded at all, and the model answers without tools.
    [InlineData("[]", "could not reach this app's tools")]
    [InlineData("""[{"name":"other","status":"connected"}]""", "could not reach this app's tools")]
    // What a reply that never arrives leaves behind: Claude Code gives up waiting and goes on.
    [InlineData("""[{"name":"trading","status":"pending"}]""", "could not reach this app's tools")]
    [InlineData("""[{"name":"trading","status":"connected"},{"name":"github","status":"connected"}]""", "tool servers that are not this app's")]
    public async Task A_run_is_stopped_when_claude_code_did_not_load_exactly_this_apps_tool_server(string servers, string because)
    {
        _launcher.Plays(async run =>
        {
            run.InitServers(servers, "mcp__trading__get_ticker");
            await run.Process.WhenKilled.WaitAsync(TimeSpan.FromSeconds(10));
        });

        var (outcome, _, _) = await RunAsync("Hello");

        Assert.Equal(MessageStatus.Failed, outcome.Status);
        Assert.Contains(because, outcome.Error, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_run_is_stopped_when_claude_code_is_connected_and_has_none_of_the_apps_tools()
    {
        _launcher.Plays(async run =>
        {
            run.InitServers("""[{"name":"trading","status":"connected"}]""");
            await run.Process.WhenKilled.WaitAsync(TimeSpan.FromSeconds(10));
        });

        var (outcome, _, _) = await RunAsync("Hello");

        Assert.Equal(MessageStatus.Failed, outcome.Status);
        Assert.Contains("could not reach this app's tools", outcome.Error, StringComparison.Ordinal);
    }

    // ---- not installed, not signed in ----

    [Fact]
    public async Task Without_claude_code_the_run_fails_with_what_to_do_and_nothing_is_started()
    {
        _cliPath = null;

        var (outcome, _, _) = await RunAsync("Hello");

        Assert.Equal(MessageStatus.Failed, outcome.Status);
        Assert.Contains("not installed", outcome.Error, StringComparison.Ordinal);
        Assert.Contains("API key", outcome.Error, StringComparison.Ordinal);
        Assert.Empty(_launcher.Starts);
    }

    [Theory]
    [InlineData("""{"loggedIn":false}""")]
    [InlineData("""{"loggedIn":"yes","authMethod":"claude.ai"}""")]
    [InlineData("Not logged in. Run claude auth login.")]
    [InlineData("")]
    public async Task Signed_out_the_run_fails_with_what_to_do_and_no_prompt_is_sent(string status)
    {
        _launcher.StatusOutput = status;

        var (outcome, _, _) = await RunAsync("Hello");

        Assert.Equal(MessageStatus.Failed, outcome.Status);
        Assert.Contains("claude auth login", outcome.Error, StringComparison.Ordinal);
        Assert.Empty(_launcher.Runs);
    }

    [Fact]
    public async Task The_sign_in_question_is_not_asked_before_every_run()
    {
        _launcher.Plays(Answer("one")).Plays(Answer("two"));

        await RunAsync("First");
        await RunAsync("Second");

        Assert.Equal(1, _launcher.StatusQuestions);
        Assert.Equal(2, _launcher.Runs.Count);
    }

    [Fact]
    public async Task A_run_that_fails_to_sign_in_says_so_and_the_question_is_asked_again_next_time()
    {
        _launcher.Plays(run =>
        {
            run.Init();
            run.Process.Emit("""{"type":"system","subtype":"api_retry","error":"authentication_failed","attempt":1}""");
            run.Error("error_during_execution", "API Error: 401");
            return Task.CompletedTask;
        });
        _launcher.Plays(Answer("back"));

        var (outcome, _, _) = await RunAsync("First");
        await RunAsync("Second");

        Assert.Contains("claude auth login", outcome.Error, StringComparison.Ordinal);
        Assert.Equal(2, _launcher.StatusQuestions);
    }

    [Fact]
    public async Task Nothing_of_the_account_is_kept_from_the_sign_in_answer()
    {
        var status = await _cli.GetStatusAsync(Ct);

        Assert.Equal(new CliStatus(CliState.SignedIn, CliPath, "claude.ai"), status);
        Assert.DoesNotContain("someone@example.com", status.ToString(), StringComparison.Ordinal);
        Assert.Null(status.Problem);
    }

    // ---- resuming ----

    [Fact]
    public async Task The_second_run_of_a_session_resumes_the_conversation_and_sends_only_the_new_words()
    {
        _launcher.Plays(Answer("one")).Plays(Answer("two"));
        var session = _store.Sessions.Create();

        await RunAsync("First", session);
        var first = _store.Sessions.Get(session.Id)!.SdkSessionId;
        await RunAsync("Second", session, earlier: [Message(session.Id, MessageRole.User, "First"), Message(session.Id, MessageRole.Assistant, "one")]);

        var second = _launcher.Runs[1];
        Assert.Equal(first, second.Arg("--resume"));
        Assert.Null(second.Arg("--session-id"));
        Assert.Equal("Second", Content(second));
        Assert.Equal(first, _store.Sessions.Get(session.Id)!.SdkSessionId);
    }

    [Fact]
    public async Task A_conversation_claude_code_no_longer_has_is_started_again_with_what_the_chat_shows()
    {
        var session = _store.Sessions.Create();
        _store.Sessions.SetSdkSessionId(session.Id, "11111111-2222-3333-4444-555555555555");
        _launcher.Plays(run =>
        {
            run.Error("error_during_execution", "No conversation found with session ID: 11111111-2222-3333-4444-555555555555");
            return Task.CompletedTask;
        });
        _launcher.Plays(Answer("Here again."));

        var (outcome, reply, _) = await RunAsync(
            "And now?",
            session,
            earlier: [Message(session.Id, MessageRole.User, "Price of BTC?"), Message(session.Id, MessageRole.Assistant, "97,000.")]);

        Assert.Equal(RunOutcome.Complete, outcome);
        Assert.Equal("Here again.", reply.Content);
        Assert.Equal("11111111-2222-3333-4444-555555555555", _launcher.Runs[0].Arg("--resume"));
        var fresh = _launcher.Runs[1];
        Assert.Null(fresh.Arg("--resume"));
        Assert.Equal(fresh.Arg("--session-id"), _store.Sessions.Get(session.Id)!.SdkSessionId);
        var prompt = Content(fresh);
        Assert.Contains("User: Price of BTC?", prompt, StringComparison.Ordinal);
        Assert.Contains("Assistant: 97,000.", prompt, StringComparison.Ordinal);
        Assert.EndsWith("And now?", prompt, StringComparison.Ordinal);
    }

    [Fact]
    public async Task After_a_change_of_sign_in_mode_a_new_conversation_starts_from_what_the_chat_shows()
    {
        var session = _store.Sessions.Create();
        _store.Sessions.SetSdkSessionId(session.Id, "11111111-2222-3333-4444-555555555555");
        _launcher.Plays(Answer("Continuing."));

        await RunAsync("And now?", session, earlier: [Message(session.Id, MessageRole.User, "Price of BTC?")], runtimeChanged: true);

        var run = Assert.Single(_launcher.Runs);
        Assert.Null(run.Arg("--resume"));
        Assert.NotEqual("11111111-2222-3333-4444-555555555555", run.Arg("--session-id"));
        Assert.Contains("User: Price of BTC?", Content(run), StringComparison.Ordinal);
    }

    // ---- failures ----

    [Theory]
    [InlineData("error_max_turns", "", "too many steps")]
    [InlineData("error_during_execution", "The model is overloaded.", "The model is overloaded.")]
    [InlineData("error_during_execution", "", "error_during_execution")]
    public async Task An_error_at_the_end_fails_the_run_with_a_reason(string subtype, string text, string expected)
    {
        _launcher.Plays(run =>
        {
            run.Init();
            run.MessageStart();
            run.Delta("Partial ");
            run.Error(subtype, text);
            return Task.CompletedTask;
        });

        var (outcome, reply, _) = await RunAsync("Hello");

        Assert.Equal(MessageStatus.Failed, outcome.Status);
        Assert.Contains(expected, outcome.Error, StringComparison.Ordinal);
        // What was said before the failure stays.
        Assert.Equal("Partial ", reply.Content);
    }

    [Fact]
    public async Task Claude_code_ending_without_a_last_line_fails_the_run()
    {
        _launcher.Plays(run =>
        {
            run.Init();
            return Task.CompletedTask;
        });

        var (outcome, _, _) = await RunAsync("Hello");

        Assert.Equal(MessageStatus.Failed, outcome.Status);
        Assert.Contains("stopped before it answered", outcome.Error, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Lines_of_kinds_the_app_does_not_know_are_skipped()
    {
        _launcher.Plays(run =>
        {
            run.Process.Emit("""{"type":"system","subtype":"hook_response","hook_name":"x"}""");
            run.Init();
            run.Process.Emit("""{"type":"system","subtype":"status","status":"requesting"}""");
            run.Process.Emit("""{"type":"rate_limit_event","rate_limit_info":{}}""");
            run.Process.Emit("not json at all");
            run.Process.Emit(string.Empty);
            run.MessageStart();
            run.Delta("Fine.");
            run.Success("Fine.");
            return Task.CompletedTask;
        });

        var (outcome, reply, _) = await RunAsync("Hello");

        Assert.Equal(RunOutcome.Complete, outcome);
        Assert.Equal("Fine.", reply.Content);
    }

    [Fact]
    public async Task Cancelling_ends_claude_code_and_the_run_is_recorded_as_cancelled()
    {
        _launcher.Plays(async run =>
        {
            run.Init();
            run.MessageStart();
            run.Delta("Thinking about it");
            await run.Process.WhenKilled.WaitAsync(TimeSpan.FromSeconds(10));
        });
        using var events = _store.Events.Subscribe();
        var session = _store.Sessions.Create();
        var runner = new AgentRunner(
            _store.Sessions,
            _store.Messages,
            _store.Events,
            new FixedResolver(new ResolvedRuntime(NewRuntime([]), AgentWire.Anthropic, AgentWire.Subscription)),
            NullLogger<AgentRunner>.Instance);

        var running = runner.RunAsync(session.Id, "Hello", Ct);
        // Cancelled once the text has been recorded, not merely written by Claude Code: the two
        // happen on different threads.
        using (var patience = CancellationTokenSource.CreateLinkedTokenSource(Ct))
        {
            patience.CancelAfter(TimeSpan.FromSeconds(10));
            while (await events.Reader.ReadAsync(patience.Token) is not TextDelta)
            {
            }
        }

        Assert.True(runner.Cancel(session.Id));
        var result = await running.WaitAsync(TimeSpan.FromSeconds(10), Ct);

        Assert.Empty(_launcher.ScriptFailures);
        Assert.True(_launcher.Runs[0].Process.Killed);
        Assert.Equal(MessageStatus.Cancelled, result.Reply!.Status);
        Assert.Equal("Thinking about it", result.Reply.Content);
    }

    private static Func<FakeCliRun, Task> Answer(string text) => run =>
    {
        run.Init();
        run.MessageStart();
        run.Delta(text);
        run.Success(text);
        return Task.CompletedTask;
    };

    private static string Content(FakeCliRun run)
    {
        using var document = JsonDocument.Parse(run.Process.Input.Single());
        return document.RootElement.GetProperty("message").GetProperty("content").GetString()!;
    }

    private static SessionMessage Message(string sessionId, MessageRole role, string content) =>
        new() { Id = Ids.NewId(), SessionId = sessionId, Role = role, Content = content, Status = MessageStatus.Complete };

    private static async Task<AtkService> StartKitAsync(FakeGate gate, FakeMcpServer kit)
    {
        var service = new AtkService(
            new FakeAtkLauncher().Returns(kit),
            gate,
            () => null,
            new FakeSettings(),
            new AppInfo("1.2.3", IsDevelopmentBuild: true),
            TimeProvider.System,
            NullLogger<AtkService>.Instance);
        var running = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        service.StatusChanged += (_, _) =>
        {
            if (service.Status.State == AtkState.Running)
            {
                running.TrySetResult();
            }
        };
        await service.StartAsync(Ct);
        await running.Task.WaitAsync(TimeSpan.FromSeconds(10), Ct);
        return service;
    }

    private ClaudeCliRuntime NewRuntime(IEnumerable<IToolSource> sources) =>
        new(
            _cli,
            _launcher,
            new ToolHost([_ticker], [], NullLogger<ToolHost>.Instance, sources: sources),
            new FixedPrompt(),
            _store.Sessions,
            new CliRuntimeOptions(BridgeExe, _work),
            "claude-sonnet-5-5",
            "high",
            "1.2.3",
            NullLogger<ClaudeCliRuntime>.Instance);

    private async Task<(RunOutcome Outcome, SessionMessage Reply, AgentSession Session)> RunAsync(
        string text,
        AgentSession? session = null,
        IReadOnlyList<SessionMessage>? earlier = null,
        bool runtimeChanged = false,
        IEnumerable<IToolSource>? sources = null)
    {
        session ??= _store.Sessions.Create();
        var reply = _store.Messages.Append(session.Id, MessageRole.Assistant, string.Empty, MessageStatus.Running);
        var recorder = new RunRecorder(_store.Messages, _store.Events, reply);
        var context = new RunContext
        {
            SessionId = session.Id,
            MessageId = reply.Id,
            UserText = text,
            EarlierMessages = earlier ?? [],
            RuntimeChanged = runtimeChanged,
        };

        var outcome = await NewRuntime(sources ?? []).ExecuteAsync(context, recorder, Ct).WaitAsync(TimeSpan.FromSeconds(30), Ct);
        var stored = recorder.Save(outcome.Status, outcome.Error)!;
        return (outcome, stored, _store.Sessions.Get(session.Id)!);
    }
}
