using System.Text.Json;

namespace TradingAgent.Agent.Cli;

/// <summary>Something Claude Code reported on its output while it ran a prompt.</summary>
public abstract record CliEvent;

/// <summary>The first line of a run: what Claude Code started with.</summary>
/// <param name="SessionId">Claude Code's id of the conversation; the next run resumes with it.</param>
/// <param name="Model">The model it uses.</param>
/// <param name="Tools">Every tool the model has, by the names the model sees.</param>
/// <param name="Servers">The tool servers it loaded, each with its state: <c>connected</c>, <c>pending</c>, <c>failed</c> and others.</param>
public sealed record CliInit(string SessionId, string Model, IReadOnlyList<string> Tools, IReadOnlyList<CliServer> Servers) : CliEvent;

/// <summary>A tool server as Claude Code reports it when it starts.</summary>
public sealed record CliServer(string Name, string Status);

/// <summary>The model began a new message. Several follow each other when it uses tools.</summary>
public sealed record CliMessageStart : CliEvent;

public sealed record CliTextDelta(string Text) : CliEvent;

public sealed record CliThinkingDelta(string Text) : CliEvent;

/// <summary>A finished piece of text of the model's message, as a whole.</summary>
public sealed record CliText(string Text) : CliEvent;

/// <summary>The model asked for a tool.</summary>
/// <param name="Id">The provider's id of the call.</param>
/// <param name="Name">The tool, by the name the model sees.</param>
public sealed record CliToolUse(string Id, string Name) : CliEvent;

/// <summary>A request to the model failed and is tried again.</summary>
/// <param name="Error">Why, as Claude Code names it: <c>authentication_failed</c>, <c>rate_limit</c>, <c>overloaded</c> and others.</param>
public sealed record CliRetry(string Error) : CliEvent;

/// <summary>The last line of a run.</summary>
/// <param name="IsError">True when the run did not end with an answer.</param>
/// <param name="Subtype"><c>success</c>, <c>error_max_turns</c>, <c>error_during_execution</c> and others.</param>
/// <param name="Text">The answer, or what went wrong.</param>
/// <param name="InputTokens">Tokens read by the model over the whole run, cached ones included.</param>
/// <param name="OutputTokens">Tokens written by the model over the whole run.</param>
public sealed record CliResult(bool IsError, string Subtype, string Text, long InputTokens, long OutputTokens) : CliEvent;

/// <summary>
/// Reads the lines Claude Code writes in <c>--output-format stream-json</c>: one JSON object per line.
/// </summary>
/// <remarks>
/// Only what the app uses is read. A line of a kind this does not know, or that is not JSON at all,
/// gives no events: Claude Code adds kinds of lines between versions, and a run must not fail on one.
/// </remarks>
public static class CliOutput
{
    public static IReadOnlyList<CliEvent> Parse(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return [];
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(line);
        }
        catch (JsonException)
        {
            return [];
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return [];
            }

            return Text(root, "type") switch
            {
                "system" => System(root),
                "stream_event" => root.TryGetProperty("event", out var inner) ? StreamEvent(inner) : [],
                "assistant" => Assistant(root),
                "result" => [Result(root)],
                _ => [],
            };
        }
    }

    private static IReadOnlyList<CliEvent> System(JsonElement root)
    {
        switch (Text(root, "subtype"))
        {
            case "init":
                var tools = new List<string>();
                if (root.TryGetProperty("tools", out var list) && list.ValueKind == JsonValueKind.Array)
                {
                    foreach (var tool in list.EnumerateArray())
                    {
                        if (tool.ValueKind == JsonValueKind.String)
                        {
                            tools.Add(tool.GetString()!);
                        }
                    }
                }

                var loaded = new List<CliServer>();
                if (root.TryGetProperty("mcp_servers", out var servers) && servers.ValueKind == JsonValueKind.Array)
                {
                    foreach (var server in servers.EnumerateArray())
                    {
                        loaded.Add(new CliServer(Text(server, "name"), Text(server, "status")));
                    }
                }

                return [new CliInit(Text(root, "session_id"), Text(root, "model"), tools, loaded)];

            case "api_retry":
                return [new CliRetry(Text(root, "error"))];

            default:
                return [];
        }
    }

    private static IReadOnlyList<CliEvent> StreamEvent(JsonElement inner)
    {
        switch (Text(inner, "type"))
        {
            case "message_start":
                return [new CliMessageStart()];

            case "content_block_delta" when inner.TryGetProperty("delta", out var delta):
                return Text(delta, "type") switch
                {
                    "text_delta" when Text(delta, "text") is { Length: > 0 } text => [new CliTextDelta(text)],
                    "thinking_delta" when Text(delta, "thinking") is { Length: > 0 } thinking => [new CliThinkingDelta(thinking)],
                    _ => [],
                };

            default:
                return [];
        }
    }

    private static List<CliEvent> Assistant(JsonElement root)
    {
        if (!root.TryGetProperty("message", out var message)
            || !message.TryGetProperty("content", out var content)
            || content.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var events = new List<CliEvent>();
        foreach (var block in content.EnumerateArray())
        {
            switch (Text(block, "type"))
            {
                case "text" when Text(block, "text") is { Length: > 0 } text:
                    events.Add(new CliText(text));
                    break;
                case "tool_use" when Text(block, "id") is { Length: > 0 } id:
                    events.Add(new CliToolUse(id, Text(block, "name")));
                    break;
            }
        }

        return events;
    }

    private static CliResult Result(JsonElement root)
    {
        long input = 0;
        long output = 0;
        if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
        {
            // Cached tokens are counted apart from "input_tokens"; all three were read by the model.
            input = Number(usage, "input_tokens") + Number(usage, "cache_creation_input_tokens") + Number(usage, "cache_read_input_tokens");
            output = Number(usage, "output_tokens");
        }

        var isError = root.TryGetProperty("is_error", out var flag) && flag.ValueKind == JsonValueKind.True;
        var subtype = Text(root, "subtype");
        return new CliResult(isError || (subtype.Length > 0 && subtype != "success"), subtype, Text(root, "result"), input, output);
    }

    private static string Text(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;

    private static long Number(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number) ? number : 0;
}
