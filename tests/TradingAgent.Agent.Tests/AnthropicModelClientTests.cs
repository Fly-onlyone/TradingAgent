using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Models;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class AnthropicModelClientTests
{
    // A fake key of low entropy, so secret scanners do not mistake it for a leaked credential.
    private const string Key = "test-key-aaaa";

    private const string TextAnswer =
        """
        event: message_start
        data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-5-5","content":[],"usage":{"input_tokens":20,"cache_creation_input_tokens":5,"cache_read_input_tokens":100,"output_tokens":1}}}

        event: content_block_start
        data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

        event: ping
        data: {"type":"ping"}

        event: content_block_delta
        data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

        event: content_block_delta
        data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":", world"}}

        event: content_block_stop
        data: {"type":"content_block_stop","index":0}

        event: message_delta
        data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}

        event: message_stop
        data: {"type":"message_stop"}

        """;

    private const string ToolAnswer =
        """
        event: message_start
        data: {"type":"message_start","message":{"model":"claude-sonnet-5-5","usage":{"input_tokens":50,"output_tokens":1}}}

        event: content_block_start
        data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}

        event: content_block_delta
        data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Need the price."}}

        event: content_block_delta
        data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"c2lnbmF0dXJl"}}

        event: content_block_stop
        data: {"type":"content_block_stop","index":0}

        event: content_block_start
        data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}

        event: content_block_delta
        data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Checking."}}

        event: content_block_stop
        data: {"type":"content_block_stop","index":1}

        event: content_block_start
        data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_ticker","input":{}}}

        event: content_block_delta
        data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\"symbol\":"}}

        event: content_block_delta
        data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"\"BTC-USDT\"}"}}

        event: content_block_stop
        data: {"type":"content_block_stop","index":2}

        event: content_block_start
        data: {"type":"content_block_start","index":3,"content_block":{"type":"tool_use","id":"toolu_2","name":"get_positions","input":{}}}

        event: content_block_stop
        data: {"type":"content_block_stop","index":3}

        event: message_delta
        data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":40}}

        event: message_stop
        data: {"type":"message_stop"}

        """;

    private static readonly ModelRequest _request = new()
    {
        Model = "claude-sonnet-5-5",
        SystemPrompt = "You are a test.",
        Transcript = ["""{"role":"user","content":[{"type":"text","text":"Price of BTC?"}]}"""],
        Tools = [new ToolDefinition("get_ticker", "Latest price", """{"type":"object","properties":{"symbol":{"type":"string"}},"required":["symbol"]}""")],
        Effort = "medium",
    };

    [Fact]
    public async Task A_streamed_answer_is_passed_on_piece_by_piece_and_returned_whole()
    {
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, TextAnswer);
        var sink = new CollectingSink();

        var turn = await NewClient(handler).StreamAsync(_request, sink, TestContext.Current.CancellationToken);

        Assert.Equal(["Hello", ", world"], sink.TextDeltas);
        Assert.Equal("Hello, world", turn.Text);
        Assert.Equal(StopReason.EndTurn, turn.StopReason);
        Assert.Empty(turn.ToolRequests);
        Assert.Equal("claude-sonnet-5-5", turn.Model);
        // Cached tokens were read too: 20 + 5 + 100.
        Assert.Equal(125, turn.InputTokens);
        Assert.Equal(12, turn.OutputTokens);
        Assert.Equal(
            """{"role":"assistant","content":[{"type":"text","text":"Hello, world"}]}""",
            Assert.Single(turn.TranscriptItems));
    }

    [Fact]
    public async Task Thinking_and_tool_calls_are_kept_exactly_for_the_transcript()
    {
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, ToolAnswer);
        var sink = new CollectingSink();

        var turn = await NewClient(handler).StreamAsync(_request, sink, TestContext.Current.CancellationToken);

        Assert.Equal(StopReason.ToolUse, turn.StopReason);
        Assert.Equal("Need the price.", sink.ThinkingSoFar.ToString());
        Assert.Equal("Checking.", turn.Text);
        Assert.Equal(
            [new ToolRequest("toolu_1", "get_ticker", """{"symbol":"BTC-USDT"}"""), new ToolRequest("toolu_2", "get_positions", "{}")],
            turn.ToolRequests);

        using var item = JsonDocument.Parse(Assert.Single(turn.TranscriptItems));
        var content = item.RootElement.GetProperty("content");
        Assert.Equal("assistant", item.RootElement.GetProperty("role").GetString());
        Assert.Equal(4, content.GetArrayLength());
        // The signature is what lets the API accept the thinking block when it comes back.
        Assert.Equal("thinking", content[0].GetProperty("type").GetString());
        Assert.Equal("Need the price.", content[0].GetProperty("thinking").GetString());
        Assert.Equal("c2lnbmF0dXJl", content[0].GetProperty("signature").GetString());
        Assert.Equal("toolu_1", content[2].GetProperty("id").GetString());
        Assert.Equal("BTC-USDT", content[2].GetProperty("input").GetProperty("symbol").GetString());
        Assert.Equal(JsonValueKind.Object, content[3].GetProperty("input").ValueKind);
    }

    [Fact]
    public async Task The_request_follows_the_messages_api()
    {
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, TextAnswer);

        await NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken);

        var (request, bodyText) = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://api.anthropic.com/v1/messages", request.RequestUri!.ToString());
        Assert.Equal(Key, Assert.Single(request.Headers.GetValues("x-api-key")));
        Assert.Equal(AnthropicModelClient.ApiVersion, Assert.Single(request.Headers.GetValues("anthropic-version")));

        using var body = JsonDocument.Parse(bodyText);
        var root = body.RootElement;
        Assert.Equal("claude-sonnet-5-5", root.GetProperty("model").GetString());
        Assert.True(root.GetProperty("stream").GetBoolean());
        Assert.Equal(AnthropicModelClient.MaxOutputTokens, root.GetProperty("max_tokens").GetInt32());
        Assert.Equal("You are a test.", root.GetProperty("system")[0].GetProperty("text").GetString());
        Assert.Equal("adaptive", root.GetProperty("thinking").GetProperty("type").GetString());
        Assert.Equal("summarized", root.GetProperty("thinking").GetProperty("display").GetString());
        Assert.Equal("medium", root.GetProperty("output_config").GetProperty("effort").GetString());
        Assert.Equal("ephemeral", root.GetProperty("cache_control").GetProperty("type").GetString());
        Assert.Equal("get_ticker", root.GetProperty("tools")[0].GetProperty("name").GetString());
        Assert.Equal("symbol", root.GetProperty("tools")[0].GetProperty("input_schema").GetProperty("required")[0].GetString());
        Assert.Equal("Price of BTC?", root.GetProperty("messages")[0].GetProperty("content")[0].GetProperty("text").GetString());
        // Parameters the current models reject must never be sent.
        Assert.False(root.TryGetProperty("temperature", out _));
        Assert.False(root.GetProperty("thinking").TryGetProperty("budget_tokens", out _));
    }

    [Theory]
    [InlineData("claude-sonnet-5-5", true)]
    [InlineData("claude-opus-5-5", true)]
    [InlineData("claude-fable-5-2", true)]
    [InlineData("claude-haiku-5-5", false)]
    public async Task Refusal_fallback_is_asked_for_only_where_the_model_supports_it(string model, bool expected)
    {
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, TextAnswer);

        await NewClient(handler).StreamAsync(_request with { Model = model }, new CollectingSink(), TestContext.Current.CancellationToken);

        var (request, bodyText) = Assert.Single(handler.Requests);
        using var body = JsonDocument.Parse(bodyText);
        Assert.Equal(expected, body.RootElement.TryGetProperty("fallbacks", out var fallbacks) && fallbacks.GetString() == "default");
        Assert.Equal(expected, request.Headers.Contains("anthropic-beta"));
    }

    [Fact]
    public async Task Transcript_items_are_sent_byte_for_byte()
    {
        // Unusual spacing and key order: the client must not re-serialize what it stored.
        const string Odd = """{ "role":"assistant",  "content":[ {"signature":"abc","type":"thinking","thinking":""} ] }""";
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, TextAnswer);

        await NewClient(handler).StreamAsync(
            _request with { Transcript = [_request.Transcript[0], Odd] },
            new CollectingSink(),
            TestContext.Current.CancellationToken);

        Assert.Contains(Odd, handler.Requests[0].Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_content_block_of_an_unknown_kind_goes_into_the_transcript_as_it_arrived()
    {
        const string Stream =
            """
            data: {"type":"message_start","message":{"model":"claude-opus-4-8","usage":{"input_tokens":1,"output_tokens":1}}}

            data: {"type":"content_block_start","index":0,"content_block":{"type":"fallback","from":{"model":"claude-sonnet-5-5"},"to":{"model":"claude-opus-4-8"}}}

            data: {"type":"content_block_stop","index":0}

            data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}

            data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"ok"}}

            data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}

            """;
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, Stream);

        var turn = await NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken);

        using var item = JsonDocument.Parse(Assert.Single(turn.TranscriptItems));
        var first = item.RootElement.GetProperty("content")[0];
        Assert.Equal("fallback", first.GetProperty("type").GetString());
        Assert.Equal("claude-opus-4-8", first.GetProperty("to").GetProperty("model").GetString());
        Assert.Equal("ok", turn.Text);
        Assert.Equal("claude-opus-4-8", turn.Model);
    }

    [Theory]
    [InlineData("max_tokens", StopReason.MaxTokens)]
    [InlineData("refusal", StopReason.Refused)]
    [InlineData("pause_turn", StopReason.Paused)]
    [InlineData("stop_sequence", StopReason.EndTurn)]
    public async Task Stop_reasons_are_told_apart(string wire, StopReason expected)
    {
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, TextAnswer.Replace("end_turn", wire, StringComparison.Ordinal));

        var turn = await NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken);

        Assert.Equal(expected, turn.StopReason);
    }

    [Fact]
    public async Task A_tool_call_with_cut_off_arguments_keeps_the_transcript_valid_and_hands_on_the_raw_text()
    {
        const string Stream =
            """
            data: {"type":"message_start","message":{"usage":{"input_tokens":1,"output_tokens":1}}}

            data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_ticker","input":{}}}

            data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"symbol\":\"BT"}}

            data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":9}}

            """;
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, Stream);

        var turn = await NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken);

        Assert.Equal(StopReason.MaxTokens, turn.StopReason);
        Assert.Equal("{\"symbol\":\"BT", Assert.Single(turn.ToolRequests).InputJson);
        using var item = JsonDocument.Parse(Assert.Single(turn.TranscriptItems));
        Assert.Equal(JsonValueKind.Object, item.RootElement.GetProperty("content")[0].GetProperty("input").ValueKind);
    }

    [Fact]
    public async Task A_stream_that_ends_without_a_stop_reason_is_an_error_not_an_answer()
    {
        var cutOff = TextAnswer[..TextAnswer.IndexOf("event: message_delta", StringComparison.Ordinal)];
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, cutOff);

        var error = await Assert.ThrowsAsync<ModelException>(
            () => NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken));

        Assert.Equal(ModelFailure.Network, error.Failure);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "authentication_error", ModelFailure.SignIn)]
    [InlineData(HttpStatusCode.Forbidden, "permission_error", ModelFailure.SignIn)]
    [InlineData(HttpStatusCode.BadRequest, "invalid_request_error", ModelFailure.Rejected)]
    [InlineData(HttpStatusCode.NotFound, "not_found_error", ModelFailure.Rejected)]
    public async Task Errors_that_a_retry_cannot_fix_are_reported_at_once(HttpStatusCode status, string type, ModelFailure expected)
    {
        var handler = new StubHttpHandler().Respond(
            status,
            $$$"""{"type":"error","error":{"type":"{{{type}}}","message":"max_tokens: must be positive"}}""",
            "application/json");

        var error = await Assert.ThrowsAsync<ModelException>(
            () => NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken));

        Assert.Equal(expected, error.Failure);
        Assert.Single(handler.Requests);
        Assert.DoesNotContain(Key, error.Message, StringComparison.Ordinal);
        if (expected == ModelFailure.Rejected)
        {
            Assert.Contains("max_tokens: must be positive", error.Message, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task A_rate_limit_is_retried_and_the_answer_is_returned()
    {
        var handler = new StubHttpHandler()
            .Respond(_ => Limited(HttpStatusCode.TooManyRequests, "rate_limit_error"))
            .Respond(_ => Limited((HttpStatusCode)529, "overloaded_error"))
            .Respond(HttpStatusCode.OK, TextAnswer);

        var turn = await NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken);

        Assert.Equal("Hello, world", turn.Text);
        Assert.Equal(3, handler.Requests.Count);
    }

    [Fact]
    public async Task Retries_stop_after_two_and_the_last_failure_is_reported()
    {
        var handler = new StubHttpHandler()
            .Respond(_ => Limited(HttpStatusCode.TooManyRequests, "rate_limit_error"))
            .Respond(_ => Limited(HttpStatusCode.TooManyRequests, "rate_limit_error"))
            .Respond(_ => Limited(HttpStatusCode.TooManyRequests, "rate_limit_error"));

        var error = await Assert.ThrowsAsync<ModelException>(
            () => NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken));

        Assert.Equal(ModelFailure.RateLimited, error.Failure);
        Assert.Equal(3, handler.Requests.Count);
    }

    [Fact]
    public async Task A_long_wait_asked_for_by_the_provider_is_not_sat_out()
    {
        var handler = new StubHttpHandler().Respond(_ =>
        {
            var response = Limited(HttpStatusCode.TooManyRequests, "rate_limit_error");
            response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromMinutes(10));
            return response;
        });

        var error = await Assert.ThrowsAsync<ModelException>(
            () => NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken));

        Assert.Equal(ModelFailure.RateLimited, error.Failure);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task An_error_sent_inside_the_stream_fails_the_call()
    {
        const string Stream =
            """
            data: {"type":"message_start","message":{"usage":{"input_tokens":1,"output_tokens":1}}}

            event: error
            data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}

            """;
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, Stream);

        var error = await Assert.ThrowsAsync<ModelException>(
            () => NewClient(handler).StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken));

        Assert.Equal(ModelFailure.Overloaded, error.Failure);
    }

    [Fact]
    public async Task Without_a_saved_key_nothing_is_sent()
    {
        var handler = new StubHttpHandler();
        using var http = new HttpClient(handler);
        var client = new AnthropicModelClient(http, () => null, TimeProvider.System, NullLogger<AnthropicModelClient>.Instance);

        var error = await Assert.ThrowsAsync<ModelException>(
            () => client.StreamAsync(_request, new CollectingSink(), TestContext.Current.CancellationToken));

        Assert.Equal(ModelFailure.SignIn, error.Failure);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task Cancelling_stops_the_call()
    {
        using var cancel = new CancellationTokenSource();
        var handler = new StubHttpHandler().Respond(_ =>
        {
            cancel.Cancel();
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(TextAnswer, Encoding.UTF8, "text/event-stream") };
        });

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => NewClient(handler).StreamAsync(_request, new CollectingSink(), cancel.Token));
    }

    [Fact]
    public void All_tool_results_of_a_turn_go_into_one_user_message()
    {
        var client = NewClient(new StubHttpHandler());

        var items = client.ToolResultItems(
        [
            new ToolResult("toolu_1", "97000", IsError: false),
            new ToolResult("toolu_2", "No such symbol \"XYZ\"", IsError: true),
            new ToolResult("toolu_3", string.Empty, IsError: false),
        ]);

        using var item = JsonDocument.Parse(Assert.Single(items));
        var content = item.RootElement.GetProperty("content");
        Assert.Equal("user", item.RootElement.GetProperty("role").GetString());
        Assert.Equal(3, content.GetArrayLength());
        Assert.Equal("toolu_1", content[0].GetProperty("tool_use_id").GetString());
        Assert.False(content[0].TryGetProperty("is_error", out _));
        Assert.True(content[1].GetProperty("is_error").GetBoolean());
        Assert.Equal("No such symbol \"XYZ\"", content[1].GetProperty("content").GetString());
        // The API rejects an empty result.
        Assert.Equal("(no output)", content[2].GetProperty("content").GetString());
        Assert.Empty(client.ToolResultItems([]));
    }

    [Fact]
    public void User_and_assistant_text_become_messages_with_one_text_block()
    {
        var client = NewClient(new StubHttpHandler());

        // Text with quotes and a line break must come out as valid JSON holding the same text.
        using var user = JsonDocument.Parse(client.UserItem("He said \"buy\"\nthen left"));
        Assert.Equal("user", user.RootElement.GetProperty("role").GetString());
        var block = Assert.Single(user.RootElement.GetProperty("content").EnumerateArray());
        Assert.Equal("text", block.GetProperty("type").GetString());
        Assert.Equal("He said \"buy\"\nthen left", block.GetProperty("text").GetString());
        Assert.Equal(
            """{"role":"assistant","content":[{"type":"text","text":"ok"}]}""",
            client.AssistantTextItem("ok"));
    }

    private static AnthropicModelClient NewClient(StubHttpHandler handler) =>
        new(new HttpClient(handler), () => Key, TimeProvider.System, NullLogger<AnthropicModelClient>.Instance);

    private static HttpResponseMessage Limited(HttpStatusCode status, string type)
    {
        var response = new HttpResponseMessage(status)
        {
            Content = new StringContent($$$"""{"type":"error","error":{"type":"{{{type}}}","message":"slow down"}}""", Encoding.UTF8, "application/json"),
        };
        // Zero, so the test does not wait for the retry.
        response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.Zero);
        return response;
    }
}
