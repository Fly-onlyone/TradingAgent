namespace TradingAgent.Core.Agent;

/// <summary>What started a session.</summary>
public enum SessionKind
{
    /// <summary>The user chats with the agent.</summary>
    Chat,

    /// <summary>A scheduled task ran.</summary>
    TaskRun,

    /// <summary>A helper agent worked for another session.</summary>
    Subagent,
}

public enum MessageRole
{
    User,
    Assistant,
    System,
}

/// <summary>State of a message. Only an assistant message is ever anything but <see cref="Complete"/>.</summary>
public enum MessageStatus
{
    /// <summary>The reply is being produced.</summary>
    Running,
    Complete,

    /// <summary>The user stopped the reply. What was produced until then is kept.</summary>
    Cancelled,

    /// <summary>The reply ended with an error; <see cref="SessionMessage.Error"/> says why.</summary>
    Failed,
}

public enum ToolCallStatus
{
    Running,
    Succeeded,
    Failed,

    /// <summary>The risk gate refused the call. It never reached the exchange.</summary>
    Denied,
}

/// <summary>A question the agent asked the user and is waiting on.</summary>
/// <param name="CreatedAt">Unix milliseconds.</param>
public sealed record PendingQuestion(
    string Id,
    string Question,
    IReadOnlyList<string> Options,
    bool MultiSelect,
    long CreatedAt);

/// <summary>One conversation with the agent. Times are Unix milliseconds.</summary>
public sealed record AgentSession
{
    public required string Id { get; init; }

    public SessionKind Kind { get; init; }

    public string? Title { get; init; }

    public string? Description { get; init; }

    /// <summary>The Claude Code CLI's own id for this conversation, when that runtime is used.</summary>
    public string? SdkSessionId { get; init; }

    /// <summary>Model provider the stored transcript belongs to: <c>anthropic</c> or <c>openai</c>.</summary>
    public string? Provider { get; init; }

    /// <summary>Sign-in mode the stored transcript belongs to: <c>api_key</c> or <c>subscription</c>.</summary>
    public string? AuthMode { get; init; }

    public PendingQuestion? PendingQuestion { get; init; }

    public int TotalMessages { get; init; }

    public int UserMessages { get; init; }

    public int AssistantMessages { get; init; }

    public long TotalTokens { get; init; }

    /// <summary>False once the session was ended. An ended chat can be reopened by writing to it.</summary>
    public bool IsActive { get; init; }

    public long StartedAt { get; init; }

    public long? EndedAt { get; init; }

    public long? LastMessageAt { get; init; }
}

/// <summary>A message as a chat screen shows it. Times are Unix milliseconds.</summary>
public sealed record SessionMessage
{
    public required string Id { get; init; }

    public required string SessionId { get; init; }

    public MessageRole Role { get; init; }

    public required string Content { get; init; }

    /// <summary>Orders the messages of a session. Strictly increasing within one session.</summary>
    public long Timestamp { get; init; }

    public MessageStatus Status { get; init; }

    /// <summary>Why the reply failed, in words for the user. Null unless <see cref="Status"/> is failed.</summary>
    public string? Error { get; init; }

    public string? ThinkingContent { get; init; }

    public string? Model { get; init; }

    public long? InputTokens { get; init; }

    public long? OutputTokens { get; init; }

    public string? DecisionId { get; init; }

    public long CreatedAt { get; init; }

    public long UpdatedAt { get; init; }

    /// <summary>The tool calls of this message, in the order the model made them.</summary>
    public IReadOnlyList<ToolCall> ToolCalls { get; init; } = [];
}

/// <summary>One tool call of an assistant message. Times are Unix milliseconds.</summary>
public sealed record ToolCall
{
    public required string Id { get; init; }

    public required string MessageId { get; init; }

    public int Position { get; init; }

    /// <summary>The model provider's id for the call. Results are matched to calls by it.</summary>
    public required string ToolUseId { get; init; }

    public required string Name { get; init; }

    /// <summary>The arguments as a JSON object.</summary>
    public required string ArgumentsJson { get; init; }

    public ToolCallStatus Status { get; init; }

    /// <summary>A short JSON value for display. The order mirror also writes fill state here.</summary>
    public string? ResultSummaryJson { get; init; }

    public string? ResultJson { get; init; }

    public long? DurationMs { get; init; }

    public long CreatedAt { get; init; }

    public long UpdatedAt { get; init; }
}

/// <summary>One item of the conversation exactly as the model provider sent or received it.</summary>
public sealed record TranscriptItem(long Seq, string Provider, string? Model, string Json);

/// <summary>The names under which the enums of this namespace are stored.</summary>
public static class AgentWire
{
    public const string Anthropic = "anthropic";
    public const string OpenAi = "openai";
    public const string ApiKey = "api_key";
    public const string Subscription = "subscription";

    public static string Name(SessionKind kind) => kind switch
    {
        SessionKind.Chat => "chat",
        SessionKind.TaskRun => "task_run",
        SessionKind.Subagent => "subagent",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };

    public static string Name(MessageRole role) => role switch
    {
        MessageRole.User => "user",
        MessageRole.Assistant => "assistant",
        MessageRole.System => "system",
        _ => throw new ArgumentOutOfRangeException(nameof(role), role, null),
    };

    public static string Name(MessageStatus status) => status switch
    {
        MessageStatus.Running => "running",
        MessageStatus.Complete => "complete",
        MessageStatus.Cancelled => "cancelled",
        MessageStatus.Failed => "failed",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null),
    };

    public static string Name(ToolCallStatus status) => status switch
    {
        ToolCallStatus.Running => "running",
        ToolCallStatus.Succeeded => "succeeded",
        ToolCallStatus.Failed => "failed",
        ToolCallStatus.Denied => "denied",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null),
    };

    public static SessionKind ParseSessionKind(string name) => name switch
    {
        "chat" => SessionKind.Chat,
        "task_run" => SessionKind.TaskRun,
        "subagent" => SessionKind.Subagent,
        _ => throw new FormatException($"Unknown session kind '{name}'."),
    };

    public static MessageRole ParseMessageRole(string name) => name switch
    {
        "user" => MessageRole.User,
        "assistant" => MessageRole.Assistant,
        "system" => MessageRole.System,
        _ => throw new FormatException($"Unknown message role '{name}'."),
    };

    public static MessageStatus ParseMessageStatus(string name) => name switch
    {
        "running" => MessageStatus.Running,
        "complete" => MessageStatus.Complete,
        "cancelled" => MessageStatus.Cancelled,
        "failed" => MessageStatus.Failed,
        _ => throw new FormatException($"Unknown message status '{name}'."),
    };

    public static ToolCallStatus ParseToolCallStatus(string name) => name switch
    {
        "running" => ToolCallStatus.Running,
        "succeeded" => ToolCallStatus.Succeeded,
        "failed" => ToolCallStatus.Failed,
        "denied" => ToolCallStatus.Denied,
        _ => throw new FormatException($"Unknown tool call status '{name}'."),
    };
}
