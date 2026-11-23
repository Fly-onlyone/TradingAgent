using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace TradingAgent.Agent.Mcp;

/// <summary>A tool a Model Context Protocol server offers.</summary>
/// <param name="Name">The server's name for it.</param>
/// <param name="Description">What it does, written by the server for a model.</param>
/// <param name="InputSchemaJson">JSON Schema of its arguments.</param>
/// <param name="ReadOnly">
/// The server's own statement on whether the tool only reads (<c>annotations.readOnlyHint</c>); null
/// when it makes none. A hint, not a guarantee: use it to distrust a tool, never to trust one.
/// </param>
public sealed record McpTool(string Name, string Description, string InputSchemaJson, bool? ReadOnly = null);

/// <summary>What a tool call returned.</summary>
/// <param name="Text">The text blocks of the result, joined by line breaks.</param>
/// <param name="IsError">True when the server marked the result as a failure of the tool.</param>
public sealed record McpCallResult(string Text, bool IsError);

/// <summary>The server refused a request, or the connection failed.</summary>
public sealed class McpException : Exception
{
    public McpException(string message, int? code = null, Exception? innerException = null)
        : base(message, innerException)
    {
        Code = code;
    }

    public McpException()
        : this("The request to the tool server failed.")
    {
    }

    public McpException(string message)
        : this(message, code: null)
    {
    }

    public McpException(string message, Exception innerException)
        : this(message, null, innerException)
    {
    }

    /// <summary>The JSON-RPC error code; null when the failure is not an error reply.</summary>
    public int? Code { get; }
}

/// <summary>Carries JSON-RPC messages to and from a server, one JSON document per message.</summary>
public interface IMcpTransport : IAsyncDisposable
{
    Task SendAsync(string message, CancellationToken cancellationToken);

    /// <summary>The next message, or null when the server closed the connection.</summary>
    Task<string?> ReceiveAsync(CancellationToken cancellationToken);
}

/// <summary>
/// A client for the part of the Model Context Protocol this app uses: connect, list tools, call a tool.
/// </summary>
/// <remarks>
/// Hand-written instead of the official package because three requests are all that is needed, and
/// each dependency has to pass the Native AOT build. Messages are JSON-RPC 2.0. The server may send
/// requests of its own; <c>ping</c> is answered, anything else is declined, since this client offers
/// the server no capabilities.
/// </remarks>
public sealed partial class McpClient : IAsyncDisposable
{
    /// <summary>The protocol revision this client asks for. A server may answer with another it supports.</summary>
    public const string ProtocolVersion = "2025-06-18";

    private readonly IMcpTransport _transport;
    private readonly ILogger _logger;
    private readonly TimeSpan _requestTimeout;
    private readonly ConcurrentDictionary<long, TaskCompletionSource<JsonElement>> _pending = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly CancellationTokenSource _closing = new();
    private readonly Task _reader;
    private long _nextId;
    private volatile bool _closed;

    /// <param name="transport">The connection. The client owns it and disposes it.</param>
    /// <param name="logger">Receives protocol problems. Never tool arguments or results.</param>
    /// <param name="requestTimeout">Longest wait for the reply to one request; one minute when null.</param>
    public McpClient(IMcpTransport transport, ILogger logger, TimeSpan? requestTimeout = null)
    {
        ArgumentNullException.ThrowIfNull(transport);
        ArgumentNullException.ThrowIfNull(logger);
        _transport = transport;
        _logger = logger;
        _requestTimeout = requestTimeout ?? TimeSpan.FromMinutes(1);
        _reader = Task.Run(ReadLoopAsync);
    }

    /// <summary>Completes when the server closed the connection or the client was disposed.</summary>
    public Task Closed => _reader;

    /// <summary>Opens the session. Must be the first request. Returns the server's name and version.</summary>
    public async Task<string> InitializeAsync(string clientName, string clientVersion, CancellationToken cancellationToken)
    {
        var result = await RequestAsync(
            "initialize",
            writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("protocolVersion", ProtocolVersion);
                writer.WriteStartObject("capabilities");
                writer.WriteEndObject();
                writer.WriteStartObject("clientInfo");
                writer.WriteString("name", clientName);
                writer.WriteString("version", clientVersion);
                writer.WriteEndObject();
                writer.WriteEndObject();
            },
            cancellationToken).ConfigureAwait(false);

        // The server waits for this before it accepts other requests.
        await SendAsync(
            writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("jsonrpc", "2.0");
                writer.WriteString("method", "notifications/initialized");
                writer.WriteEndObject();
            },
            cancellationToken).ConfigureAwait(false);

        return result.TryGetProperty("serverInfo", out var info) && info.ValueKind == JsonValueKind.Object
            ? $"{Text(info, "name")} {Text(info, "version")}".Trim()
            : string.Empty;
    }

    /// <summary>Every tool the server offers, following its paging to the end.</summary>
    public async Task<IReadOnlyList<McpTool>> ListToolsAsync(CancellationToken cancellationToken)
    {
        var tools = new List<McpTool>();
        string? cursor = null;
        // A server that keeps returning a cursor must not keep this loop going for ever.
        for (var page = 0; page < 100; page++)
        {
            var pageCursor = cursor;
            var result = await RequestAsync(
                "tools/list",
                writer =>
                {
                    writer.WriteStartObject();
                    if (pageCursor is not null)
                    {
                        writer.WriteString("cursor", pageCursor);
                    }

                    writer.WriteEndObject();
                },
                cancellationToken).ConfigureAwait(false);

            if (result.TryGetProperty("tools", out var list) && list.ValueKind == JsonValueKind.Array)
            {
                foreach (var tool in list.EnumerateArray())
                {
                    var name = Text(tool, "name");
                    if (name.Length == 0)
                    {
                        continue;
                    }

                    var schema = tool.TryGetProperty("inputSchema", out var inputSchema) && inputSchema.ValueKind == JsonValueKind.Object
                        ? inputSchema.GetRawText()
                        : """{"type":"object","properties":{}}""";
                    bool? readOnly = tool.TryGetProperty("annotations", out var annotations)
                        && annotations.ValueKind == JsonValueKind.Object
                        && annotations.TryGetProperty("readOnlyHint", out var hint)
                        && hint.ValueKind is JsonValueKind.True or JsonValueKind.False
                            ? hint.GetBoolean()
                            : null;
                    tools.Add(new McpTool(name, Text(tool, "description"), schema, readOnly));
                }
            }

            cursor = result.TryGetProperty("nextCursor", out var next) && next.ValueKind == JsonValueKind.String ? next.GetString() : null;
            if (string.IsNullOrEmpty(cursor))
            {
                break;
            }
        }

        return tools;
    }

    /// <summary>Calls a tool.</summary>
    /// <param name="name">The server's name for the tool.</param>
    /// <param name="argumentsJson">The arguments as a JSON object.</param>
    /// <param name="cancellationToken">Stops waiting. The server may still finish the call.</param>
    /// <exception cref="McpException">The server refused the request, did not answer in time, or the connection closed.</exception>
    public async Task<McpCallResult> CallToolAsync(string name, string argumentsJson, CancellationToken cancellationToken)
    {
        var result = await RequestAsync(
            "tools/call",
            writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("name", name);
                writer.WritePropertyName("arguments");
                // Written anew, not pasted in: a model may lay its arguments out over several
                // lines, and a message must stay on one.
                WriteJson(writer, argumentsJson);
                writer.WriteEndObject();
            },
            cancellationToken).ConfigureAwait(false);

        var text = new StringBuilder();
        if (result.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
        {
            foreach (var block in content.EnumerateArray())
            {
                if (text.Length > 0)
                {
                    text.Append('\n');
                }

                var type = Text(block, "type");
                text.Append(type == "text" ? Text(block, "text") : $"[{type} content is not shown]");
            }
        }

        var isError = result.TryGetProperty("isError", out var error) && error.ValueKind == JsonValueKind.True;
        return new McpCallResult(text.ToString(), isError);
    }

    /// <summary>
    /// Writes a JSON value given as text, without the line breaks and spaces it was laid out with.
    /// Digits of numbers are kept as they are.
    /// </summary>
    /// <exception cref="JsonException">The text is not JSON.</exception>
    internal static void WriteJson(Utf8JsonWriter writer, string json)
    {
        using var document = JsonDocument.Parse(json);
        document.RootElement.WriteTo(writer);
    }

    /// <summary>
    /// The transports send one message per line. A line break inside a message would cut it in two,
    /// and the other side would drop both halves without a word. Refused here, loudly.
    /// </summary>
    internal static void EnsureOneLine(string message)
    {
        if (message.AsSpan().IndexOfAny('\n', '\r') >= 0)
        {
            throw new InvalidOperationException("A protocol message must be one line; this one has a line break in it.");
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _closing.CancelAsync().ConfigureAwait(false);
        await _transport.DisposeAsync().ConfigureAwait(false);
        try
        {
            await _reader.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Expected: the reader was waiting for a message when it was told to stop.
        }

        _sendLock.Dispose();
        _closing.Dispose();
    }

    private static string Text(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;

    private async Task<JsonElement> RequestAsync(string method, Action<Utf8JsonWriter> writeParams, CancellationToken cancellationToken)
    {
        var id = Interlocked.Increment(ref _nextId);
        var reply = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = reply;
        try
        {
            // Checked after the request was registered: either the reader is still there to fail it
            // when the connection ends, or it has ended and that is seen here. Without this a request
            // made on a closed connection would wait out the whole timeout.
            if (_closed)
            {
                throw new McpException("The connection to the tool server is closed.");
            }

            await SendAsync(
                writer =>
                {
                    writer.WriteStartObject();
                    writer.WriteString("jsonrpc", "2.0");
                    writer.WriteNumber("id", id);
                    writer.WriteString("method", method);
                    writer.WritePropertyName("params");
                    writeParams(writer);
                    writer.WriteEndObject();
                },
                cancellationToken).ConfigureAwait(false);

            return await reply.Task.WaitAsync(_requestTimeout, cancellationToken).ConfigureAwait(false);
        }
        catch (TimeoutException ex)
        {
            throw new McpException($"The tool server did not answer '{method}' within {_requestTimeout.TotalSeconds:0} seconds.", null, ex);
        }
        finally
        {
            _pending.TryRemove(id, out _);
        }
    }

    private async Task SendAsync(Action<Utf8JsonWriter> write, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            write(writer);
        }

        var message = Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
        // One writer at a time: two messages written at once would interleave on the wire.
        try
        {
            await _sendLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (ObjectDisposedException ex)
        {
            throw new McpException("The connection to the tool server is closed.", null, ex);
        }

        try
        {
            await _transport.SendAsync(message, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or InvalidOperationException)
        {
            throw new McpException("The connection to the tool server is closed.", null, ex);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    private async Task ReadLoopAsync()
    {
        try
        {
            while (!_closing.IsCancellationRequested)
            {
                var message = await _transport.ReceiveAsync(_closing.Token).ConfigureAwait(false);
                if (message is null)
                {
                    break; // the server closed the connection
                }

                if (message.Length == 0)
                {
                    continue;
                }

                await HandleAsync(message).ConfigureAwait(false);
            }
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException or InvalidOperationException)
        {
            // The connection ended; pending requests are failed below.
        }
        finally
        {
            // Set before the requests are failed; see RequestAsync.
            _closed = true;
            foreach (var pending in _pending.Values)
            {
                pending.TrySetException(new McpException("The connection to the tool server closed before it answered."));
            }
        }
    }

    private async Task HandleAsync(string message)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(message);
        }
        catch (JsonException)
        {
            // Not a protocol message: a server that prints to its output by mistake. Skip the line.
            LogNotJson(_logger, message.Length);
            return;
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return;
            }

            var hasId = root.TryGetProperty("id", out var idElement);
            if (root.TryGetProperty("method", out var method))
            {
                if (hasId)
                {
                    await AnswerServerRequestAsync(idElement, method.GetString() ?? string.Empty).ConfigureAwait(false);
                }

                return; // a notification needs no answer
            }

            if (!hasId || !idElement.TryGetInt64(out var id) || !_pending.TryGetValue(id, out var reply))
            {
                return; // a reply to a request that already timed out
            }

            if (root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object)
            {
                var code = error.TryGetProperty("code", out var codeElement) && codeElement.TryGetInt32(out var parsed) ? parsed : (int?)null;
                reply.TrySetException(new McpException(Text(error, "message") is { Length: > 0 } text ? text : "The tool server refused the request.", code));
            }
            else if (root.TryGetProperty("result", out var result))
            {
                // Cloned: the document is disposed when this method returns.
                reply.TrySetResult(result.Clone());
            }
        }
    }

    private async Task AnswerServerRequestAsync(JsonElement id, string method)
    {
        var rawId = id.GetRawText();
        try
        {
            await SendAsync(
                writer =>
                {
                    writer.WriteStartObject();
                    writer.WriteString("jsonrpc", "2.0");
                    writer.WritePropertyName("id");
                    writer.WriteRawValue(rawId);
                    if (method == "ping")
                    {
                        writer.WriteStartObject("result");
                        writer.WriteEndObject();
                    }
                    else
                    {
                        writer.WriteStartObject("error");
                        writer.WriteNumber("code", -32601);
                        writer.WriteString("message", "Method not found");
                        writer.WriteEndObject();
                    }

                    writer.WriteEndObject();
                },
                _closing.Token).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is McpException or OperationCanceledException)
        {
            // The connection is going away; the server will not miss the answer.
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The tool server sent {Length} characters that are not a protocol message; ignored.")]
    private static partial void LogNotJson(ILogger logger, int length);
}
