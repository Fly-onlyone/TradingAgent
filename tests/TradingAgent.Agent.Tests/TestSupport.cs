using System.Net;
using System.Text;
using Microsoft.Data.Sqlite;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using TradingAgent.Data;
using TradingAgent.Data.Agent;

namespace TradingAgent.Agent.Tests;

/// <summary>A database file in its own temporary folder, deleted when the test ends.</summary>
internal sealed class TempDatabase : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));

    public TempDatabase()
    {
        Directory.CreateDirectory(_folder);
        Database = new Database(Path.Combine(_folder, "test.db"));
        Database.Initialize();
    }

    public Database Database { get; }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(_folder, recursive: true);
        }
        catch (IOException)
        {
            // Another test's ClearAllPools may race this one; a leftover temp folder is harmless.
        }
    }
}

/// <summary>The stores and the event hub over one temporary database.</summary>
internal sealed class AgentStore : IDisposable
{
    private readonly TempDatabase _temp = new();

    public AgentStore()
    {
        Sessions = new AgentSessionRepository(_temp.Database, TimeProvider.System);
        Messages = new SessionMessageRepository(_temp.Database, TimeProvider.System);
        Transcript = new TranscriptRepository(_temp.Database, TimeProvider.System);
    }

    public AgentSessionRepository Sessions { get; }

    public SessionMessageRepository Messages { get; }

    public TranscriptRepository Transcript { get; }

    public AgentEventHub Events { get; } = new();

    public void Dispose() => _temp.Dispose();
}

/// <summary>Answers HTTP requests from a queue and remembers what was sent.</summary>
internal sealed class StubHttpHandler : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> _responses = new();

    public List<(HttpRequestMessage Request, string Body)> Requests { get; } = [];

    public StubHttpHandler Respond(HttpStatusCode status, string body, string contentType = "text/event-stream")
    {
        _responses.Enqueue(_ => new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, contentType) });
        return this;
    }

    public StubHttpHandler Respond(Func<HttpRequestMessage, HttpResponseMessage> response)
    {
        _responses.Enqueue(response);
        return this;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
        Requests.Add((request, body));
        return _responses.Count > 0
            ? _responses.Dequeue()(request)
            : throw new InvalidOperationException("The test did not queue a response for this request.");
    }
}

/// <summary>Collects what a model client streams.</summary>
internal sealed class CollectingSink : IModelStreamSink
{
    public StringBuilder TextSoFar { get; } = new();

    public StringBuilder ThinkingSoFar { get; } = new();

    public List<string> TextDeltas { get; } = [];

    public void Text(string delta)
    {
        TextDeltas.Add(delta);
        TextSoFar.Append(delta);
    }

    public void Thinking(string delta) => ThinkingSoFar.Append(delta);
}

/// <summary>A model that plays back prepared turns and records the requests it was sent.</summary>
internal sealed class ScriptedModel : IModelClient
{
    private readonly Queue<Func<ModelRequest, IModelStreamSink, CancellationToken, Task<ModelTurn>>> _turns = new();

    public List<ModelRequest> Requests { get; } = [];

    public string Provider { get; init; } = AgentWire.Anthropic;

    /// <summary>Queues a turn that streams <paramref name="text"/> and ends the answer.</summary>
    public ScriptedModel Says(string text, long inputTokens = 10, long outputTokens = 5) =>
        Then((_, sink, _) =>
        {
            sink.Text(text);
            return Task.FromResult(new ModelTurn
            {
                StopReason = StopReason.EndTurn,
                Text = text,
                TranscriptItems = [AssistantTextItem(text)],
                InputTokens = inputTokens,
                OutputTokens = outputTokens,
                Model = "scripted-1",
            });
        });

    /// <summary>Queues a turn that asks for tools, optionally after some text.</summary>
    public ScriptedModel Calls(string text, params ToolRequest[] requests) =>
        Then((_, sink, _) =>
        {
            if (text.Length > 0)
            {
                sink.Text(text);
            }

            return Task.FromResult(new ModelTurn
            {
                StopReason = StopReason.ToolUse,
                Text = text,
                ToolRequests = requests,
                TranscriptItems = [$$"""{"role":"assistant","calls":[{{string.Join(',', requests.Select(request => $"\"{request.Id}\""))}}]}"""],
                InputTokens = 10,
                OutputTokens = 5,
                Model = "scripted-1",
            });
        });

    public ScriptedModel Then(Func<ModelRequest, IModelStreamSink, CancellationToken, Task<ModelTurn>> turn)
    {
        _turns.Enqueue(turn);
        return this;
    }

    public Task<ModelTurn> StreamAsync(ModelRequest request, IModelStreamSink sink, CancellationToken cancellationToken)
    {
        // The transcript list is reused by the loop; keep what it held at this call.
        Requests.Add(request with { Transcript = [.. request.Transcript] });
        return _turns.Count > 0
            ? _turns.Dequeue()(request, sink, cancellationToken)
            : throw new InvalidOperationException("The test did not script a turn for this call.");
    }

    public string UserItem(string text) => $$"""{"role":"user","text":"{{Encode(text)}}"}""";

    public string AssistantTextItem(string text) => $$"""{"role":"assistant","text":"{{Encode(text)}}"}""";

    // Items are stored in a column that accepts only valid JSON.
    private static string Encode(string text) => System.Text.Json.JsonEncodedText.Encode(text).ToString();

    public IReadOnlyList<string> ToolResultItems(IReadOnlyList<ToolResult> results) =>
        [$$"""{"role":"user","results":[{{string.Join(',', results.Select(result => $$"""{"id":"{{result.ToolUseId}}","error":{{(result.IsError ? "true" : "false")}}}"""))}}]}"""];
}

/// <summary>A tool whose behaviour a test sets.</summary>
internal sealed class FakeTool(string name, Func<System.Text.Json.JsonElement, ToolContext, CancellationToken, Task<ToolOutcome>> run) : ITool
{
    public FakeTool(string name, string result)
        : this(name, (_, _, _) => Task.FromResult(new ToolOutcome(result)))
    {
    }

    public List<string> Inputs { get; } = [];

    public ToolDefinition Definition { get; } = new(name, $"Test tool {name}", """{"type":"object","properties":{}}""");

    public TimeSpan? Timeout { get; init; }

    public Task<ToolOutcome> InvokeAsync(System.Text.Json.JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        lock (Inputs)
        {
            Inputs.Add(input.GetRawText());
        }

        return run(input, context, cancellationToken);
    }
}

internal sealed class FixedPrompt : ISystemPrompt
{
    public string Build() => "You are a test.";
}

/// <summary>Always resolves to the runtime a test built.</summary>
internal sealed class FixedResolver(ResolvedRuntime resolved) : IAgentRuntimeResolver
{
    public ResolvedRuntime Resolved { get; set; } = resolved;

    public ResolvedRuntime Resolve() => Resolved;
}
