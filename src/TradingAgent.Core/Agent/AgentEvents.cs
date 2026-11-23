using System.Threading.Channels;

namespace TradingAgent.Core.Agent;

/// <summary>Something that happened in a session. Screens and services follow sessions through these.</summary>
/// <remarks>Replaces the WebSocket events of the previous app. Every event names its session.</remarks>
public abstract record AgentEvent(string SessionId);

/// <summary>A session was created, renamed, ended or deleted: the list of sessions is out of date.</summary>
public sealed record SessionChanged(string SessionId) : AgentEvent(SessionId);

/// <summary>A message was written in one piece, or a reply was started.</summary>
public sealed record MessageAdded(string SessionId, SessionMessage Message) : AgentEvent(SessionId);

/// <summary>An existing message changed, for example a tool call of it received its result.</summary>
public sealed record MessageUpdated(string SessionId, SessionMessage Message) : AgentEvent(SessionId);

/// <summary>The agent began to write the reply <paramref name="MessageId"/>.</summary>
public sealed record RunStarted(string SessionId, string MessageId) : AgentEvent(SessionId);

/// <summary>More text of the reply. Not stored one by one: the message row holds the whole text.</summary>
public sealed record TextDelta(string SessionId, string MessageId, string Text) : AgentEvent(SessionId);

/// <summary>More of the model's reasoning summary.</summary>
public sealed record ThinkingDelta(string SessionId, string MessageId, string Text) : AgentEvent(SessionId);

public sealed record ToolCallStarted(string SessionId, ToolCall Call) : AgentEvent(SessionId);

public sealed record ToolCallFinished(string SessionId, ToolCall Call) : AgentEvent(SessionId);

/// <summary>The agent waits for the user's answer.</summary>
public sealed record QuestionAsked(string SessionId, PendingQuestion Question) : AgentEvent(SessionId);

/// <summary>The question was answered, timed out or was cancelled.</summary>
public sealed record QuestionClosed(string SessionId, string QuestionId) : AgentEvent(SessionId);

public sealed record UsageReported(string SessionId, string MessageId, long InputTokens, long OutputTokens)
    : AgentEvent(SessionId);

/// <summary>The reply ended. <paramref name="Status"/> is never <see cref="MessageStatus.Running"/>.</summary>
public sealed record RunFinished(string SessionId, string MessageId, MessageStatus Status, string? Error)
    : AgentEvent(SessionId);

/// <summary>Carries <see cref="AgentEvent"/>s from whatever produces them to whoever listens.</summary>
public interface IAgentEvents
{
    /// <summary>Hands the event to every current subscriber. Never blocks and never throws.</summary>
    void Publish(AgentEvent agentEvent);

    /// <summary>Starts listening. Events published from now on are queued, in order, until read.</summary>
    IAgentEventSubscription Subscribe();
}

/// <summary>One listener's queue of events. Dispose it to stop listening.</summary>
public interface IAgentEventSubscription : IDisposable
{
    ChannelReader<AgentEvent> Reader { get; }
}

/// <summary>The in-process <see cref="IAgentEvents"/>: each subscriber has its own unbounded queue.</summary>
/// <remarks>
/// A queue, not a callback, so that a slow or failing listener cannot delay a run, and so that a screen
/// reads events on its own thread in the order they happened.
/// </remarks>
public sealed class AgentEventHub : IAgentEvents
{
    private readonly Lock _sync = new();

    // Replaced, never changed in place, so Publish can read it without the lock.
    private Subscription[] _subscriptions = [];

    public void Publish(AgentEvent agentEvent)
    {
        ArgumentNullException.ThrowIfNull(agentEvent);
        // Lock-free on purpose: the array is replaced as a whole, so a reader sees the old list or the
        // new one, never a half-changed one.
        // ReSharper disable once InconsistentlySynchronizedField
        foreach (var subscription in Volatile.Read(ref _subscriptions))
        {
            subscription.Write(agentEvent);
        }
    }

    public IAgentEventSubscription Subscribe()
    {
        var subscription = new Subscription(this);
        lock (_sync)
        {
            _subscriptions = [.. _subscriptions, subscription];
        }

        return subscription;
    }

    private void Remove(Subscription subscription)
    {
        lock (_sync)
        {
            _subscriptions = [.. _subscriptions.Where(existing => !ReferenceEquals(existing, subscription))];
        }
    }

    private sealed class Subscription(AgentEventHub hub) : IAgentEventSubscription
    {
        private readonly Channel<AgentEvent> _channel = Channel.CreateUnbounded<AgentEvent>(
            new UnboundedChannelOptions { SingleReader = true });

        public ChannelReader<AgentEvent> Reader => _channel.Reader;

        // False after Dispose completed the channel; a late event is dropped, which is what a listener
        // that stopped listening expects.
        public void Write(AgentEvent agentEvent) => _channel.Writer.TryWrite(agentEvent);

        public void Dispose()
        {
            hub.Remove(this);
            _channel.Writer.TryComplete();
        }
    }
}
