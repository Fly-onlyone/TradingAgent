using System.Net;
using System.Text.Json;
using OpenAI.Chat;
using TradingAgent.Agent.Models;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class OpenAiModelClientTests
{
    // A fake key of low entropy, so secret scanners do not mistake it for a leaked credential.
    private const string Key = "test-key-aaaa";

    private const string TextAnswer =
        """
        data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"gpt-5.5","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}

        data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"gpt-5.5","choices":[{"index":0,"delta":{"content":", world"},"finish_reason":null}]}

        data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"gpt-5.5","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

        data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"gpt-5.5","choices":[],"usage":{"prompt_tokens":30,"completion_tokens":4,"total_tokens":34}}

        data: [DONE]

        """;

    private const string ToolAnswer =
        """
        data: {"id":"c2","object":"chat.completion.chunk","created":1,"model":"gpt-5.5","choices":[{"index":0,"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"get_ticker","arguments":""}}]},"finish_reason":null}]}

        data: {"id":"c2","object":"chat.completion.chunk","created":1,"model":"gpt-5.5","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"symbol\":"}}]},"finish_reason":null}]}

        data: {"id":"c2","object":"chat.completion.chunk","created":1,"model":"gpt-5.5","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"BTC-USDT\"}"}}]},"finish_reason":null}]}

        data: {"id":"c2","object":"chat.completion.chunk","created":1,"model":"gpt-5.5","choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"id":"call_b","type":"function","function":{"name":"get_positions","arguments":"{}"}}]},"finish_reason":null}]}

        data: {"id":"c2","object":"chat.completion.chunk","created":1,"model":"gpt-5.5","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}

        data: [DONE]

        """;

    private static readonly ModelRequest _request = new()
    {
        Model = "gpt-5.5",
        SystemPrompt = "You are a test.",
        Transcript = ["""{"role":"user","content":"Price of BTC?"}"""],
        Tools = [new ToolDefinition("get_ticker", "Latest price", """{"type":"object","properties":{"symbol":{"type":"string"}},"required":["symbol"]}""")],
        Effort = "max",
    };

    [Fact]
    public async Task A_streamed_answer_is_passed_on_and_returned_whole()
    {
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, TextAnswer);
        var sink = new CollectingSink();

        var turn = await NewClient(handler).StreamAsync(_request, sink, TestContext.Current.CancellationToken);

        Assert.Equal(["Hello", ", world"], sink.TextDeltas);
        Assert.Equal("Hello, world", turn.Text);
        Assert.Equal(StopReason.EndTurn, turn.StopReason);
        Assert.Equal(30, turn.InputTokens);
        Assert.Equal(4, turn.OutputTokens);
        Assert.Equal("""{"role":"assistant","content":"Hello, world"}""", Assert.Single(turn.TranscriptItems));
    }

    [Fact]
    public async Task Tool_calls_arriving_in_pieces_are_put_together()
    {
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, ToolAnswer);

        var turn = await NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken);

        Assert.Equal(StopReason.ToolUse, turn.StopReason);
        Assert.Equal(
            [new ToolRequest("call_a", "get_ticker", """{"symbol":"BTC-USDT"}"""), new ToolRequest("call_b", "get_positions", "{}")],
            turn.ToolRequests);
        using var item = JsonDocument.Parse(Assert.Single(turn.TranscriptItems));
        Assert.Equal(2, item.RootElement.GetProperty("tool_calls").GetArrayLength());
        Assert.Equal("call_a", item.RootElement.GetProperty("tool_calls")[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task The_request_carries_the_key_the_tools_the_effort_and_the_conversation()
    {
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, TextAnswer);

        await NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken);

        var (request, bodyText) = Assert.Single(handler.Requests);
        Assert.Equal("https://api.openai.com/v1/chat/completions", request.RequestUri!.ToString());
        Assert.Equal($"Bearer {Key}", request.Headers.Authorization!.ToString());
        using var body = JsonDocument.Parse(bodyText);
        var root = body.RootElement;
        Assert.Equal("gpt-5.5", root.GetProperty("model").GetString());
        Assert.True(root.GetProperty("stream").GetBoolean());
        // The app's highest effort maps to this provider's highest.
        Assert.Equal("xhigh", root.GetProperty("reasoning_effort").GetString());
        Assert.Equal("get_ticker", root.GetProperty("tools")[0].GetProperty("function").GetProperty("name").GetString());
        var messages = root.GetProperty("messages");
        Assert.Equal("system", messages[0].GetProperty("role").GetString());
        Assert.Equal("user", messages[1].GetProperty("role").GetString());
        // Without this the stream carries no token counts.
        Assert.True(root.GetProperty("stream_options").GetProperty("include_usage").GetBoolean());
    }

    [Fact]
    public void Stored_items_become_the_messages_of_the_next_request()
    {
        var client = NewClient(new StubHttpHandler());
        var results = client.ToolResultItems([new ToolResult("call_a", "97000", false), new ToolResult("call_b", "No such symbol", true)]);
        var request = _request with
        {
            Transcript =
            [
                client.UserItem("Price of BTC?"),
                """{"role":"assistant","content":"Checking.","tool_calls":[{"id":"call_a","name":"get_ticker","arguments":"{\"symbol\":\"BTC-USDT\"}"},{"id":"call_b","name":"get_ticker","arguments":"{}"}]}""",
                .. results,
                client.AssistantTextItem("97000."),
            ],
        };

        var messages = OpenAiModelClient.BuildMessages(request);

        Assert.Equal(6, messages.Count);
        Assert.IsType<SystemChatMessage>(messages[0]);
        Assert.Equal("Price of BTC?", Assert.IsType<UserChatMessage>(messages[1]).Content[0].Text);
        var assistant = Assert.IsType<AssistantChatMessage>(messages[2]);
        Assert.Equal("Checking.", assistant.Content[0].Text);
        Assert.Equal(["call_a", "call_b"], assistant.ToolCalls.Select(call => call.Id));
        Assert.Equal("""{"symbol":"BTC-USDT"}""", assistant.ToolCalls[0].FunctionArguments.ToString());
        Assert.Equal("call_a", Assert.IsType<ToolChatMessage>(messages[3]).ToolCallId);
        // This API has no error flag on a result; the text carries it.
        Assert.Equal("Error: No such symbol", Assert.IsType<ToolChatMessage>(messages[4]).Content[0].Text);
        Assert.Equal("97000.", Assert.IsType<AssistantChatMessage>(messages[5]).Content[0].Text);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, ModelFailure.SignIn)]
    [InlineData(HttpStatusCode.BadRequest, ModelFailure.Rejected)]
    public async Task Provider_errors_are_reported_by_what_the_user_can_do(HttpStatusCode status, ModelFailure expected)
    {
        var handler = new StubHttpHandler().Respond(
            status,
            """{"error":{"message":"Incorrect request","type":"invalid_request_error","code":null}}""",
            "application/json");

        var error = await Assert.ThrowsAsync<ModelException>(
            () => NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken));

        Assert.Equal(expected, error.Failure);
        Assert.DoesNotContain(Key, error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Without_a_saved_key_nothing_is_sent()
    {
        var handler = new StubHttpHandler();
        using var http = new HttpClient(handler);
        var client = new OpenAiModelClient(http, () => " ");

        var error = await Assert.ThrowsAsync<ModelException>(
            () => client.StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken));

        Assert.Equal(ModelFailure.SignIn, error.Failure);
        Assert.Empty(handler.Requests);
    }

    private static OpenAiModelClient NewClient(StubHttpHandler handler) => new(new HttpClient(handler), () => Key);
}
