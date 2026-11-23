using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class ToolHostTests
{
    private static readonly ToolContext _context = new("session", "message", "toolu_1");

    [Fact]
    public async Task A_registered_tool_is_called_with_the_models_arguments()
    {
        var tool = new FakeTool("get_ticker", "97000");
        var host = NewHost([tool]);

        var outcome = await host.InvokeAsync(Request("get_ticker", """{"symbol":"BTC-USDT"}"""), _context, TestContext.Current.CancellationToken);

        Assert.Equal(new ToolOutcome("97000"), outcome);
        Assert.Equal("""{"symbol":"BTC-USDT"}""", Assert.Single(tool.Inputs));
    }

    [Fact]
    public async Task A_name_that_is_not_registered_is_refused()
    {
        var host = NewHost([new FakeTool("get_ticker", "97000")]);

        var outcome = await host.InvokeAsync(Request("place_order", "{}"), _context, TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Failed, outcome.Status);
        Assert.Contains("place_order", outcome.Content, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("{\"symbol\":\"BT")]
    [InlineData("[1,2]")]
    [InlineData("\"text\"")]
    public async Task Arguments_that_are_not_a_json_object_never_reach_the_tool(string input)
    {
        var tool = new FakeTool("get_ticker", "97000");
        var host = NewHost([tool]);

        var outcome = await host.InvokeAsync(Request("get_ticker", input), _context, TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Failed, outcome.Status);
        Assert.Empty(tool.Inputs);
    }

    [Fact]
    public async Task A_gate_that_refuses_stops_the_call_with_its_reason()
    {
        var tool = new FakeTool("place_order", "placed");
        var host = NewHost([tool], [new FakeGate((_, _) => GateDecision.Deny("RiskManager: AVOID"))]);

        var outcome = await host.InvokeAsync(Request("place_order", "{}"), _context, TestContext.Current.CancellationToken);

        Assert.Equal(new ToolOutcome("RiskManager: AVOID", ToolCallStatus.Denied), outcome);
        Assert.Empty(tool.Inputs);
    }

    [Fact]
    public async Task A_gate_that_throws_refuses_the_call()
    {
        var tool = new FakeTool("place_order", "placed");
        var host = NewHost([tool], [new FakeGate((_, _) => throw new InvalidOperationException("database is locked"))]);

        var outcome = await host.InvokeAsync(Request("place_order", "{}"), _context, TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Denied, outcome.Status);
        Assert.Empty(tool.Inputs);
        // The internal error is for the log, not for the model.
        Assert.DoesNotContain("database", outcome.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_first_refusal_wins_and_later_gates_are_not_asked()
    {
        var asked = new List<string>();
        var host = NewHost(
            [new FakeTool("place_order", "placed")],
            [
                new FakeGate((_, _) => { asked.Add("first"); return GateDecision.Allow; }),
                new FakeGate((_, _) => { asked.Add("second"); return GateDecision.Deny("no"); }),
                new FakeGate((_, _) => { asked.Add("third"); return GateDecision.Allow; }),
            ]);

        var outcome = await host.InvokeAsync(Request("place_order", "{}"), _context, TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Denied, outcome.Status);
        Assert.Equal(["first", "second"], asked);
    }

    [Fact]
    public async Task A_gate_can_replace_the_arguments_the_tool_receives()
    {
        var tool = new FakeTool("place_order", "placed");
        using var replacement = JsonDocument.Parse("""{"instId":"BTC-USDT","clOrdId":"sabc"}""");
        var host = NewHost([tool], [new FakeGate((_, _) => new GateDecision(true, Input: replacement.RootElement.Clone()))]);

        await host.InvokeAsync(Request("place_order", """{"instId":"BTC-USDT","clOrdId":"model-made"}"""), _context, TestContext.Current.CancellationToken);

        Assert.Equal("""{"instId":"BTC-USDT","clOrdId":"sabc"}""", Assert.Single(tool.Inputs));
    }

    [Fact]
    public async Task A_tool_that_throws_answers_with_a_failure()
    {
        var host = NewHost([new FakeTool("get_ticker", (_, _, _) => throw new HttpRequestException("No such host"))]);

        var outcome = await host.InvokeAsync(Request("get_ticker", "{}"), _context, TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Failed, outcome.Status);
        Assert.Contains("No such host", outcome.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_tool_that_runs_too_long_is_given_up_on()
    {
        var slow = new FakeTool("slow", async (_, _, token) =>
        {
            await Task.Delay(TimeSpan.FromMinutes(5), token);
            return new ToolOutcome("late");
        });
        var host = new ToolHost([slow], [], NullLogger<ToolHost>.Instance, TimeSpan.FromMilliseconds(50));

        var outcome = await host.InvokeAsync(Request("slow", "{}"), _context, TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Failed, outcome.Status);
        Assert.Contains("did not finish", outcome.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_tool_may_ask_for_more_time_than_the_default()
    {
        var patient = new FakeTool("ask", async (_, _, token) =>
        {
            await Task.Delay(TimeSpan.FromMilliseconds(200), token);
            return new ToolOutcome("answered");
        })
        {
            Timeout = TimeSpan.FromSeconds(30),
        };
        var host = new ToolHost([patient], [], NullLogger<ToolHost>.Instance, TimeSpan.FromMilliseconds(20));

        var outcome = await host.InvokeAsync(Request("ask", "{}"), _context, TestContext.Current.CancellationToken);

        Assert.Equal("answered", outcome.Content);
    }

    [Fact]
    public async Task Cancelling_the_run_cancels_the_tool_call()
    {
        using var cancel = new CancellationTokenSource();
        var started = new TaskCompletionSource();
        var tool = new FakeTool("slow", async (_, _, token) =>
        {
            started.SetResult();
            await Task.Delay(TimeSpan.FromMinutes(5), token);
            return new ToolOutcome("late");
        });
        var host = NewHost([tool]);

        var call = host.InvokeAsync(Request("slow", "{}"), _context, cancel.Token);
        await started.Task;
        await cancel.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => call);
    }

    [Fact]
    public async Task A_very_long_result_is_cut_and_says_so()
    {
        var host = NewHost([new FakeTool("dump", new string('x', ToolHost.MaxResultLength + 10))]);

        var outcome = await host.InvokeAsync(Request("dump", "{}"), _context, TestContext.Current.CancellationToken);

        Assert.StartsWith(new string('x', ToolHost.MaxResultLength), outcome.Content, StringComparison.Ordinal);
        Assert.Contains("cut off", outcome.Content, StringComparison.Ordinal);
        Assert.Equal(ToolCallStatus.Succeeded, outcome.Status);
    }

    [Fact]
    public void Tools_are_listed_in_a_stable_order_and_names_must_be_unique()
    {
        var host = NewHost([new FakeTool("zeta", "z"), new FakeTool("alpha", "a"), new FakeTool("mid", "m")]);

        Assert.Equal(["alpha", "mid", "zeta"], host.Definitions.Select(definition => definition.Name));
        Assert.Throws<ArgumentException>(() => NewHost([new FakeTool("same", "1"), new FakeTool("same", "2")]));
    }

    private static ToolHost NewHost(IEnumerable<ITool> tools, IEnumerable<IToolGate>? gates = null) =>
        new(tools, gates ?? [], NullLogger<ToolHost>.Instance);

    private static ToolRequest Request(string name, string input) => new("toolu_1", name, input);

    private sealed class FakeGate(Func<string, JsonElement, GateDecision> decide) : IToolGate
    {
        public ValueTask<GateDecision> CheckAsync(string toolName, JsonElement input, ToolContext context, CancellationToken cancellationToken) =>
            ValueTask.FromResult(decide(toolName, input));
    }
}
