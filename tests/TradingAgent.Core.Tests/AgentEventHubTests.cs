using TradingAgent.Core.Agent;
using Xunit;

namespace TradingAgent.Core.Tests;

public sealed class AgentEventHubTests
{
    private const string Session = "aaaaaaaaaaaaaaaaaaaaaaaa";

    [Fact]
    public void Every_subscriber_receives_the_events_in_the_order_they_were_published()
    {
        var hub = new AgentEventHub();
        using var first = hub.Subscribe();
        using var second = hub.Subscribe();

        hub.Publish(new RunStarted(Session, "m1"));
        hub.Publish(new TextDelta(Session, "m1", "Hel"));
        hub.Publish(new TextDelta(Session, "m1", "lo"));
        hub.Publish(new RunFinished(Session, "m1", MessageStatus.Complete, null));

        foreach (var subscription in new[] { first, second })
        {
            var events = Drain(subscription);
            Assert.Equal(4, events.Count);
            Assert.IsType<RunStarted>(events[0]);
            Assert.Equal(["Hel", "lo"], events.OfType<TextDelta>().Select(delta => delta.Text));
            Assert.Equal(MessageStatus.Complete, Assert.IsType<RunFinished>(events[3]).Status);
        }
    }

    [Fact]
    public void A_subscriber_sees_only_what_was_published_after_it_subscribed()
    {
        var hub = new AgentEventHub();
        hub.Publish(new SessionChanged(Session));

        using var late = hub.Subscribe();
        hub.Publish(new RunStarted(Session, "m1"));

        Assert.IsType<RunStarted>(Assert.Single(Drain(late)));
    }

    [Fact]
    public void A_disposed_subscription_ends_and_receives_nothing_more()
    {
        var hub = new AgentEventHub();
        var subscription = hub.Subscribe();
        using var other = hub.Subscribe();
        hub.Publish(new RunStarted(Session, "m1"));

        subscription.Dispose();
        hub.Publish(new RunFinished(Session, "m1", MessageStatus.Cancelled, null));
        subscription.Dispose(); // twice is harmless

        Assert.IsType<RunStarted>(Assert.Single(Drain(subscription)));
        Assert.True(subscription.Reader.Completion.IsCompleted);
        Assert.Equal(2, Drain(other).Count);
    }

    [Fact]
    public void Publishing_without_subscribers_does_nothing()
    {
        var hub = new AgentEventHub();

        hub.Publish(new SessionChanged(Session));

        using var subscription = hub.Subscribe();
        Assert.Empty(Drain(subscription));
    }

    [Fact]
    public async Task Events_published_from_many_threads_all_arrive()
    {
        var hub = new AgentEventHub();
        using var subscription = hub.Subscribe();

        await Task.WhenAll(Enumerable.Range(0, 8).Select(thread => Task.Run(
            () =>
            {
                for (var i = 0; i < 250; i++)
                {
                    hub.Publish(new TextDelta(Session, $"m{thread}", i.ToString(System.Globalization.CultureInfo.InvariantCulture)));
                }
            },
            TestContext.Current.CancellationToken)));

        var events = Drain(subscription).Cast<TextDelta>().ToList();
        Assert.Equal(2000, events.Count);
        // Within one publisher the order is kept.
        foreach (var perThread in events.GroupBy(delta => delta.MessageId))
        {
            Assert.Equal(Enumerable.Range(0, 250), perThread.Select(delta => int.Parse(delta.Text, System.Globalization.CultureInfo.InvariantCulture)));
        }
    }

    private static List<AgentEvent> Drain(IAgentEventSubscription subscription)
    {
        var events = new List<AgentEvent>();
        while (subscription.Reader.TryRead(out var agentEvent))
        {
            events.Add(agentEvent);
        }

        return events;
    }
}
