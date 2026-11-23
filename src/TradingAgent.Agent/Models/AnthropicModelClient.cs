using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using TradingAgent.Core.Agent;

namespace TradingAgent.Agent.Models;

/// <summary>Calls Claude through the Anthropic Messages API, streaming.</summary>
/// <remarks>
/// Written against the HTTP API, not the official C# package: that package serializes by reflection and
/// cannot be published with Native AOT (about 3,800 trim/AOT warnings with version 13.12.0). Everything
/// here uses <see cref="Utf8JsonWriter"/>, <see cref="JsonDocument"/> and <see cref="JsonNode"/>, which
/// need no reflection.
/// <para>
/// A transcript item is one message object of the API (<c>{"role": ..., "content": [...]}</c>). The
/// content blocks the model produced are stored as received: the API requires thinking blocks and tool
/// calls to come back unchanged.
/// </para>
/// </remarks>
public sealed partial class AnthropicModelClient : IModelClient
{
    /// <summary>The API version this client was written for. A newer one may change request rules.</summary>
    public const string ApiVersion = "2026-10-21";

    /// <summary>
    /// Room for one answer. Large because a streamed answer cannot hit an HTTP timeout, and a cut-off
    /// answer costs a retry.
    /// </summary>
    public const int MaxOutputTokens = 64_000;

    private const string RefusalFallbackBeta = "server-side-fallback-2026-07-01";
    private const int MaxRetries = 2;
    private static readonly TimeSpan _longestRetryWait = TimeSpan.FromSeconds(30);
    private static readonly Uri _defaultEndpoint = new("https://api.anthropic.com/v1/messages");

    private readonly HttpClient _http;
    private readonly Func<string?> _apiKey;
    private readonly TimeProvider _time;
    private readonly ILogger<AnthropicModelClient> _logger;
    private readonly Uri _endpoint;

    /// <param name="http">Shared client. Its timeout must allow for a slow first byte of a long answer.</param>
    /// <param name="apiKey">Returns the key at the time of a call, or null when none is saved.</param>
    /// <param name="time">Clock for the waits between retries.</param>
    /// <param name="logger">Receives retries. Never the key and never message content.</param>
    /// <param name="endpoint">The Messages endpoint; the public API when null.</param>
    public AnthropicModelClient(
        HttpClient http,
        Func<string?> apiKey,
        TimeProvider time,
        ILogger<AnthropicModelClient> logger,
        Uri? endpoint = null)
    {
        ArgumentNullException.ThrowIfNull(http);
        ArgumentNullException.ThrowIfNull(apiKey);
        ArgumentNullException.ThrowIfNull(time);
        ArgumentNullException.ThrowIfNull(logger);
        _http = http;
        _apiKey = apiKey;
        _time = time;
        _logger = logger;
        _endpoint = endpoint ?? _defaultEndpoint;
    }

    public string Provider => AgentWire.Anthropic;

    public async Task<ModelTurn> StreamAsync(ModelRequest request, IModelStreamSink sink, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(sink);

        var key = _apiKey();
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new ModelException(ModelFailure.SignIn, "No Anthropic API key is saved. Add one in Settings.");
        }

        var body = BuildRequestBody(request);
        using var response = await SendWithRetriesAsync(request.Model, key, body, cancellationToken).ConfigureAwait(false);
        var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        await using (stream.ConfigureAwait(false))
        {
            try
            {
                return await ReadTurnAsync(stream, sink, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is IOException or HttpRequestException)
            {
                throw new ModelException(ModelFailure.Network, "The connection to Anthropic was lost while the answer was arriving.", ex);
            }
            catch (JsonException ex)
            {
                throw new ModelException(ModelFailure.Overloaded, "Anthropic sent an answer that could not be read.", ex);
            }
        }
    }

    public string UserItem(string text) => TextMessage("user", text);

    public string AssistantTextItem(string text) => TextMessage("assistant", text);

    public IReadOnlyList<string> ToolResultItems(IReadOnlyList<ToolResult> results)
    {
        ArgumentNullException.ThrowIfNull(results);
        if (results.Count == 0)
        {
            return [];
        }

        // All results of one turn go into one user message: the API reads results split over several
        // messages as separate turns, and the model then stops asking for tools in parallel.
        return
        [
            WriteJson(writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("role", "user");
                writer.WriteStartArray("content");
                foreach (var result in results)
                {
                    writer.WriteStartObject();
                    writer.WriteString("type", "tool_result");
                    writer.WriteString("tool_use_id", result.ToolUseId);
                    writer.WriteString("content", result.Content.Length == 0 ? "(no output)" : result.Content);
                    if (result.IsError)
                    {
                        writer.WriteBoolean("is_error", true);
                    }

                    writer.WriteEndObject();
                }

                writer.WriteEndArray();
                writer.WriteEndObject();
            }),
        ];
    }

    internal static byte[] BuildRequestBody(ModelRequest request)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteString("model", request.Model);
            writer.WriteNumber("max_tokens", MaxOutputTokens);
            writer.WriteBoolean("stream", true);

            if (request.SystemPrompt.Length > 0)
            {
                writer.WriteStartArray("system");
                writer.WriteStartObject();
                writer.WriteString("type", "text");
                writer.WriteString("text", request.SystemPrompt);
                writer.WriteEndObject();
                writer.WriteEndArray();
            }

            // The model decides when and how much to think; the summary is asked for because the default
            // on current models is to return no thinking text at all.
            writer.WriteStartObject("thinking");
            writer.WriteString("type", "adaptive");
            writer.WriteString("display", "summarized");
            writer.WriteEndObject();

            writer.WriteStartObject("output_config");
            writer.WriteString("effort", request.Effort);
            writer.WriteEndObject();

            if (request.Tools.Count > 0)
            {
                writer.WriteStartArray("tools");
                foreach (var tool in request.Tools)
                {
                    writer.WriteStartObject();
                    writer.WriteString("name", tool.Name);
                    writer.WriteString("description", tool.Description);
                    writer.WritePropertyName("input_schema");
                    writer.WriteRawValue(tool.InputSchemaJson);
                    writer.WriteEndObject();
                }

                writer.WriteEndArray();
            }

            // Caches the conversation so far (tools, system prompt and messages are a prefix of the
            // next request). Only an unchanged prefix is a cache hit: keep the tool order and the
            // system prompt stable.
            writer.WriteStartObject("cache_control");
            writer.WriteString("type", "ephemeral");
            writer.WriteEndObject();

            if (ModelCatalog.SupportsRefusalFallback(request.Model))
            {
                // When a safety system declines, the API retries on a fallback model inside this call.
                writer.WriteString("fallbacks", "default");
            }

            writer.WriteStartArray("messages");
            foreach (var item in request.Transcript)
            {
                writer.WriteRawValue(item);
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }

        return buffer.ToArray();
    }

    private static string TextMessage(string role, string text) => WriteJson(writer =>
    {
        writer.WriteStartObject();
        writer.WriteString("role", role);
        writer.WriteStartArray("content");
        writer.WriteStartObject();
        writer.WriteString("type", "text");
        writer.WriteString("text", text);
        writer.WriteEndObject();
        writer.WriteEndArray();
        writer.WriteEndObject();
    });

    private static string WriteJson(Action<Utf8JsonWriter> write)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            write(writer);
        }

        return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
    }

    private static async Task<ModelTurn> ReadTurnAsync(Stream stream, IModelStreamSink sink, CancellationToken cancellationToken)
    {
        var blocks = new SortedDictionary<int, Block>();
        string? stopReason = null;
        string? model = null;
        long inputTokens = 0;
        long outputTokens = 0;

        await foreach (var sse in SseReader.ReadAsync(stream, cancellationToken).ConfigureAwait(false))
        {
            using var document = JsonDocument.Parse(sse.Data);
            var root = document.RootElement;
            var type = root.TryGetProperty("type", out var typeProperty) ? typeProperty.GetString() : sse.Name;

            switch (type)
            {
                case "message_start":
                    if (root.TryGetProperty("message", out var message))
                    {
                        model = String(message, "model");
                        if (message.TryGetProperty("usage", out var startUsage))
                        {
                            // Cached tokens are read too; together they are what the call took in.
                            inputTokens = Int64(startUsage, "input_tokens")
                                + Int64(startUsage, "cache_creation_input_tokens")
                                + Int64(startUsage, "cache_read_input_tokens");
                            outputTokens = Int64(startUsage, "output_tokens");
                        }
                    }

                    break;

                case "content_block_start":
                    if (root.TryGetProperty("content_block", out var start) && start.ValueKind == JsonValueKind.Object)
                    {
                        blocks[Index(root)] = new Block(JsonNode.Parse(start.GetRawText())!.AsObject());
                    }

                    break;

                case "content_block_delta":
                    if (blocks.TryGetValue(Index(root), out var block) && root.TryGetProperty("delta", out var delta))
                    {
                        ApplyDelta(block, delta, sink);
                    }

                    break;

                case "message_delta":
                    if (root.TryGetProperty("delta", out var messageDelta))
                    {
                        stopReason = String(messageDelta, "stop_reason") ?? stopReason;
                    }

                    if (root.TryGetProperty("usage", out var deltaUsage) && deltaUsage.TryGetProperty("output_tokens", out _))
                    {
                        outputTokens = Int64(deltaUsage, "output_tokens"); // a running total, not an increment
                    }

                    break;

                case "error":
                    throw FromErrorBody(HttpStatusCode.OK, root);

                default:
                    break; // content_block_stop, message_stop, ping, and events added later
            }
        }

        if (stopReason is null)
        {
            // The stream ended without saying why: the answer is incomplete and must not be stored.
            throw new ModelException(ModelFailure.Network, "The connection to Anthropic ended before the answer was complete.");
        }

        var content = new JsonArray();
        var text = new StringBuilder();
        var toolRequests = new List<ToolRequest>();
        foreach (var block in blocks.Values)
        {
            // Typed as JsonNode: the generic Add<T> overload serializes by reflection and is not AOT-safe.
            JsonNode finished = block.Finish(out var toolRequest);
            content.Add(finished);
            if (toolRequest is not null)
            {
                toolRequests.Add(toolRequest);
            }

            if (block.Type == "text")
            {
                text.Append(block.Text);
            }
        }

        string[] items = content.Count == 0
            ? []
            : [new JsonObject { ["role"] = "assistant", ["content"] = content }.ToJsonString()];

        return new ModelTurn
        {
            StopReason = MapStopReason(stopReason, toolRequests.Count),
            Text = text.ToString(),
            ToolRequests = toolRequests,
            TranscriptItems = items,
            InputTokens = inputTokens,
            OutputTokens = outputTokens,
            Model = model,
        };
    }

    private static void ApplyDelta(Block block, JsonElement delta, IModelStreamSink sink)
    {
        switch (String(delta, "type"))
        {
            case "text_delta":
                var text = String(delta, "text") ?? string.Empty;
                block.Text.Append(text);
                if (text.Length > 0)
                {
                    sink.Text(text);
                }

                break;

            case "thinking_delta":
                var thinking = String(delta, "thinking") ?? string.Empty;
                block.Thinking.Append(thinking);
                if (thinking.Length > 0)
                {
                    sink.Thinking(thinking);
                }

                break;

            case "signature_delta":
                block.Signature.Append(String(delta, "signature"));
                break;

            case "input_json_delta":
                block.InputJson.Append(String(delta, "partial_json"));
                break;

            default:
                break; // a delta kind this client does not know leaves the block as it started
        }
    }

    private static StopReason MapStopReason(string stopReason, int toolRequests) => stopReason switch
    {
        "tool_use" => StopReason.ToolUse,
        "max_tokens" or "model_context_window_exceeded" => StopReason.MaxTokens,
        "pause_turn" => StopReason.Paused,
        "refusal" => StopReason.Refused,
        // Tool calls without the matching stop reason still need answers before the next request.
        _ => toolRequests > 0 ? StopReason.ToolUse : StopReason.EndTurn,
    };

    private async Task<HttpResponseMessage> SendWithRetriesAsync(string model, string key, byte[] body, CancellationToken cancellationToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, _endpoint);
            request.Headers.TryAddWithoutValidation("x-api-key", key);
            request.Headers.TryAddWithoutValidation("anthropic-version", ApiVersion);
            if (ModelCatalog.SupportsRefusalFallback(model))
            {
                request.Headers.TryAddWithoutValidation("anthropic-beta", RefusalFallbackBeta);
            }

            request.Content = new ByteArrayContent(body);
            request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");

            ModelException failure;
            TimeSpan? retryAfter = null;
            try
            {
                var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
                if (response.IsSuccessStatusCode)
                {
                    return response;
                }

                using (response)
                {
                    retryAfter = response.Headers.RetryAfter?.Delta;
                    var text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                    failure = FromErrorText(response.StatusCode, text);
                }
            }
            catch (HttpRequestException ex)
            {
                failure = new ModelException(ModelFailure.Network, "Anthropic could not be reached. Check the internet connection.", ex);
            }
            catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                // The HTTP client's own timeout, not the user's cancel.
                failure = new ModelException(ModelFailure.Network, "Anthropic did not answer in time.", ex);
            }

            var retryable = failure.Failure is ModelFailure.RateLimited or ModelFailure.Overloaded or ModelFailure.Network;
            if (!retryable || attempt >= MaxRetries)
            {
                throw failure;
            }

            var wait = retryAfter ?? TimeSpan.FromSeconds(1 << attempt);
            if (wait > _longestRetryWait)
            {
                // The provider asks for a longer pause than a person should wait in silence for.
                throw failure;
            }

            LogRetry(_logger, failure.Failure, attempt + 1, wait.TotalSeconds);
            await Task.Delay(wait, _time, cancellationToken).ConfigureAwait(false);
        }
    }

    private static ModelException FromErrorText(HttpStatusCode status, string text)
    {
        try
        {
            using var document = JsonDocument.Parse(text);
            return FromErrorBody(status, document.RootElement);
        }
        catch (JsonException)
        {
            return FromError(status, errorType: null, apiMessage: null);
        }
    }

    private static ModelException FromErrorBody(HttpStatusCode status, JsonElement root)
    {
        string? errorType = null;
        string? apiMessage = null;
        if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object)
        {
            errorType = String(error, "type");
            apiMessage = String(error, "message");
        }

        return FromError(status, errorType, apiMessage);
    }

    private static ModelException FromError(HttpStatusCode status, string? errorType, string? apiMessage)
    {
        var code = (int)status;
        return (errorType, code) switch
        {
            ("authentication_error", _) or (_, 401) =>
                new ModelException(ModelFailure.SignIn, "Anthropic rejected the API key. Check the key in Settings."),
            ("permission_error", _) or (_, 403) =>
                new ModelException(ModelFailure.SignIn, "This Anthropic API key is not allowed to use the selected model."),
            ("rate_limit_error", _) or (_, 429) =>
                new ModelException(ModelFailure.RateLimited, "Anthropic's rate limit was reached. Try again in a moment."),
            ("overloaded_error", _) or ("api_error", _) or (_, >= 500) =>
                new ModelException(ModelFailure.Overloaded, "Anthropic is overloaded or has a problem right now. Try again in a moment."),
            _ => new ModelException(
                ModelFailure.Rejected,
                string.IsNullOrWhiteSpace(apiMessage)
                    ? string.Create(CultureInfo.InvariantCulture, $"Anthropic rejected the request (HTTP {code}).")
                    : $"Anthropic rejected the request: {Shorten(apiMessage)}"),
        };
    }

    private static string Shorten(string text) => text.Length <= 300 ? text : string.Concat(text.AsSpan(0, 300), "...");

    private static int Index(JsonElement root) =>
        root.TryGetProperty("index", out var index) && index.TryGetInt32(out var value) ? value : 0;

    private static string? String(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static long Int64(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number)
            ? number
            : 0;

    [LoggerMessage(Level = LogLevel.Warning, Message = "Anthropic call failed ({Failure}); retry {Attempt} in {Seconds} s.")]
    private static partial void LogRetry(ILogger logger, ModelFailure failure, int attempt, double seconds);

    /// <summary>One content block of the answer, from its start event to its complete form.</summary>
    private sealed class Block(JsonObject start)
    {
        public string Type { get; } = start["type"]?.GetValue<string>() ?? string.Empty;

        public StringBuilder Text { get; } = new();

        public StringBuilder Thinking { get; } = new();

        public StringBuilder Signature { get; } = new();

        public StringBuilder InputJson { get; } = new();

        /// <summary>
        /// The block as it goes into the transcript. A block of a kind this client does not know is
        /// returned exactly as it started, so it still goes back to the API unchanged.
        /// </summary>
        public JsonObject Finish(out ToolRequest? toolRequest)
        {
            toolRequest = null;
            switch (Type)
            {
                case "text":
                    start["text"] = Text.ToString();
                    break;

                case "thinking":
                    start["thinking"] = Thinking.ToString();
                    if (Signature.Length > 0)
                    {
                        start["signature"] = Signature.ToString();
                    }

                    break;

                case "tool_use":
                    var raw = InputJson.Length == 0 ? "{}" : InputJson.ToString();
                    JsonNode? input = null;
                    try
                    {
                        input = JsonNode.Parse(raw);
                    }
                    catch (JsonException)
                    {
                        // Cut off or malformed. The transcript needs a valid object; the tool host gets
                        // the raw text and answers the model with an error result.
                    }

                    var valid = input is JsonObject;
                    start["input"] = valid ? input : new JsonObject();
                    toolRequest = new ToolRequest(
                        start["id"]?.GetValue<string>() ?? string.Empty,
                        start["name"]?.GetValue<string>() ?? string.Empty,
                        valid ? raw : InputJson.ToString());
                    break;

                default:
                    break;
            }

            return start;
        }
    }
}
