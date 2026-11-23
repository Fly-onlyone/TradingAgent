using System.Collections.Concurrent;
using TradingAgent.Core;
using TradingAgent.Core.Agent;
using TradingAgent.Data.Agent;

namespace TradingAgent.Agent.Tools;

/// <summary>What became of an answer the user gave.</summary>
public enum AnswerResult
{
    /// <summary>The agent was waiting and continues with the answer.</summary>
    Delivered,

    /// <summary>
    /// The question was still open but the run that asked it is gone (the app was restarted). The
    /// caller starts a new run with the answer as the user's message.
    /// </summary>
    StartNewRun,

    /// <summary>No such question is open in that session.</summary>
    NotFound,
}

/// <summary>
/// Lets a run ask the user something and wait. The open question is stored on its session, so a
/// screen opened later still shows it, and it survives a restart of the app.
/// </summary>
public sealed class QuestionBroker(AgentSessionRepository sessions, IAgentEvents events, TimeProvider time)
{
    /// <summary>How long a run waits for an answer before it goes on without one.</summary>
    public static readonly TimeSpan AnswerTimeout = TimeSpan.FromMinutes(5);

    private readonly ConcurrentDictionary<string, Waiter> _waiters = new(StringComparer.Ordinal);

    /// <summary>
    /// Asks and waits. Returns the answer, or null when nobody answered within <paramref name="timeout"/>.
    /// A cancelled wait closes the question: the run that asked no longer wants the answer.
    /// </summary>
    /// <exception cref="OperationCanceledException">The run was cancelled while waiting.</exception>
    public async Task<string?> AskAsync(
        string sessionId,
        string question,
        IReadOnlyList<string> options,
        bool multiSelect,
        TimeSpan? timeout,
        CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var pending = new PendingQuestion(Ids.NewId(now), question, options, multiSelect, now.ToUnixTimeMilliseconds());
        var waiter = new Waiter(sessionId);
        _waiters[pending.Id] = waiter;

        sessions.SetPendingQuestion(sessionId, pending);
        events.Publish(new QuestionAsked(sessionId, pending));
        try
        {
            return await waiter.Answer.Task.WaitAsync(timeout ?? AnswerTimeout, time, cancellationToken).ConfigureAwait(false);
        }
        catch (TimeoutException)
        {
            return null;
        }
        finally
        {
            // Only if the answer did not already close it: Answer() clears the stored question itself.
            if (_waiters.TryRemove(pending.Id, out _))
            {
                sessions.SetPendingQuestion(sessionId, null);
                events.Publish(new QuestionClosed(sessionId, pending.Id));
            }
        }
    }

    /// <summary>Hands the user's answer to the run that asked, or says what the caller must do instead.</summary>
    public AnswerResult Answer(string sessionId, string questionId, string answer)
    {
        ArgumentNullException.ThrowIfNull(answer);

        if (_waiters.TryGetValue(questionId, out var waiter))
        {
            if (waiter.SessionId != sessionId)
            {
                return AnswerResult.NotFound; // an answer must come from the session that was asked
            }

            if (_waiters.TryRemove(questionId, out _))
            {
                sessions.SetPendingQuestion(sessionId, null);
                events.Publish(new QuestionClosed(sessionId, questionId));
                waiter.Answer.TrySetResult(answer);
                return AnswerResult.Delivered;
            }
        }

        if (sessions.Get(sessionId)?.PendingQuestion?.Id == questionId)
        {
            sessions.SetPendingQuestion(sessionId, null);
            events.Publish(new QuestionClosed(sessionId, questionId));
            return AnswerResult.StartNewRun;
        }

        return AnswerResult.NotFound;
    }

    private sealed class Waiter(string sessionId)
    {
        public string SessionId { get; } = sessionId;

        public TaskCompletionSource<string> Answer { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }
}
