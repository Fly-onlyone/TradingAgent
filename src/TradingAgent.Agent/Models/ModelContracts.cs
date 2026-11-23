namespace TradingAgent.Agent.Models;

/// <summary>A tool as the model sees it.</summary>
/// <param name="Name">Letters, digits, underscores and hyphens, at most 64 characters (both providers' rule).</param>
/// <param name="Description">What the tool does and when to use it.</param>
/// <param name="InputSchemaJson">A JSON Schema object for the arguments.</param>
public sealed record ToolDefinition(string Name, string Description, string InputSchemaJson);

/// <summary>One call of the model: the conversation so far and what the model may do next.</summary>
public sealed record ModelRequest
{
    /// <summary>The provider's own model id, for example <c>claude-sonnet-5-5</c>.</summary>
    public required string Model { get; init; }

    public required string SystemPrompt { get; init; }

    /// <summary>The conversation as provider JSON items, oldest first. Sent as they are.</summary>
    public required IReadOnlyList<string> Transcript { get; init; }

    public IReadOnlyList<ToolDefinition> Tools { get; init; } = [];

    /// <summary>How hard the model should think: <c>low</c>, <c>medium</c>, <c>high</c>, <c>xhigh</c> or <c>max</c>.</summary>
    public string Effort { get; init; } = "high";
}

/// <summary>Why the model stopped.</summary>
public enum StopReason
{
    /// <summary>The model finished its answer.</summary>
    EndTurn,

    /// <summary>The model asks for tools; run them and call it again.</summary>
    ToolUse,

    /// <summary>The answer hit the output limit and is cut off.</summary>
    MaxTokens,

    /// <summary>The provider paused a long turn; call again with the transcript to continue.</summary>
    Paused,

    /// <summary>The model or a safety system declined the request.</summary>
    Refused,
}

/// <summary>A tool the model asked for.</summary>
/// <param name="Id">The provider's id for the call; the result must carry it.</param>
/// <param name="Name">The tool's name.</param>
/// <param name="InputJson">The arguments as a JSON object.</param>
public sealed record ToolRequest(string Id, string Name, string InputJson);

/// <summary>The result of one tool call, on its way back to the model.</summary>
public sealed record ToolResult(string ToolUseId, string Content, bool IsError);

/// <summary>What one call of the model produced.</summary>
public sealed record ModelTurn
{
    public required StopReason StopReason { get; init; }

    /// <summary>The visible text of this call.</summary>
    public string Text { get; init; } = string.Empty;

    public IReadOnlyList<ToolRequest> ToolRequests { get; init; } = [];

    /// <summary>
    /// The model's output as provider JSON items, to append to the transcript unchanged. Empty when the
    /// call produced nothing that belongs in the conversation.
    /// </summary>
    public IReadOnlyList<string> TranscriptItems { get; init; } = [];

    /// <summary>Tokens read by this call, cached ones included.</summary>
    public long InputTokens { get; init; }

    public long OutputTokens { get; init; }

    /// <summary>The model that answered. Differs from the requested one after a provider-side fallback.</summary>
    public string? Model { get; init; }
}

/// <summary>Receives the model's output while it is produced.</summary>
public interface IModelStreamSink
{
    void Text(string delta);

    /// <summary>A piece of the model's reasoning summary.</summary>
    void Thinking(string delta);
}

/// <summary>Talks to one model provider.</summary>
public interface IModelClient
{
    /// <summary><c>anthropic</c> or <c>openai</c>. A transcript written by one provider's client is only valid for it.</summary>
    string Provider { get; }

    /// <summary>Calls the model once and streams its output to <paramref name="sink"/>.</summary>
    /// <exception cref="ModelException">The call failed; the exception says why in words for the user.</exception>
    /// <exception cref="OperationCanceledException">The token was cancelled.</exception>
    Task<ModelTurn> StreamAsync(ModelRequest request, IModelStreamSink sink, CancellationToken cancellationToken);

    /// <summary>A user message as a transcript item.</summary>
    string UserItem(string text);

    /// <summary>An earlier assistant answer, known only as text, as a transcript item.</summary>
    string AssistantTextItem(string text);

    /// <summary>
    /// The results of the tool calls of the last turn as transcript items. Every tool call of that turn
    /// must have a result here: both providers reject a conversation with an unanswered tool call.
    /// </summary>
    IReadOnlyList<string> ToolResultItems(IReadOnlyList<ToolResult> results);
}

/// <summary>What went wrong with a model call, by what the user can do about it.</summary>
public enum ModelFailure
{
    /// <summary>The key is missing, wrong or not allowed to use the model.</summary>
    SignIn,

    /// <summary>Too many requests or the usage limit was reached.</summary>
    RateLimited,

    /// <summary>The provider is overloaded or has an internal error.</summary>
    Overloaded,

    /// <summary>The provider could not be reached.</summary>
    Network,

    /// <summary>The provider rejected the request itself. Retrying the same request will not help.</summary>
    Rejected,
}

/// <summary>A model call failed. <see cref="Exception.Message"/> is written for the user.</summary>
public sealed class ModelException : Exception
{
    public ModelException(ModelFailure failure, string message, Exception? innerException = null)
        : base(message, innerException)
    {
        Failure = failure;
    }

    public ModelException()
        : this(ModelFailure.Rejected, "The model call failed.")
    {
    }

    public ModelException(string message)
        : this(ModelFailure.Rejected, message)
    {
    }

    public ModelException(string message, Exception innerException)
        : this(ModelFailure.Rejected, message, innerException)
    {
    }

    public ModelFailure Failure { get; }
}
