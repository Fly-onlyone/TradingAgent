using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using TradingAgent.Data.Agent;

namespace TradingAgent.Agent.Runs;

/// <summary>
/// Records one reply while it is produced: keeps the message row and its tool calls up to date and
/// announces every change. A runtime writes through it and never touches the store or the events.
/// </summary>
/// <remarks>
/// Text arrives in small pieces. Each piece is announced at once, but the row is written only at
/// boundaries (a tool call, the end of a model call, the end of the run): the row is what survives a
/// crash, the events are what a screen follows.
/// </remarks>
public sealed class RunRecorder : IModelStreamSink
{
    /// <summary>Longest tool result kept with a tool call, in characters. The model saw all of it.</summary>
    public const int MaxStoredResultLength = 20_000;

    private const int SummaryLength = 200;

    private readonly SessionMessageRepository _messages;
    private readonly IAgentEvents _events;
    private readonly StringBuilder _text = new();
    private readonly StringBuilder _thinking = new();
    private long _inputTokens;
    private long _outputTokens;
    private string? _model;

    public RunRecorder(SessionMessageRepository messages, IAgentEvents events, SessionMessage reply)
    {
        ArgumentNullException.ThrowIfNull(messages);
        ArgumentNullException.ThrowIfNull(events);
        ArgumentNullException.ThrowIfNull(reply);
        _messages = messages;
        _events = events;
        SessionId = reply.SessionId;
        MessageId = reply.Id;
        _model = reply.Model;
    }

    public string SessionId { get; }

    public string MessageId { get; }

    public void Text(string delta)
    {
        if (string.IsNullOrEmpty(delta))
        {
            return;
        }

        _text.Append(delta);
        _events.Publish(new TextDelta(SessionId, MessageId, delta));
    }

    public void Thinking(string delta)
    {
        if (string.IsNullOrEmpty(delta))
        {
            return;
        }

        _thinking.Append(delta);
        _events.Publish(new ThinkingDelta(SessionId, MessageId, delta));
    }

    /// <summary>
    /// Call before each call of the model after the first. Text of separate model calls would run
    /// together ("...the price.Now I will") without a break between them.
    /// </summary>
    public void BeginNextStep()
    {
        if (_text.Length > 0 && _text[^1] != '\n')
        {
            Text("\n\n");
        }
    }

    /// <summary>Records that the model asked for a tool.</summary>
    public ToolCall StartTool(ToolRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        // The column holds JSON. Arguments that are not valid JSON are answered with an error by the
        // tool host; here they are kept as text so the user can see what the model sent.
        var call = _messages.AddToolCall(MessageId, request.Id, request.Name, IsJson(request.InputJson) ? request.InputJson : JsonString(request.InputJson));
        _events.Publish(new ToolCallStarted(SessionId, call));
        return call;
    }

    /// <summary>Records the outcome of a tool call. Safe to call from several threads.</summary>
    public void FinishTool(string toolUseId, ToolOutcome outcome, long? durationMs)
    {
        ArgumentNullException.ThrowIfNull(outcome);
        var summary = outcome.SummaryJson
            ?? (outcome.Status == ToolCallStatus.Succeeded ? null : JsonString(Shorten(outcome.Content, SummaryLength)));
        var call = _messages.FinishToolCall(
            MessageId,
            toolUseId,
            outcome.Status,
            summary,
            JsonString(Shorten(outcome.Content, MaxStoredResultLength)),
            durationMs);
        if (call is not null)
        {
            _events.Publish(new ToolCallFinished(SessionId, call));
        }
    }

    /// <summary>Adds the tokens of one model call and stores the reply as it stands.</summary>
    public void AddUsage(long inputTokens, long outputTokens, string? model)
    {
        _inputTokens += inputTokens;
        _outputTokens += outputTokens;
        _model = model ?? _model;
        _events.Publish(new UsageReported(SessionId, MessageId, _inputTokens, _outputTokens));
        Save(status: null, error: null);
    }

    /// <summary>Writes the reply as it stands, optionally with its final state. Returns it as stored.</summary>
    public SessionMessage? Save(MessageStatus? status, string? error)
    {
        var saved = _messages.UpdateAssistantMessage(
            MessageId,
            new AssistantMessageUpdate
            {
                Content = _text.ToString(),
                ThinkingContent = _thinking.Length == 0 ? null : _thinking.ToString(),
                Status = status,
                Error = error,
                Model = _model,
                InputTokens = _inputTokens,
                OutputTokens = _outputTokens,
            });
        if (saved is not null)
        {
            _events.Publish(new MessageUpdated(SessionId, saved));
        }

        return saved;
    }

    private static string Shorten(string text, int length) =>
        text.Length <= length ? text : string.Concat(text.AsSpan(0, length), "...");

    private static string JsonString(string text) =>
        string.Concat("\"", JsonEncodedText.Encode(text, JavaScriptEncoder.UnsafeRelaxedJsonEscaping).ToString(), "\"");

    private static bool IsJson(string text)
    {
        try
        {
            using var document = JsonDocument.Parse(text);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
