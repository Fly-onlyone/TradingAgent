using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Models;
using TradingAgent.Core.Agent;
using TradingAgent.Data.Agent;

namespace TradingAgent.Agent.Runs;

/// <summary>
/// Starts and ends a run: stores the user's message, opens the reply, lets a runtime write it, and
/// records how it ended. Every way a run can end (answer, failure, cancel, time limit) leaves a stored
/// reply with a final state and a <see cref="RunFinished"/> event.
/// </summary>
public sealed partial class AgentRunner(
    AgentSessionRepository sessions,
    SessionMessageRepository messages,
    IAgentEvents events,
    IAgentRuntimeResolver runtimes,
    ILogger<AgentRunner> logger)
{
    /// <summary>Longest a reply may take. A run that is still going after this is treated as stuck.</summary>
    public static readonly TimeSpan RunTimeout = TimeSpan.FromMinutes(20);

    /// <summary>How many earlier messages are handed to a runtime that has to start a session over.</summary>
    private const int HistoryLimit = 200;

    private readonly ConcurrentDictionary<string, CancellationTokenSource> _running = new(StringComparer.Ordinal);

    /// <summary>True while the session is writing a reply.</summary>
    public bool IsRunning(string sessionId) => _running.ContainsKey(sessionId);

    /// <summary>Asks the session's run to stop. Returns false if it is not running.</summary>
    public bool Cancel(string sessionId)
    {
        if (!_running.TryGetValue(sessionId, out var cancel))
        {
            return false;
        }

        try
        {
            cancel.Cancel();
        }
        catch (ObjectDisposedException)
        {
            // The run ended between the lookup and the cancel.
            return false;
        }

        return true;
    }

    /// <summary>
    /// Writes a reply to <paramref name="userText"/> in the session and returns when the reply has ended.
    /// One reply at a time per session: a second request while one runs is refused, not queued.
    /// </summary>
    /// <param name="sessionId">The session to write in.</param>
    /// <param name="userText">What the user said. Must not be blank.</param>
    /// <param name="cancellationToken">Cancels the run, like <see cref="Cancel"/>.</param>
    public async Task<RunResult> RunAsync(string sessionId, string userText, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userText);

        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        if (!_running.TryAdd(sessionId, cancel))
        {
            return new RunResult(RunResultKind.Busy);
        }

        try
        {
            var session = sessions.Get(sessionId);
            if (session is null)
            {
                return new RunResult(RunResultKind.SessionNotFound);
            }

            // Before the user's message is added: what a runtime that starts over is told happened so far.
            var earlier = messages.GetWindow(sessionId, HistoryLimit);

            var userMessage = messages.Append(sessionId, MessageRole.User, userText);
            events.Publish(new MessageAdded(sessionId, userMessage));
            events.Publish(new SessionChanged(sessionId));

            var resolved = runtimes.Resolve();
            var reply = messages.Append(sessionId, MessageRole.Assistant, string.Empty, MessageStatus.Running, resolved.Runtime?.Model);
            events.Publish(new MessageAdded(sessionId, reply));
            events.Publish(new RunStarted(sessionId, reply.Id));

            var recorder = new RunRecorder(messages, events, reply);
            var outcome = await ExecuteAsync(session, resolved, recorder, userText, earlier, cancel, cancellationToken).ConfigureAwait(false);

            var stored = recorder.Save(outcome.Status, outcome.Error);
            events.Publish(new RunFinished(sessionId, reply.Id, outcome.Status, outcome.Error));
            return new RunResult(RunResultKind.Finished, stored);
        }
        finally
        {
            _running.TryRemove(sessionId, out _);
        }
    }

    private async Task<RunOutcome> ExecuteAsync(
        AgentSession session,
        ResolvedRuntime resolved,
        RunRecorder recorder,
        string userText,
        IReadOnlyList<SessionMessage> earlier,
        CancellationTokenSource cancel,
        CancellationToken callerToken)
    {
        if (resolved.Runtime is null)
        {
            return RunOutcome.Failed(resolved.Problem ?? "No model is set up. Check Settings.");
        }

        var runtimeChanged = session.Provider != resolved.Provider || session.AuthMode != resolved.AuthMode;
        if (runtimeChanged)
        {
            sessions.SetRuntime(session.Id, resolved.Provider, resolved.AuthMode);
        }

        using var timeLimit = new CancellationTokenSource(RunTimeout);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancel.Token, timeLimit.Token);
        try
        {
            return await resolved.Runtime
                .ExecuteAsync(
                    new RunContext
                    {
                        SessionId = session.Id,
                        MessageId = recorder.MessageId,
                        UserText = userText,
                        EarlierMessages = earlier,
                        // A session that never ran has nothing stored to start over from.
                        RuntimeChanged = runtimeChanged && session.Provider is not null,
                    },
                    recorder,
                    linked.Token)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancel.IsCancellationRequested || callerToken.IsCancellationRequested)
        {
            return new RunOutcome(MessageStatus.Cancelled);
        }
        catch (OperationCanceledException) when (timeLimit.IsCancellationRequested)
        {
            return RunOutcome.Failed($"The reply took longer than {RunTimeout.TotalMinutes:0} minutes and was stopped.");
        }
        catch (ModelException ex)
        {
            LogModelFailed(logger, ex.Failure, ex);
            return RunOutcome.Failed(ex.Message);
        }
#pragma warning disable CA1031 // Whatever went wrong, the reply must end in a stored, visible failure.
        catch (Exception ex)
#pragma warning restore CA1031
        {
            LogRunFailed(logger, session.Id, ex);
            return RunOutcome.Failed("Something went wrong while writing the reply. The details are in the log.");
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The model call failed ({Failure}).")]
    private static partial void LogModelFailed(ILogger logger, ModelFailure failure, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "The run in session {SessionId} failed unexpectedly.")]
    private static partial void LogRunFailed(ILogger logger, string sessionId, Exception exception);
}
