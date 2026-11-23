using System.Text.Json;
using TradingAgent.Agent.Models;
using TradingAgent.Core.Agent;

namespace TradingAgent.Agent.Tools;

/// <summary>Which run a tool call belongs to. Tools and gates use it instead of ambient state.</summary>
/// <param name="SessionId">The session the reply is written in.</param>
/// <param name="MessageId">The reply the call belongs to.</param>
/// <param name="ToolUseId">The model provider's id for the call.</param>
public sealed record ToolContext(string SessionId, string MessageId, string ToolUseId);

/// <summary>What a tool call produced.</summary>
/// <param name="Content">What the model reads: the result, or why there is none.</param>
/// <param name="Status">
/// <see cref="ToolCallStatus.Succeeded"/>, <see cref="ToolCallStatus.Failed"/> or
/// <see cref="ToolCallStatus.Denied"/>. Never <see cref="ToolCallStatus.Running"/>.
/// </param>
/// <param name="SummaryJson">A short JSON value for the chat screen, or null for none.</param>
public sealed record ToolOutcome(string Content, ToolCallStatus Status = ToolCallStatus.Succeeded, string? SummaryJson = null)
{
    public static ToolOutcome Failed(string reason) => new(reason, ToolCallStatus.Failed);

    public static ToolOutcome Denied(string reason) => new(reason, ToolCallStatus.Denied);
}

/// <summary>Something the model can call.</summary>
public interface ITool
{
    ToolDefinition Definition { get; }

    /// <summary>Longest the tool may run; the host's default when null. A tool that waits for a person needs more.</summary>
    TimeSpan? Timeout => null;

    /// <summary>
    /// Runs the tool. <paramref name="input"/> is a JSON object; it was produced by a model, so every
    /// member may be missing or of the wrong kind. Report a bad input as a failed outcome, and let
    /// unexpected exceptions escape: the host turns them into a failed outcome too.
    /// </summary>
    Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken);
}

/// <summary>What a gate decided about a tool call.</summary>
/// <param name="Allowed">False refuses the call.</param>
/// <param name="Reason">Why the call was refused, in words the model and the user both read.</param>
/// <param name="Input">
/// When set, the arguments the tool is called with instead of the model's. A gate uses this to set
/// values the model must not choose, such as a client order id. It must stay readable after the gate
/// returns: use <see cref="JsonElement.Clone"/>, not an element of a document the gate disposes.
/// </param>
public sealed record GateDecision(bool Allowed, string? Reason = null, JsonElement? Input = null)
{
    public static GateDecision Allow { get; } = new(true);

    public static GateDecision Deny(string reason) => new(false, reason);
}

/// <summary>Checks a tool call before it runs. The risk gate for trading tools is one.</summary>
/// <remarks>
/// Fail closed: a gate that throws refuses the call. Gates run in registration order and the first
/// refusal wins.
/// </remarks>
public interface IToolGate
{
    ValueTask<GateDecision> CheckAsync(string toolName, JsonElement input, ToolContext context, CancellationToken cancellationToken);
}
