using System.ClientModel;
using System.ClientModel.Primitives;
using System.Text;
using System.Text.Json;
using OpenAI;
using OpenAI.Chat;
using TradingAgent.Core.Agent;

namespace TradingAgent.Agent.Models;

/// <summary>Calls OpenAI models through the official package (Chat Completions, streaming).</summary>
/// <remarks>
/// A transcript item is one message in the Chat Completions shape, reduced to what this app uses:
/// <c>{"role":"user","content":...}</c>, <c>{"role":"assistant","content":...,"tool_calls":[{"id","name","arguments"}]}</c>
/// and <c>{"role":"tool","tool_call_id":...,"content":...}</c>. Unlike Claude, these models return
/// nothing that must be echoed back byte for byte, so the items are this client's own JSON.
/// </remarks>
public sealed class OpenAiModelClient : IModelClient
{
    private readonly Func<string?> _apiKey;
    private readonly OpenAIClientOptions _options;

    /// <param name="http">Shared client used as the transport.</param>
    /// <param name="apiKey">Returns the key at the time of a call, or null when none is saved.</param>
    /// <param name="endpoint">The API root; the public API when null.</param>
    public OpenAiModelClient(HttpClient http, Func<string?> apiKey, Uri? endpoint = null)
    {
        ArgumentNullException.ThrowIfNull(http);
        ArgumentNullException.ThrowIfNull(apiKey);
        _apiKey = apiKey;
        _options = new OpenAIClientOptions { Transport = new HttpClientPipelineTransport(http) };
        if (endpoint is not null)
        {
            _options.Endpoint = endpoint;
        }
    }

    public string Provider => AgentWire.OpenAi;

    public async Task<ModelTurn> StreamAsync(ModelRequest request, IModelStreamSink sink, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(sink);

        var key = _apiKey();
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new ModelException(ModelFailure.SignIn, "No OpenAI API key is saved. Add one in Settings.");
        }

        var client = new ChatClient(request.Model, new ApiKeyCredential(key), _options);
        var messages = BuildMessages(request);
        var options = new ChatCompletionOptions();
#pragma warning disable OPENAI001 // The package marks reasoning effort as experimental; there is no other way to set it.
        options.ReasoningEffortLevel = new ChatReasoningEffortLevel(ModelCatalog.OpenAiEffort(request.Effort));
#pragma warning restore OPENAI001
        foreach (var tool in request.Tools)
        {
            options.Tools.Add(ChatTool.CreateFunctionTool(tool.Name, tool.Description, BinaryData.FromString(tool.InputSchemaJson)));
        }

        var text = new StringBuilder();
        var calls = new SortedDictionary<int, PendingCall>();
        ChatFinishReason? finishReason = null;
        long inputTokens = 0;
        long outputTokens = 0;
        string? model = null;

        try
        {
            await foreach (var update in client.CompleteChatStreamingAsync(messages, options, cancellationToken).ConfigureAwait(false))
            {
                model ??= update.Model;
                foreach (var part in update.ContentUpdate)
                {
                    if (!string.IsNullOrEmpty(part.Text))
                    {
                        text.Append(part.Text);
                        sink.Text(part.Text);
                    }
                }

                foreach (var callUpdate in update.ToolCallUpdates)
                {
                    if (!calls.TryGetValue(callUpdate.Index, out var call))
                    {
                        calls[callUpdate.Index] = call = new PendingCall();
                    }

                    // The id and the name arrive once, the arguments in pieces.
                    call.Id ??= callUpdate.ToolCallId;
                    call.Name ??= callUpdate.FunctionName;
                    if (callUpdate.FunctionArgumentsUpdate is { } piece && !piece.ToMemory().IsEmpty)
                    {
                        call.Arguments.Append(piece.ToString());
                    }
                }

                finishReason = update.FinishReason ?? finishReason;
                if (update.Usage is { } usage)
                {
                    inputTokens = usage.InputTokenCount;
                    outputTokens = usage.OutputTokenCount;
                }
            }
        }
        catch (ClientResultException ex)
        {
            throw FromStatus(ex.Status, ex);
        }
        catch (Exception ex) when (ex is HttpRequestException or IOException)
        {
            throw new ModelException(ModelFailure.Network, "OpenAI could not be reached. Check the internet connection.", ex);
        }

        if (finishReason is null)
        {
            throw new ModelException(ModelFailure.Network, "The connection to OpenAI ended before the answer was complete.");
        }

        var toolRequests = new List<ToolRequest>();
        var position = 0;
        foreach (var call in calls.Values)
        {
            var arguments = call.Arguments.Length == 0 ? "{}" : call.Arguments.ToString();
            // An id is required to answer the call; a provider that omits it gets a stable made-up one.
            toolRequests.Add(new ToolRequest(call.Id ?? $"call_{position}", call.Name ?? string.Empty, arguments));
            position++;
        }

        var answer = text.ToString();
        string[] items = answer.Length == 0 && toolRequests.Count == 0 ? [] : [AssistantItem(answer, toolRequests)];

        return new ModelTurn
        {
            StopReason = MapFinishReason(finishReason.Value, toolRequests.Count),
            Text = answer,
            ToolRequests = toolRequests,
            TranscriptItems = items,
            InputTokens = inputTokens,
            OutputTokens = outputTokens,
            Model = model,
        };
    }

    public string UserItem(string text) => WriteJson(writer =>
    {
        writer.WriteStartObject();
        writer.WriteString("role", "user");
        writer.WriteString("content", text);
        writer.WriteEndObject();
    });

    public string AssistantTextItem(string text) => AssistantItem(text, []);

    public IReadOnlyList<string> ToolResultItems(IReadOnlyList<ToolResult> results)
    {
        ArgumentNullException.ThrowIfNull(results);
        var items = new List<string>(results.Count);
        foreach (var result in results)
        {
            items.Add(WriteJson(writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("role", "tool");
                writer.WriteString("tool_call_id", result.ToolUseId);
                // This API has no error flag on a tool result; the text says it.
                writer.WriteString("content", result.IsError ? $"Error: {result.Content}" : result.Content);
                writer.WriteEndObject();
            }));
        }

        return items;
    }

    internal static List<ChatMessage> BuildMessages(ModelRequest request)
    {
        var messages = new List<ChatMessage>(request.Transcript.Count + 1);
        if (request.SystemPrompt.Length > 0)
        {
            messages.Add(new SystemChatMessage(request.SystemPrompt));
        }

        foreach (var item in request.Transcript)
        {
            using var document = JsonDocument.Parse(item);
            var root = document.RootElement;
            var content = root.TryGetProperty("content", out var contentProperty) && contentProperty.ValueKind == JsonValueKind.String
                ? contentProperty.GetString() ?? string.Empty
                : string.Empty;

            switch (root.GetProperty("role").GetString())
            {
                case "user":
                    messages.Add(new UserChatMessage(content));
                    break;

                case "tool":
                    messages.Add(new ToolChatMessage(root.GetProperty("tool_call_id").GetString(), content));
                    break;

                case "assistant":
                    var toolCalls = new List<ChatToolCall>();
                    if (root.TryGetProperty("tool_calls", out var callsProperty) && callsProperty.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var call in callsProperty.EnumerateArray())
                        {
                            toolCalls.Add(ChatToolCall.CreateFunctionToolCall(
                                call.GetProperty("id").GetString(),
                                call.GetProperty("name").GetString(),
                                BinaryData.FromString(call.GetProperty("arguments").GetString() ?? "{}")));
                        }
                    }

                    if (toolCalls.Count == 0)
                    {
                        messages.Add(new AssistantChatMessage(content));
                    }
                    else
                    {
                        var assistant = new AssistantChatMessage(toolCalls);
                        if (content.Length > 0)
                        {
                            assistant.Content.Add(ChatMessageContentPart.CreateTextPart(content));
                        }

                        messages.Add(assistant);
                    }

                    break;

                default:
                    break; // an item of a kind this client never writes
            }
        }

        return messages;
    }

    private static string AssistantItem(string text, List<ToolRequest> toolRequests) => WriteJson(writer =>
    {
        writer.WriteStartObject();
        writer.WriteString("role", "assistant");
        writer.WriteString("content", text);
        if (toolRequests.Count > 0)
        {
            writer.WriteStartArray("tool_calls");
            foreach (var request in toolRequests)
            {
                writer.WriteStartObject();
                writer.WriteString("id", request.Id);
                writer.WriteString("name", request.Name);
                writer.WriteString("arguments", request.InputJson);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
        }

        writer.WriteEndObject();
    });

    private static StopReason MapFinishReason(ChatFinishReason finishReason, int toolRequests)
    {
        if (toolRequests > 0)
        {
            // Whatever the reason given, calls that were made need answers before the next request.
            return StopReason.ToolUse;
        }

        return finishReason switch
        {
            ChatFinishReason.Length => StopReason.MaxTokens,
            ChatFinishReason.ContentFilter => StopReason.Refused,
            _ => StopReason.EndTurn,
        };
    }

    private static ModelException FromStatus(int status, Exception inner) => status switch
    {
        401 => new ModelException(ModelFailure.SignIn, "OpenAI rejected the API key. Check the key in Settings.", inner),
        403 => new ModelException(ModelFailure.SignIn, "This OpenAI API key is not allowed to use the selected model.", inner),
        429 => new ModelException(ModelFailure.RateLimited, "OpenAI's rate limit or quota was reached. Try again later.", inner),
        >= 500 => new ModelException(ModelFailure.Overloaded, "OpenAI has a problem right now. Try again in a moment.", inner),
        0 => new ModelException(ModelFailure.Network, "OpenAI could not be reached. Check the internet connection.", inner),
        _ => new ModelException(ModelFailure.Rejected, $"OpenAI rejected the request: {Shorten(inner.Message)}", inner),
    };

    private static string Shorten(string text) => text.Length <= 300 ? text : string.Concat(text.AsSpan(0, 300), "...");

    private static string WriteJson(Action<Utf8JsonWriter> write)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            write(writer);
        }

        return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
    }

    private sealed class PendingCall
    {
        public string? Id { get; set; }

        public string? Name { get; set; }

        public StringBuilder Arguments { get; } = new();
    }
}
