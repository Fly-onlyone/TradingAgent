using TradingAgent.Core.Agent;

namespace TradingAgent.Agent.Runs;

/// <summary>What a runtime needs to write one reply.</summary>
public sealed record RunContext
{
    public required string SessionId { get; init; }

    /// <summary>The reply being written.</summary>
    public required string MessageId { get; init; }

    /// <summary>What the user just said.</summary>
    public required string UserText { get; init; }

    /// <summary>The session's messages before this one, oldest first, as the chat shows them.</summary>
    public IReadOnlyList<SessionMessage> EarlierMessages { get; init; } = [];

    /// <summary>
    /// True when the session's stored conversation belongs to another provider or sign-in mode and
    /// cannot be sent to this runtime. The runtime then starts over from <see cref="EarlierMessages"/>.
    /// </summary>
    public bool RuntimeChanged { get; init; }
}

/// <summary>How a runtime's work on a reply ended.</summary>
/// <param name="Status">Complete or failed. Cancellation is signalled by the exception, not here.</param>
/// <param name="Error">Why it failed, in words for the user.</param>
public sealed record RunOutcome(MessageStatus Status, string? Error = null)
{
    public static RunOutcome Complete { get; } = new(MessageStatus.Complete);

    public static RunOutcome Failed(string error) => new(MessageStatus.Failed, error);
}

/// <summary>Produces a reply: either this app's own loop over a model API, or the Claude Code CLI.</summary>
public interface IAgentRuntime
{
    /// <summary>The model's id or name, shown with the reply.</summary>
    string Model { get; }

    /// <summary>
    /// Writes the reply through <paramref name="recorder"/>.
    /// </summary>
    /// <exception cref="OperationCanceledException">The token was cancelled.</exception>
    /// <exception cref="Models.ModelException">The model could not be called; the message is for the user.</exception>
    Task<RunOutcome> ExecuteAsync(RunContext context, RunRecorder recorder, CancellationToken cancellationToken);
}

/// <summary>Builds the instructions every run starts with.</summary>
public interface ISystemPrompt
{
    /// <summary>
    /// The system prompt. It must be the same text for every call of a session: it is part of the
    /// cached prefix of each request, and a changed prefix is paid for in full again. Nothing that
    /// changes between calls (the time, account state) belongs in it.
    /// </summary>
    string Build();
}

/// <summary>What came of a request to start a run.</summary>
public enum RunResultKind
{
    /// <summary>A reply was written; it may still have failed or been cancelled (see its status).</summary>
    Finished,

    /// <summary>The session is already writing a reply.</summary>
    Busy,

    /// <summary>The session does not exist.</summary>
    SessionNotFound,
}

/// <param name="Kind">What happened.</param>
/// <param name="Reply">The assistant message as stored at the end; null unless finished.</param>
public sealed record RunResult(RunResultKind Kind, SessionMessage? Reply = null);
