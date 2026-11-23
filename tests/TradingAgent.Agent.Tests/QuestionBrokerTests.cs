using System.Text.Json;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class QuestionBrokerTests
{
    [Fact]
    public async Task The_answer_reaches_the_run_that_asked_and_closes_the_question()
    {
        using var store = new AgentStore();
        using var events = store.Events.Subscribe();
        var session = store.Sessions.Create();
        var broker = NewBroker(store);

        var asking = broker.AskAsync(session.Id, "Which symbol?", ["BTC-USDT", "ETH-USDT"], false, null, TestContext.Current.CancellationToken);
        var asked = Assert.IsType<QuestionAsked>(await NextEvent(events));
        Assert.Equal(asked.Question.Id, store.Sessions.Get(session.Id)!.PendingQuestion!.Id);
        Assert.Equal(["BTC-USDT", "ETH-USDT"], asked.Question.Options);

        var result = broker.Answer(session.Id, asked.Question.Id, "ETH-USDT");

        Assert.Equal(AnswerResult.Delivered, result);
        Assert.Equal("ETH-USDT", await asking);
        Assert.Null(store.Sessions.Get(session.Id)!.PendingQuestion);
        Assert.Equal(asked.Question.Id, Assert.IsType<QuestionClosed>(await NextEvent(events)).QuestionId);
        // The same answer a second time finds nothing to answer.
        Assert.Equal(AnswerResult.NotFound, broker.Answer(session.Id, asked.Question.Id, "again"));
    }

    [Fact]
    public async Task Without_an_answer_the_wait_ends_and_the_question_is_closed()
    {
        using var store = new AgentStore();
        var session = store.Sessions.Create();
        var broker = NewBroker(store);

        var answer = await broker.AskAsync(session.Id, "Still there?", [], false, TimeSpan.FromMilliseconds(50), TestContext.Current.CancellationToken);

        Assert.Null(answer);
        Assert.Null(store.Sessions.Get(session.Id)!.PendingQuestion);
    }

    [Fact]
    public async Task An_answer_from_another_session_is_not_accepted()
    {
        using var store = new AgentStore();
        using var events = store.Events.Subscribe();
        var session = store.Sessions.Create();
        var other = store.Sessions.Create();
        var broker = NewBroker(store);
        var asking = broker.AskAsync(session.Id, "Confirm?", [], false, null, TestContext.Current.CancellationToken);
        var asked = Assert.IsType<QuestionAsked>(await NextEvent(events));

        Assert.Equal(AnswerResult.NotFound, broker.Answer(other.Id, asked.Question.Id, "yes"));
        Assert.False(asking.IsCompleted);

        broker.Answer(session.Id, asked.Question.Id, "yes");
        Assert.Equal("yes", await asking);
    }

    [Fact]
    public async Task Cancelling_the_run_closes_its_question()
    {
        using var store = new AgentStore();
        using var events = store.Events.Subscribe();
        var session = store.Sessions.Create();
        var broker = NewBroker(store);
        using var cancel = new CancellationTokenSource();
        var asking = broker.AskAsync(session.Id, "Confirm?", [], false, null, cancel.Token);
        await NextEvent(events);

        await cancel.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => asking);
        Assert.Null(store.Sessions.Get(session.Id)!.PendingQuestion);
    }

    [Fact]
    public void A_question_left_open_by_an_earlier_run_of_the_app_starts_a_new_run_when_answered()
    {
        using var store = new AgentStore();
        var session = store.Sessions.Create();
        // As after a restart: stored on the session, but no run is waiting.
        store.Sessions.SetPendingQuestion(session.Id, new PendingQuestion("q-old", "Confirm?", [], false, 1));
        var broker = NewBroker(store);

        Assert.Equal(AnswerResult.NotFound, broker.Answer(session.Id, "q-other", "yes"));
        Assert.Equal(AnswerResult.StartNewRun, broker.Answer(session.Id, "q-old", "yes"));
        Assert.Null(store.Sessions.Get(session.Id)!.PendingQuestion);
    }

    [Fact]
    public async Task The_tool_asks_through_the_broker_and_reports_the_answer()
    {
        using var store = new AgentStore();
        using var events = store.Events.Subscribe();
        var session = store.Sessions.Create();
        var broker = NewBroker(store);
        var tool = new AskUserTool(broker);
        using var input = JsonDocument.Parse("""{"question":"Buy now?","options":["Yes","No",""," "],"multi_select":false}""");

        var call = tool.InvokeAsync(input.RootElement, new ToolContext(session.Id, "m", "toolu_1"), TestContext.Current.CancellationToken);
        var asked = Assert.IsType<QuestionAsked>(await NextEvent(events));
        broker.Answer(session.Id, asked.Question.Id, "No");
        var outcome = await call;

        Assert.Equal("Buy now?", asked.Question.Question);
        Assert.Equal(["Yes", "No"], asked.Question.Options);
        Assert.Equal(ToolCallStatus.Succeeded, outcome.Status);
        Assert.Contains("No", outcome.Content, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("""{"question":""}""")]
    [InlineData("""{"question":42}""")]
    public async Task The_tool_refuses_a_call_without_a_question(string json)
    {
        using var store = new AgentStore();
        var tool = new AskUserTool(NewBroker(store));
        using var input = JsonDocument.Parse(json);

        var outcome = await tool.InvokeAsync(input.RootElement, new ToolContext("s", "m", "toolu_1"), TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Failed, outcome.Status);
    }

    private static QuestionBroker NewBroker(AgentStore store) => new(store.Sessions, store.Events, TimeProvider.System);

    private static async Task<AgentEvent> NextEvent(IAgentEventSubscription subscription) =>
        await subscription.Reader.ReadAsync(TestContext.Current.CancellationToken).AsTask().WaitAsync(TimeSpan.FromSeconds(10), TestContext.Current.CancellationToken);
}
