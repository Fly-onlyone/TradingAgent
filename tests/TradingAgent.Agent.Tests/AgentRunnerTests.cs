using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class AgentRunnerTests
{
    [Fact]
    public async Task A_plain_answer_is_stored_announced_and_added_to_the_transcript()
    {
        using var harness = new Harness(new ScriptedModel().Says("BTC is at 97000."));
        var session = harness.Store.Sessions.Create();

        var result = await harness.Runner.RunAsync(session.Id, "Price of BTC?", TestContext.Current.CancellationToken);

        Assert.Equal(RunResultKind.Finished, result.Kind);
        var reply = result.Reply!;
        Assert.Equal(MessageStatus.Complete, reply.Status);
        Assert.Equal("BTC is at 97000.", reply.Content);
        Assert.Equal("scripted-1", reply.Model);
        Assert.Equal(10, reply.InputTokens);
        Assert.Equal(5, reply.OutputTokens);
        Assert.Null(reply.Error);

        var stored = harness.Store.Messages.GetWindow(session.Id, 10);
        Assert.Equal([MessageRole.User, MessageRole.Assistant], stored.Select(message => message.Role));
        Assert.Equal("Price of BTC?", stored[0].Content);
        var loaded = harness.Store.Sessions.Get(session.Id)!;
        Assert.Equal("Price of BTC?", loaded.Title);
        Assert.Equal(15, loaded.TotalTokens);
        Assert.Equal(AgentWire.Anthropic, loaded.Provider);

        Assert.Equal(
            ["""{"role":"user","text":"Price of BTC?"}""", """{"role":"assistant","text":"BTC is at 97000."}"""],
            harness.Store.Transcript.Load(session.Id).Select(item => item.Json));

        var events = harness.DrainEvents();
        Assert.IsType<MessageAdded>(events[0]);
        Assert.IsType<RunStarted>(events.First(e => e is not MessageAdded and not SessionChanged));
        Assert.Equal("BTC is at 97000.", string.Concat(events.OfType<TextDelta>().Select(delta => delta.Text)));
        var finished = Assert.IsType<RunFinished>(events[^1]);
        Assert.Equal(MessageStatus.Complete, finished.Status);
        Assert.Equal(reply.Id, finished.MessageId);
        Assert.False(harness.Runner.IsRunning(session.Id));
    }

    [Fact]
    public async Task Tools_are_run_and_their_results_go_back_to_the_model_in_one_item()
    {
        var ticker = new FakeTool("get_ticker", "97000");
        var positions = new FakeTool("get_positions", "[]");
        var model = new ScriptedModel()
            .Calls("Checking.", new ToolRequest("toolu_1", "get_ticker", """{"symbol":"BTC-USDT"}"""), new ToolRequest("toolu_2", "get_positions", "{}"))
            .Says("BTC is at 97000 and you hold nothing.");
        using var harness = new Harness(model, [ticker, positions]);
        var session = harness.Store.Sessions.Create();

        var result = await harness.Runner.RunAsync(session.Id, "Status?", TestContext.Current.CancellationToken);

        var reply = result.Reply!;
        Assert.Equal(MessageStatus.Complete, reply.Status);
        // Text of the two model calls is separated, not run together.
        Assert.Equal("Checking.\n\nBTC is at 97000 and you hold nothing.", reply.Content);
        Assert.Equal(["get_ticker", "get_positions"], reply.ToolCalls.Select(call => call.Name));
        Assert.All(reply.ToolCalls, call => Assert.Equal(ToolCallStatus.Succeeded, call.Status));
        Assert.Equal("\"97000\"", reply.ToolCalls[0].ResultJson);
        Assert.Equal("""{"symbol":"BTC-USDT"}""", Assert.Single(ticker.Inputs));
        // Two model calls: tokens add up.
        Assert.Equal(20, reply.InputTokens);

        var transcript = harness.Store.Transcript.Load(session.Id).Select(item => item.Json).ToList();
        Assert.Equal(4, transcript.Count);
        Assert.Equal("""{"role":"user","results":[{"id":"toolu_1","error":false},{"id":"toolu_2","error":false}]}""", transcript[2]);
        // The second model call saw the question, its own tool calls and their results.
        Assert.Equal(transcript.Take(3), model.Requests[1].Transcript);
        Assert.Equal(["get_positions", "get_ticker"], model.Requests[0].Tools.Select(tool => tool.Name));

        var events = harness.DrainEvents();
        Assert.Equal(2, events.OfType<ToolCallStarted>().Count());
        Assert.Equal(2, events.OfType<ToolCallFinished>().Count());
    }

    [Fact]
    public async Task Tools_of_one_step_run_at_the_same_time()
    {
        var firstStarted = new TaskCompletionSource();
        var secondStarted = new TaskCompletionSource();
        // Each tool finishes only once the other has started: in sequence this would never end.
        var first = new FakeTool("first", async (_, _, token) =>
        {
            firstStarted.SetResult();
            await secondStarted.Task.WaitAsync(TimeSpan.FromSeconds(10), token);
            return new ToolOutcome("1");
        });
        var second = new FakeTool("second", async (_, _, token) =>
        {
            secondStarted.SetResult();
            await firstStarted.Task.WaitAsync(TimeSpan.FromSeconds(10), token);
            return new ToolOutcome("2");
        });
        var model = new ScriptedModel()
            .Calls(string.Empty, new ToolRequest("toolu_1", "first", "{}"), new ToolRequest("toolu_2", "second", "{}"))
            .Says("done");
        using var harness = new Harness(model, [first, second]);
        var session = harness.Store.Sessions.Create();

        var result = await harness.Runner.RunAsync(session.Id, "go", TestContext.Current.CancellationToken);

        Assert.Equal(MessageStatus.Complete, result.Reply!.Status);
        Assert.All(result.Reply.ToolCalls, call => Assert.Equal(ToolCallStatus.Succeeded, call.Status));
    }

    [Fact]
    public async Task A_refused_tool_call_is_shown_as_denied_and_the_model_is_told()
    {
        var order = new FakeTool("place_order", "placed");
        var model = new ScriptedModel()
            .Calls(string.Empty, new ToolRequest("toolu_1", "place_order", """{"sz":"1"}"""))
            .Says("The order was refused by the risk check.");
        using var harness = new Harness(model, [order], [new DenyAll("RiskManager: AVOID")]);
        var session = harness.Store.Sessions.Create();

        var result = await harness.Runner.RunAsync(session.Id, "Buy 1 BTC", TestContext.Current.CancellationToken);

        var call = Assert.Single(result.Reply!.ToolCalls);
        Assert.Equal(ToolCallStatus.Denied, call.Status);
        Assert.Equal("\"RiskManager: AVOID\"", call.ResultSummaryJson);
        Assert.Empty(order.Inputs);
        Assert.Contains("\"error\":true", harness.Store.Transcript.Load(session.Id)[2].Json, StringComparison.Ordinal);
        Assert.Equal(MessageStatus.Complete, result.Reply.Status);
    }

    [Fact]
    public async Task A_call_to_a_tool_that_does_not_exist_fails_that_call_only()
    {
        var model = new ScriptedModel()
            .Calls(string.Empty, new ToolRequest("toolu_1", "rm_rf", "{}"))
            .Says("I cannot do that.");
        using var harness = new Harness(model);
        var session = harness.Store.Sessions.Create();

        var result = await harness.Runner.RunAsync(session.Id, "delete everything", TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Failed, Assert.Single(result.Reply!.ToolCalls).Status);
        Assert.Equal(MessageStatus.Complete, result.Reply.Status);
    }

    [Fact]
    public async Task Cancelling_while_the_model_writes_keeps_what_was_written()
    {
        var streaming = new TaskCompletionSource();
        var model = new ScriptedModel().Then(async (_, sink, token) =>
        {
            sink.Text("BTC is");
            streaming.SetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, token);
            throw new InvalidOperationException("unreachable");
        });
        using var harness = new Harness(model);
        var session = harness.Store.Sessions.Create();

        var run = harness.Runner.RunAsync(session.Id, "Price?", TestContext.Current.CancellationToken);
        await streaming.Task;
        Assert.True(harness.Runner.IsRunning(session.Id));
        Assert.True(harness.Runner.Cancel(session.Id));
        var result = await run;

        Assert.Equal(MessageStatus.Cancelled, result.Reply!.Status);
        Assert.Equal("BTC is", result.Reply.Content);
        Assert.Equal(MessageStatus.Cancelled, Assert.IsType<RunFinished>(harness.DrainEvents()[^1]).Status);
        // Only the question is in the transcript: an unfinished answer is not something the model said.
        Assert.Single(harness.Store.Transcript.Load(session.Id));
        Assert.False(harness.Runner.IsRunning(session.Id));
        Assert.False(harness.Runner.Cancel(session.Id));
    }

    [Fact]
    public async Task Cancelling_while_a_tool_runs_still_answers_the_tool_call_in_the_transcript()
    {
        var toolStarted = new TaskCompletionSource();
        var slow = new FakeTool("slow", async (_, _, token) =>
        {
            toolStarted.SetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, token);
            return new ToolOutcome("never");
        });
        var quick = new FakeTool("quick", "done");
        var model = new ScriptedModel()
            .Calls(string.Empty, new ToolRequest("toolu_1", "quick", "{}"), new ToolRequest("toolu_2", "slow", "{}"));
        using var harness = new Harness(model, [slow, quick]);
        var session = harness.Store.Sessions.Create();

        var run = harness.Runner.RunAsync(session.Id, "go", TestContext.Current.CancellationToken);
        await toolStarted.Task;
        harness.Runner.Cancel(session.Id);
        var result = await run;

        Assert.Equal(MessageStatus.Cancelled, result.Reply!.Status);
        Assert.Equal([ToolCallStatus.Succeeded, ToolCallStatus.Failed], result.Reply.ToolCalls.Select(call => call.Status));
        // A tool call without a result would make the provider reject the session from now on.
        var transcript = harness.Store.Transcript.Load(session.Id).Select(item => item.Json).ToList();
        Assert.Equal(3, transcript.Count);
        Assert.Equal("""{"role":"user","results":[{"id":"toolu_1","error":false},{"id":"toolu_2","error":true}]}""", transcript[2]);
    }

    [Fact]
    public async Task A_session_can_be_used_again_after_a_cancelled_run()
    {
        var streaming = new TaskCompletionSource();
        var model = new ScriptedModel()
            .Then(async (_, _, token) =>
            {
                streaming.SetResult();
                await Task.Delay(Timeout.InfiniteTimeSpan, token);
                throw new InvalidOperationException("unreachable");
            })
            .Says("Second answer.");
        using var harness = new Harness(model);
        var session = harness.Store.Sessions.Create();
        var first = harness.Runner.RunAsync(session.Id, "one", TestContext.Current.CancellationToken);
        await streaming.Task;
        harness.Runner.Cancel(session.Id);
        await first;

        var second = await harness.Runner.RunAsync(session.Id, "two", TestContext.Current.CancellationToken);

        Assert.Equal(MessageStatus.Complete, second.Reply!.Status);
        Assert.Equal(
            ["""{"role":"user","text":"one"}""", """{"role":"user","text":"two"}"""],
            model.Requests[1].Transcript);
    }

    [Fact]
    public async Task A_model_that_never_stops_asking_for_tools_is_stopped()
    {
        var model = new ScriptedModel();
        for (var i = 0; i < ModelLoopRuntime.MaxSteps; i++)
        {
            model.Calls(string.Empty, new ToolRequest($"toolu_{i}", "again", "{}"));
        }

        using var harness = new Harness(model, [new FakeTool("again", "ok")]);
        var session = harness.Store.Sessions.Create();

        var result = await harness.Runner.RunAsync(session.Id, "loop", TestContext.Current.CancellationToken);

        Assert.Equal(MessageStatus.Failed, result.Reply!.Status);
        Assert.Contains("Stopped after", result.Reply.Error, StringComparison.Ordinal);
        Assert.Equal(ModelLoopRuntime.MaxSteps, model.Requests.Count);
        // Still a valid transcript: every call has its result.
        Assert.Equal(1 + (2 * ModelLoopRuntime.MaxSteps), harness.Store.Transcript.Load(session.Id).Count);
    }

    [Theory]
    [InlineData(StopReason.Refused, "declined")]
    [InlineData(StopReason.MaxTokens, "cut off")]
    public async Task An_answer_that_did_not_end_normally_is_a_failed_reply_that_keeps_its_text(StopReason stop, string expected)
    {
        var model = new ScriptedModel().Then((_, sink, _) =>
        {
            sink.Text("Partial");
            return Task.FromResult(new ModelTurn { StopReason = stop, Text = "Partial" });
        });
        using var harness = new Harness(model);
        var session = harness.Store.Sessions.Create();

        var result = await harness.Runner.RunAsync(session.Id, "go", TestContext.Current.CancellationToken);

        Assert.Equal(MessageStatus.Failed, result.Reply!.Status);
        Assert.Contains(expected, result.Reply.Error, StringComparison.Ordinal);
        Assert.Equal("Partial", result.Reply.Content);
    }

    [Fact]
    public async Task A_paused_turn_is_continued()
    {
        var model = new ScriptedModel()
            .Then((_, sink, _) =>
            {
                sink.Text("Working");
                return Task.FromResult(new ModelTurn { StopReason = StopReason.Paused, Text = "Working", TranscriptItems = ["""{"role":"assistant","text":"Working"}"""] });
            })
            .Says("Finished.");
        using var harness = new Harness(model);
        var session = harness.Store.Sessions.Create();

        var result = await harness.Runner.RunAsync(session.Id, "go", TestContext.Current.CancellationToken);

        Assert.Equal(MessageStatus.Complete, result.Reply!.Status);
        Assert.Equal("Working\n\nFinished.", result.Reply.Content);
        Assert.Equal(2, model.Requests.Count);
    }

    [Fact]
    public async Task A_failed_model_call_is_a_failed_reply_with_the_reason_and_the_next_run_works()
    {
        var model = new ScriptedModel()
            .Then((_, _, _) => throw new ModelException(ModelFailure.RateLimited, "Anthropic's rate limit was reached. Try again in a moment."))
            .Says("Now it works.");
        using var harness = new Harness(model);
        var session = harness.Store.Sessions.Create();

        var failed = await harness.Runner.RunAsync(session.Id, "one", TestContext.Current.CancellationToken);
        var worked = await harness.Runner.RunAsync(session.Id, "two", TestContext.Current.CancellationToken);

        Assert.Equal(MessageStatus.Failed, failed.Reply!.Status);
        Assert.Equal("Anthropic's rate limit was reached. Try again in a moment.", failed.Reply.Error);
        Assert.Equal(MessageStatus.Complete, worked.Reply!.Status);
        Assert.Equal(4, harness.Store.Messages.GetWindow(session.Id, 10).Count);
    }

    [Fact]
    public async Task An_unexpected_error_fails_the_reply_without_showing_internals()
    {
        var model = new ScriptedModel().Then((_, _, _) => throw new InvalidOperationException("null reference in Foo.Bar"));
        using var harness = new Harness(model);
        var session = harness.Store.Sessions.Create();

        var result = await harness.Runner.RunAsync(session.Id, "go", TestContext.Current.CancellationToken);

        Assert.Equal(MessageStatus.Failed, result.Reply!.Status);
        Assert.DoesNotContain("Foo.Bar", result.Reply.Error, StringComparison.Ordinal);
        Assert.Equal(MessageStatus.Failed, Assert.IsType<RunFinished>(harness.DrainEvents()[^1]).Status);
    }

    [Fact]
    public async Task A_second_request_while_a_reply_is_written_is_refused_and_changes_nothing()
    {
        var streaming = new TaskCompletionSource();
        var release = new TaskCompletionSource();
        var model = new ScriptedModel().Then(async (_, sink, _) =>
        {
            streaming.SetResult();
            await release.Task;
            sink.Text("done");
            return new ModelTurn { StopReason = StopReason.EndTurn, Text = "done", TranscriptItems = ["""{"role":"assistant","text":"done"}"""] };
        });
        using var harness = new Harness(model);
        var session = harness.Store.Sessions.Create();
        var first = harness.Runner.RunAsync(session.Id, "one", TestContext.Current.CancellationToken);
        await streaming.Task;

        var second = await harness.Runner.RunAsync(session.Id, "two", TestContext.Current.CancellationToken);

        Assert.Equal(RunResultKind.Busy, second.Kind);
        Assert.Null(second.Reply);
        Assert.Equal(2, harness.Store.Messages.GetWindow(session.Id, 10).Count);

        release.SetResult();
        Assert.Equal(MessageStatus.Complete, (await first).Reply!.Status);
    }

    [Fact]
    public async Task A_run_in_a_session_that_does_not_exist_is_refused()
    {
        using var harness = new Harness(new ScriptedModel());

        var result = await harness.Runner.RunAsync("000000000000000000000000", "hello", TestContext.Current.CancellationToken);

        Assert.Equal(RunResultKind.SessionNotFound, result.Kind);
        await Assert.ThrowsAsync<ArgumentException>(() => harness.Runner.RunAsync("000000000000000000000000", "  ", TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Without_a_usable_model_the_reply_says_what_to_do()
    {
        using var harness = new Harness(new ScriptedModel());
        harness.Resolver.Resolved = new ResolvedRuntime(null, AgentWire.Anthropic, AgentWire.Subscription, "Choose \"API key\" in Settings.");
        var session = harness.Store.Sessions.Create();

        var result = await harness.Runner.RunAsync(session.Id, "hello", TestContext.Current.CancellationToken);

        Assert.Equal(MessageStatus.Failed, result.Reply!.Status);
        Assert.Equal("Choose \"API key\" in Settings.", result.Reply.Error);
        // The question is kept, so the user does not have to type it again.
        Assert.Equal("hello", harness.Store.Messages.GetWindow(session.Id, 10)[0].Content);
    }

    [Fact]
    public async Task A_later_run_sends_the_whole_conversation()
    {
        var model = new ScriptedModel().Says("First.").Says("Second.");
        using var harness = new Harness(model);
        var session = harness.Store.Sessions.Create();

        await harness.Runner.RunAsync(session.Id, "one", TestContext.Current.CancellationToken);
        await harness.Runner.RunAsync(session.Id, "two", TestContext.Current.CancellationToken);

        Assert.Equal(
            ["""{"role":"user","text":"one"}""", """{"role":"assistant","text":"First."}""", """{"role":"user","text":"two"}"""],
            model.Requests[1].Transcript);
        Assert.Equal("You are a test.", model.Requests[1].SystemPrompt);
    }

    [Fact]
    public async Task After_a_change_of_provider_the_conversation_starts_over_from_what_the_chat_shows()
    {
        var claude = new ScriptedModel { Provider = AgentWire.Anthropic }
            .Calls("Looking.", new ToolRequest("toolu_1", "get_ticker", "{}"))
            .Says("BTC is at 97000.");
        using var harness = new Harness(claude, [new FakeTool("get_ticker", "97000")]);
        var session = harness.Store.Sessions.Create();
        await harness.Runner.RunAsync(session.Id, "Price?", TestContext.Current.CancellationToken);

        var gpt = new ScriptedModel { Provider = AgentWire.OpenAi }.Says("Still 97000.");
        harness.UseModel(gpt);
        await harness.Runner.RunAsync(session.Id, "And now?", TestContext.Current.CancellationToken);

        // The other provider's items (tool calls, results) are gone; the words are kept.
        Assert.Equal(
            [
                """{"role":"user","text":"Price?"}""",
                """{"role":"assistant","text":"Looking.\n\nBTC is at 97000."}""",
                """{"role":"user","text":"And now?"}""",
            ],
            gpt.Requests[0].Transcript);
        var stored = harness.Store.Transcript.Load(session.Id);
        Assert.All(stored, item => Assert.Equal(AgentWire.OpenAi, item.Provider));
        Assert.Equal(AgentWire.OpenAi, harness.Store.Sessions.Get(session.Id)!.Provider);
    }

    private sealed class DenyAll(string reason) : IToolGate
    {
        public ValueTask<GateDecision> CheckAsync(string toolName, JsonElement input, ToolContext context, CancellationToken cancellationToken) =>
            ValueTask.FromResult(GateDecision.Deny(reason));
    }

    private sealed class Harness : IDisposable
    {
        private readonly IAgentEventSubscription _events;
        private readonly ToolHost _tools;

        public Harness(ScriptedModel model, IEnumerable<ITool>? tools = null, IEnumerable<IToolGate>? gates = null)
        {
            _events = Store.Events.Subscribe();
            _tools = new ToolHost(tools ?? [], gates ?? [], NullLogger<ToolHost>.Instance);
            Resolver = new FixedResolver(Resolve(model));
            Runner = new AgentRunner(Store.Sessions, Store.Messages, Store.Events, Resolver, NullLogger<AgentRunner>.Instance);
        }

        public AgentStore Store { get; } = new();

        public FixedResolver Resolver { get; }

        public AgentRunner Runner { get; }

        public void UseModel(ScriptedModel model) => Resolver.Resolved = Resolve(model);

        public List<AgentEvent> DrainEvents()
        {
            var events = new List<AgentEvent>();
            while (_events.Reader.TryRead(out var agentEvent))
            {
                events.Add(agentEvent);
            }

            return events;
        }

        public void Dispose()
        {
            _events.Dispose();
            Store.Dispose();
        }

        private ResolvedRuntime Resolve(ScriptedModel model) => new(
            new ModelLoopRuntime(model, _tools, Store.Transcript, new FixedPrompt(), "scripted-1", "high"),
            model.Provider,
            AgentWire.ApiKey);
    }
}
