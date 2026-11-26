using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;
using Avalonia.VisualTree;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.App.ViewModels;
using TradingAgent.App.Views;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Settings;
using Xunit;

namespace TradingAgent.App.Tests;

/// <summary>What the chat page shows around a message: who wrote it, its tool calls, the list of chats.</summary>
public sealed class ChatLookTests : IDisposable
{
    private readonly AgentHarness _agent = new();

    public void Dispose() => _agent.Dispose();

    [Fact]
    public async Task A_reply_names_its_model_and_its_tool_calls_read_like_words()
    {
        _agent.Run = (_, recorder, _) =>
        {
            recorder.StartTool(new ToolRequest("toolu_01", "get_candles", """{"instrument":"BTC-USDT","limit":200}"""));
            recorder.FinishTool("toolu_01", new ToolOutcome("200 bars"), durationMs: 184);
            recorder.StartTool(new ToolRequest("toolu_02", "okx_spot_place_order", "{}"));
            recorder.FinishTool("toolu_02", ToolOutcome.Denied("Risk check: AVOID"), durationMs: 3);
            recorder.Text("Done.");
            recorder.AddUsage(10, 2, "fake-model");
            return Task.FromResult(RunOutcome.Complete);
        };
        using var chat = NewChat();

        chat.Draft = "Go";
        chat.Send();
        await AgentHarness.Eventually(() => chat is { IsRunning: false, Messages.Count: 2 } && chat.Messages[1].Footer.Length > 0, "the reply is finished");

        Assert.Equal("You", chat.Messages[0].Author);
        var reply = chat.Messages[1];
        Assert.Equal("Agent · fake-model", reply.Author);
        Assert.Matches(@"^\d\d:\d\d$", reply.Time);
        Assert.Equal("Tools Used (2)", reply.ToolsLabel);
        Assert.False(reply.IsWaiting);
        Assert.False(reply.IsStreaming);
        var candles = reply.ToolCalls[0];
        Assert.Equal(("Get candles", "BTC-USDT", "184ms"), (candles.Label, candles.KeyArgument, candles.Duration));
        Assert.Equal((true, false, false), (candles.IsSucceeded, candles.IsProblem, candles.IsRunning));
        var order = reply.ToolCalls[1];
        // No argument to show, and a refused order is a problem, not a success.
        Assert.Equal(("Okx spot place order", string.Empty), (order.Label, order.KeyArgument));
        Assert.Equal((false, true, false), (order.IsSucceeded, order.IsProblem, order.IsRunning));
    }

    [Fact]
    public async Task While_no_text_has_come_the_reply_waits_and_once_it_comes_it_streams()
    {
        var release = new TaskCompletionSource();
        var write = new TaskCompletionSource();
        _agent.Run = async (_, recorder, cancellationToken) =>
        {
            await write.Task.WaitAsync(cancellationToken);
            recorder.Text("First words");
            await release.Task.WaitAsync(cancellationToken);
            return RunOutcome.Complete;
        };
        using var chat = NewChat();
        chat.Draft = "Go";
        chat.Send();
        await AgentHarness.Eventually(() => chat.Messages.Count == 2, "the reply has started");

        Assert.True(chat.Messages[1].IsWaiting);
        Assert.False(chat.Messages[1].IsStreaming);
        write.SetResult();
        await AgentHarness.Eventually(() => chat.Messages[1].Content.Length > 0, "the text arrived");
        Assert.False(chat.Messages[1].IsWaiting);
        Assert.True(chat.Messages[1].IsStreaming);
        release.SetResult();
        await AgentHarness.Eventually(() => !chat.IsRunning, "the reply is finished");
    }

    [Fact]
    public async Task Opening_every_tool_call_also_opens_the_ones_that_come_later()
    {
        _agent.Run = (_, recorder, _) =>
        {
            recorder.StartTool(new ToolRequest("toolu_01", "get_ticker", "{}"));
            recorder.FinishTool("toolu_01", new ToolOutcome("1"), durationMs: 1);
            return Task.FromResult(RunOutcome.Complete);
        };
        using var chat = NewChat();
        chat.Draft = "One";
        chat.Send();
        await AgentHarness.Eventually(() => chat is { IsRunning: false, Messages.Count: 2 } && chat.Messages[1].ToolCalls.Count == 1, "the first reply");
        var first = chat.Messages[1].ToolCalls[0];
        Assert.False(first.IsExpanded);

        chat.ExpandAllTools = true;
        chat.Draft = "Two";
        chat.Send();
        await AgentHarness.Eventually(() => chat is { IsRunning: false, Messages.Count: 4 } && chat.Messages[3].ToolCalls.Count == 1, "the second reply");

        Assert.True(first.IsExpanded);
        Assert.True(chat.Messages[3].ToolCalls[0].IsExpanded);
        // One call can still be closed on its own.
        first.ToggleCommand.Execute(null);
        Assert.False(first.IsExpanded);
    }

    [Fact]
    public void The_chats_stand_under_a_heading_for_their_day_newest_first()
    {
        var clock = new FixedClock(new DateTimeOffset(2026, 11, 24, 12, 0, 0, TimeSpan.Zero));
        var repository = new Data.Agent.AgentSessionRepository(_agent.Database, clock);
        clock.Now = clock.Now.AddDays(-9);
        repository.Create();
        clock.Now = clock.Now.AddDays(6);
        repository.Create();
        clock.Now = clock.Now.AddDays(2);
        repository.Create();
        clock.Now = clock.Now.AddDays(1);
        repository.Create();
        repository.Create();

        using var chat = new ChatViewModel(repository, _agent.Messages, _agent.Runner, _agent.Questions, _agent.Events, action => action(), _agent.Settings, clock);

        Assert.Equal(["TODAY", null, "YESTERDAY", "PREVIOUS 7 DAYS", "EARLIER"], chat.Sessions.Select(session => session.Group));
        Assert.Equal("5 conversations", chat.SessionsLabel);
        Assert.Equal("0 messages", chat.Sessions[0].MessagesLabel);
    }

    [Fact]
    public async Task A_quick_action_sends_its_words_and_the_effort_is_saved_where_the_settings_page_reads_it()
    {
        _agent.Run = (_, recorder, _) =>
        {
            recorder.Text("ok");
            return Task.FromResult(RunOutcome.Complete);
        };
        using var chat = NewChat();
        Assert.Equal(["Analyze Market", "Review Portfolio", "Adjust Strategy", "Start Trading"], chat.QuickActions.Select(action => action.Title));
        Assert.Equal("high", chat.Effort);

        chat.ChooseEffortCommand.Execute("max");
        chat.ChooseEffortCommand.Execute("not a level");
        chat.RunQuickActionCommand.Execute("Analyze Market");
        // The run stores the message and names the chat after it.
        await AgentHarness.Eventually(() => chat is { IsRunning: false, Messages.Count: 2 } && chat.Sessions[0].Title != "New chat", "the reply is finished");

        Assert.Equal("max", chat.Effort);
        Assert.Equal("max", _agent.Settings.GetValue(SettingKeys.AgentEffort));
        Assert.Equal("Analyze Market", Assert.Single(chat.Sessions).Title);
        Assert.Equal("Analyze Market", chat.Messages[0].Content);
    }

    [AvaloniaFact]
    public void The_chat_page_keeps_the_names_the_checks_of_the_real_app_use()
    {
        using var chat = NewChat();
        var view = new ChatView { DataContext = chat };
        var window = new Window { Content = view };
        window.Show();
        Dispatcher.UIThread.RunJobs();

        Assert.IsType<TextBox>(view.FindControl<TextBox>("DraftBox"));
        Assert.IsType<ListBox>(view.FindControl<ListBox>("MessageList"));
        Assert.IsType<ListBox>(view.FindControl<ListBox>("SessionList"));
        var names = view.GetVisualDescendants().OfType<Button>().Select(Avalonia.Automation.AutomationProperties.GetName).ToList();
        // Round icon buttons carry no text, so these names are how a script finds them.
        Assert.Contains("Send", names);
        Assert.Contains("Stop", names);
        Assert.Contains("New chat", names);
        Assert.Contains("Delete chat", names);
        Assert.True(chat.UsesCards);
        window.Close();
    }

    private ChatViewModel NewChat() =>
        new(_agent.Sessions, _agent.Messages, _agent.Runner, _agent.Questions, _agent.Events, action => action(), _agent.Settings);

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;

        public override TimeZoneInfo LocalTimeZone => TimeZoneInfo.Utc;
    }
}
