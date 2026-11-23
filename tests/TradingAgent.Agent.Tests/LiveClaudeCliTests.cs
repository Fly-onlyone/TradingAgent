using System.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Cli;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Shell;
using Xunit;

namespace TradingAgent.Agent.Tests;

/// <summary>
/// Runs the real Claude Code command line, signed in with the subscription of whoever runs the test,
/// against the real bridge exe. It spends a little of that subscription, so it has a switch of its
/// own: <c>TRADINGAGENT_LIVE_CLI=1</c>, and <c>TRADINGAGENT_BRIDGE_EXE</c> set to a built
/// <c>TradingAgent.exe</c>.
/// </summary>
public sealed class LiveClaudeCliTests : IDisposable
{
    private readonly AgentStore _store = new();
    private readonly string _work = Path.Combine(Path.GetTempPath(), "trading-agent-tests", "live-cli-" + Guid.NewGuid().ToString("N"));

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose()
    {
        _store.Dispose();
        try
        {
            Directory.Delete(_work, recursive: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // A leftover temp folder is harmless.
        }
    }

    [Fact]
    public async Task The_real_claude_code_calls_this_apps_tool_through_the_real_bridge_and_remembers_it_in_the_next_run()
    {
        var bridge = Environment.GetEnvironmentVariable("TRADINGAGENT_BRIDGE_EXE");
        Assert.SkipUnless(
            Environment.GetEnvironmentVariable("TRADINGAGENT_LIVE_CLI") == "1" && File.Exists(bridge),
            "Set TRADINGAGENT_LIVE_CLI=1 and TRADINGAGENT_BRIDGE_EXE to run the real Claude Code.");

        var launcher = new CliProcessLauncher(new NoJob());
        var cli = new ClaudeCli(launcher, _work, TimeProvider.System, NullLogger<ClaudeCli>.Instance);
        var tool = new FakeTool("get_test_number", "The number is 4217.");
        var runtime = new ClaudeCliRuntime(
            cli,
            launcher,
            new ToolHost([tool], [], NullLogger<ToolHost>.Instance),
            new FixedPrompt(),
            _store.Sessions,
            new CliRuntimeOptions(bridge!, _work),
            "haiku",
            "low",
            "0.0.0-test",
            NullLogger<ClaudeCliRuntime>.Instance);
        var session = _store.Sessions.Create();

        var (first, firstReply) = await RunAsync(runtime, session.Id, "Call the tool get_test_number once and reply with the number it returns, digits only.");
        var (second, secondReply) = await RunAsync(runtime, session.Id, "Which number did the tool return a moment ago? Digits only. Do not call a tool.");

        Assert.True(first.Status == MessageStatus.Complete, $"First run: {first.Error}");
        Assert.Contains("4217", firstReply.Content, StringComparison.Ordinal);
        var call = Assert.Single(firstReply.ToolCalls);
        Assert.Equal(("get_test_number", ToolCallStatus.Succeeded), (call.Name, call.Status));
        // The model's own id of the call, not one made up here: Claude Code told the app which call it was.
        Assert.StartsWith("toolu_", call.ToolUseId, StringComparison.Ordinal);
        Assert.Single(tool.Inputs);
        Assert.True(firstReply.OutputTokens > 0);

        // Resumed: the second process knows what the first one did.
        Assert.True(second.Status == MessageStatus.Complete, $"Second run: {second.Error}");
        Assert.Contains("4217", secondReply.Content, StringComparison.Ordinal);
        Assert.Empty(secondReply.ToolCalls);
        Assert.True(Guid.TryParse(_store.Sessions.Get(session.Id)!.SdkSessionId, out _));
    }

    private async Task<(RunOutcome Outcome, SessionMessage Reply)> RunAsync(ClaudeCliRuntime runtime, string sessionId, string text)
    {
        var reply = _store.Messages.Append(sessionId, MessageRole.Assistant, string.Empty, MessageStatus.Running);
        var recorder = new RunRecorder(_store.Messages, _store.Events, reply);
        var context = new RunContext { SessionId = sessionId, MessageId = reply.Id, UserText = text };
        var outcome = await runtime.ExecuteAsync(context, recorder, Ct).WaitAsync(TimeSpan.FromMinutes(3), Ct);
        return (outcome, recorder.Save(outcome.Status, outcome.Error)!);
    }

    /// <summary>The runtime ends Claude Code itself when the run ends.</summary>
    private sealed class NoJob : IChildProcessJob
    {
        public void Add(Process process)
        {
        }
    }
}
