using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;

namespace TradingAgent.Agent.Mcp;

/// <summary>A tool call that arrived over the Model Context Protocol.</summary>
/// <param name="Name">The tool's name, as this server listed it.</param>
/// <param name="Arguments">The arguments, a JSON object.</param>
/// <param name="ToolUseId">The model provider's id of the call when the client passed it along; null otherwise.</param>
public sealed record McpToolCall(string Name, JsonElement Arguments, string? ToolUseId);

/// <summary>
/// Offers this app's tools to a Model Context Protocol client: the Claude Code command line, which
/// runs the model when the user signs in with a subscription.
/// </summary>
/// <remarks>
/// The other half of <see cref="McpClient"/>: the same three requests, answered instead of asked.
/// It decides nothing about a tool call itself. Every call is handed to the function it was given,
/// which goes through the tool host and with that through the risk gate.
/// </remarks>
public sealed partial class McpToolServer
{
    /// <summary>Under this key Claude Code tells a server which tool call of the model a request belongs to.</summary>
    internal const string ToolUseIdKey = "claudecode/toolUseId";

    private readonly Func<IReadOnlyList<ToolDefinition>> _listTools;
    private readonly Func<McpToolCall, CancellationToken, Task<ToolOutcome>> _callTool;
    private readonly string _name;
    private readonly string _version;
    private readonly ILogger _logger;

    /// <param name="listTools">Returns the tools to offer right now.</param>
    /// <param name="callTool">Runs one tool call. May be called for several calls at once.</param>
    /// <param name="name">The server's name, told to the client.</param>
    /// <param name="version">The app's version, told to the client.</param>
    /// <param name="logger">Receives protocol problems. Never tool arguments or results.</param>
    public McpToolServer(
        Func<IReadOnlyList<ToolDefinition>> listTools,
        Func<McpToolCall, CancellationToken, Task<ToolOutcome>> callTool,
        string name,
        string version,
        ILogger logger)
    {
        ArgumentNullException.ThrowIfNull(listTools);
        ArgumentNullException.ThrowIfNull(callTool);
        ArgumentNullException.ThrowIfNull(logger);
        _listTools = listTools;
        _callTool = callTool;
        _name = name;
        _version = version;
        _logger = logger;
    }

    /// <summary>
    /// Answers the client's requests until it closes the connection or <paramref name="cancellationToken"/>
    /// is cancelled. Tool calls run side by side; the client matches answers to requests by id.
    /// </summary>
    public async Task ServeAsync(IMcpTransport transport, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(transport);
        using var sendLock = new SemaphoreSlim(1, 1);
        var calls = new List<Task>();
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var message = await transport.ReceiveAsync(cancellationToken).ConfigureAwait(false);
                if (message is null)
                {
                    break;
                }

                if (message.Length == 0)
                {
                    continue;
                }

                calls.RemoveAll(call => call.IsCompleted);
                calls.Add(HandleAsync(message, transport, sendLock, cancellationToken));
            }
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException or InvalidOperationException)
        {
            // The connection ended.
        }

        // Answers still on their way have nowhere to go once the caller closes the connection.
        await Task.WhenAll(calls).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
    }

    private static string Text(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;

    private static async Task SendAsync(IMcpTransport transport, SemaphoreSlim sendLock, Action<Utf8JsonWriter> write, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            write(writer);
        }

        var message = Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
        await sendLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await transport.SendAsync(message, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            sendLock.Release();
        }
    }

    private static Task ReplyAsync(
        IMcpTransport transport,
        SemaphoreSlim sendLock,
        string rawId,
        Action<Utf8JsonWriter> writeResult,
        CancellationToken cancellationToken) =>
        SendAsync(
            transport,
            sendLock,
            writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("jsonrpc", "2.0");
                writer.WritePropertyName("id");
                writer.WriteRawValue(rawId);
                writer.WritePropertyName("result");
                writeResult(writer);
                writer.WriteEndObject();
            },
            cancellationToken);

    private static Task RefuseAsync(IMcpTransport transport, SemaphoreSlim sendLock, string rawId, int code, string reason, CancellationToken cancellationToken) =>
        SendAsync(
            transport,
            sendLock,
            writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("jsonrpc", "2.0");
                writer.WritePropertyName("id");
                writer.WriteRawValue(rawId);
                writer.WriteStartObject("error");
                writer.WriteNumber("code", code);
                writer.WriteString("message", reason);
                writer.WriteEndObject();
                writer.WriteEndObject();
            },
            cancellationToken);

    private async Task HandleAsync(string message, IMcpTransport transport, SemaphoreSlim sendLock, CancellationToken cancellationToken)
    {
        try
        {
            JsonDocument document;
            try
            {
                document = JsonDocument.Parse(message);
            }
            catch (JsonException)
            {
                LogNotJson(_logger, message.Length);
                return;
            }

            using (document)
            {
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("method", out var methodElement))
                {
                    return; // not a request: this server asks the client nothing, so nothing is owed an answer
                }

                if (!root.TryGetProperty("id", out var id))
                {
                    return; // a notification
                }

                var rawId = id.GetRawText();
                var parameters = root.TryGetProperty("params", out var given) ? given : default;
                switch (methodElement.GetString())
                {
                    case "initialize":
                        // The client's revision is echoed: the three requests served here are the
                        // same in every revision.
                        var revision = Text(parameters, "protocolVersion") is { Length: > 0 } asked ? asked : McpClient.ProtocolVersion;
                        await ReplyAsync(
                            transport,
                            sendLock,
                            rawId,
                            writer =>
                            {
                                writer.WriteStartObject();
                                writer.WriteString("protocolVersion", revision);
                                writer.WriteStartObject("capabilities");
                                writer.WriteStartObject("tools");
                                writer.WriteEndObject();
                                writer.WriteEndObject();
                                writer.WriteStartObject("serverInfo");
                                writer.WriteString("name", _name);
                                writer.WriteString("version", _version);
                                writer.WriteEndObject();
                                writer.WriteEndObject();
                            },
                            cancellationToken).ConfigureAwait(false);
                        break;

                    case "ping":
                        await ReplyAsync(
                            transport,
                            sendLock,
                            rawId,
                            writer =>
                            {
                                writer.WriteStartObject();
                                writer.WriteEndObject();
                            },
                            cancellationToken).ConfigureAwait(false);
                        break;

                    case "tools/list":
                        var tools = _listTools();
                        await ReplyAsync(
                            transport,
                            sendLock,
                            rawId,
                            writer =>
                            {
                                writer.WriteStartObject();
                                writer.WriteStartArray("tools");
                                foreach (var tool in tools)
                                {
                                    writer.WriteStartObject();
                                    writer.WriteString("name", tool.Name);
                                    writer.WriteString("description", tool.Description);
                                    writer.WritePropertyName("inputSchema");
                                    writer.WriteRawValue(tool.InputSchemaJson);
                                    writer.WriteEndObject();
                                }

                                writer.WriteEndArray();
                                writer.WriteEndObject();
                            },
                            cancellationToken).ConfigureAwait(false);
                        break;

                    case "tools/call":
                        await CallAsync(parameters, transport, sendLock, rawId, cancellationToken).ConfigureAwait(false);
                        break;

                    default:
                        await RefuseAsync(transport, sendLock, rawId, -32601, "Method not found", cancellationToken).ConfigureAwait(false);
                        break;
                }
            }
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException or InvalidOperationException)
        {
            // The connection went away while the answer was written. The client is gone with it.
        }
    }

    private async Task CallAsync(JsonElement parameters, IMcpTransport transport, SemaphoreSlim sendLock, string rawId, CancellationToken cancellationToken)
    {
        var name = Text(parameters, "name");
        if (name.Length == 0)
        {
            await RefuseAsync(transport, sendLock, rawId, -32602, "The tool call names no tool.", cancellationToken).ConfigureAwait(false);
            return;
        }

        // Cloned: the tool runs after the request's document is gone.
        JsonElement arguments;
        if (parameters.TryGetProperty("arguments", out var given) && given.ValueKind == JsonValueKind.Object)
        {
            arguments = given.Clone();
        }
        else
        {
            using var empty = JsonDocument.Parse("{}");
            arguments = empty.RootElement.Clone();
        }

        var toolUseId = parameters.TryGetProperty("_meta", out var meta) && Text(meta, ToolUseIdKey) is { Length: > 0 } id ? id : null;

        ToolOutcome outcome;
        try
        {
            outcome = await _callTool(new McpToolCall(name, arguments, toolUseId), cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The tool host turns a tool's exceptions into outcomes; this is the net under it.
            LogCallFailed(_logger, name, ex);
            outcome = ToolOutcome.Failed("The tool failed.");
        }

        await ReplyAsync(
            transport,
            sendLock,
            rawId,
            writer =>
            {
                writer.WriteStartObject();
                writer.WriteStartArray("content");
                writer.WriteStartObject();
                writer.WriteString("type", "text");
                writer.WriteString("text", outcome.Content);
                writer.WriteEndObject();
                writer.WriteEndArray();
                // A refusal is a failure to the model too: it must not read "denied" as a result.
                writer.WriteBoolean("isError", outcome.Status != ToolCallStatus.Succeeded);
                writer.WriteEndObject();
            },
            cancellationToken).ConfigureAwait(false);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The tool client sent {Length} characters that are not a protocol message; ignored.")]
    private static partial void LogNotJson(ILogger logger, int length);

    [LoggerMessage(Level = LogLevel.Error, Message = "Tool '{Tool}' threw past the tool host; the call was answered as failed.")]
    private static partial void LogCallFailed(ILogger logger, string tool, Exception exception);
}

/// <summary>Carries protocol messages over a stream, one JSON document per line.</summary>
public sealed class StreamTransport : IMcpTransport
{
    private static readonly UTF8Encoding _utf8 = new(encoderShouldEmitUTF8Identifier: false);

    private readonly Stream _stream;
    private readonly StreamReader _reader;
    private readonly StreamWriter _writer;

    /// <param name="stream">A stream that can be read and written, such as a connected pipe. The transport owns it.</param>
    public StreamTransport(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);
        _stream = stream;
        _reader = new StreamReader(stream, _utf8, detectEncodingFromByteOrderMarks: false, bufferSize: 4096, leaveOpen: true);
        _writer = new StreamWriter(stream, _utf8, bufferSize: 4096, leaveOpen: true) { NewLine = "\n" };
    }

    public async Task SendAsync(string message, CancellationToken cancellationToken)
    {
        await _writer.WriteLineAsync(message.AsMemory(), cancellationToken).ConfigureAwait(false);
        await _writer.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<string?> ReceiveAsync(CancellationToken cancellationToken) =>
        await _reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);

    public async ValueTask DisposeAsync()
    {
        _reader.Dispose();
        try
        {
            await _writer.DisposeAsync().ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException)
        {
            // The other side closed first; there was nothing left to flush to it.
        }

        await _stream.DisposeAsync().ConfigureAwait(false);
    }
}
