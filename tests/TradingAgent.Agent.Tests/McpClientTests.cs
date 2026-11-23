using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Mcp;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class McpClientTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Opening_the_session_names_the_client_and_then_tells_the_server_it_is_ready()
    {
        var server = new FakeMcpServer();
        await using var client = NewClient(server);

        var name = await client.InitializeAsync("trading-agent", "1.2.3", Ct);

        Assert.Equal("fake-kit 9.9.9", name);
        var request = Assert.Single(server.RequestsOf("initialize"));
        Assert.Equal("2.0", request.GetProperty("jsonrpc").GetString());
        var parameters = request.GetProperty("params");
        Assert.Equal(McpClient.ProtocolVersion, parameters.GetProperty("protocolVersion").GetString());
        Assert.Equal("trading-agent", parameters.GetProperty("clientInfo").GetProperty("name").GetString());
        Assert.Equal("1.2.3", parameters.GetProperty("clientInfo").GetProperty("version").GetString());
        Assert.Equal(JsonValueKind.Object, parameters.GetProperty("capabilities").ValueKind);

        // The notification has no id, and comes after the request.
        var ready = Assert.Single(server.RequestsOf("notifications/initialized"));
        Assert.False(ready.TryGetProperty("id", out _));
        Assert.Equal(2, server.Received.Count);
    }

    [Fact]
    public async Task Listing_tools_follows_the_servers_pages_to_the_end()
    {
        var server = new FakeMcpServer().On("tools/list", parameters =>
            parameters.TryGetProperty("cursor", out var cursor)
                ? cursor.GetString() == "page-2"
                    ? """{"tools":[{"name":"b","description":"Second.","inputSchema":{"type":"object","properties":{"x":{"type":"string"}}}}]}"""
                    : throw new InvalidOperationException("unexpected cursor")
                : """{"tools":[{"name":"a","description":"First.","inputSchema":{"type":"object"}}],"nextCursor":"page-2"}""");
        await using var client = NewClient(server);

        var tools = await client.ListToolsAsync(Ct);

        Assert.Equal(["a", "b"], tools.Select(tool => tool.Name));
        Assert.Equal("Second.", tools[1].Description);
        Assert.Equal("string", JsonDocument.Parse(tools[1].InputSchemaJson).RootElement.GetProperty("properties").GetProperty("x").GetProperty("type").GetString());
        Assert.Equal(2, server.RequestsOf("tools/list").Count());
    }

    [Fact]
    public async Task A_tool_without_a_name_is_skipped_and_one_without_a_schema_takes_no_arguments()
    {
        var server = new FakeMcpServer().On("tools/list", _ => """{"tools":[{"description":"nameless"},{"name":"bare"}]}""");
        await using var client = NewClient(server);

        var tool = Assert.Single(await client.ListToolsAsync(Ct));

        Assert.Equal("bare", tool.Name);
        Assert.Equal(string.Empty, tool.Description);
        Assert.Equal("object", JsonDocument.Parse(tool.InputSchemaJson).RootElement.GetProperty("type").GetString());
    }

    [Fact]
    public async Task The_servers_read_only_hint_is_kept_and_its_absence_is_not_read_as_read_only()
    {
        var server = new FakeMcpServer().Offers(("reads", true), ("writes", false), ("says_nothing", null));
        await using var client = NewClient(server);

        var tools = await client.ListToolsAsync(Ct);

        Assert.Equal([true, false, null], tools.Select(tool => tool.ReadOnly));
    }

    [Fact]
    public async Task A_tool_call_sends_the_arguments_as_they_are_and_joins_the_text_of_the_result()
    {
        var server = new FakeMcpServer().On(
            "tools/call",
            _ => """{"content":[{"type":"text","text":"line one"},{"type":"image","data":"AAAA","mimeType":"image/png"},{"type":"text","text":"line two"}]}""");
        await using var client = NewClient(server);

        var result = await client.CallToolAsync("market_get_ticker", """{"instId":"BTC-USDT","nested":{"n":1.50}}""", Ct);

        Assert.False(result.IsError);
        Assert.Equal("line one\n[image content is not shown]\nline two", result.Text);
        var parameters = Assert.Single(server.RequestsOf("tools/call")).GetProperty("params");
        Assert.Equal("market_get_ticker", parameters.GetProperty("name").GetString());
        // Not re-serialized: a number keeps the digits the model wrote.
        Assert.Equal("""{"instId":"BTC-USDT","nested":{"n":1.50}}""", parameters.GetProperty("arguments").GetRawText());
    }

    [Fact]
    public async Task Arguments_a_model_laid_out_over_several_lines_are_sent_as_one_message()
    {
        var server = new FakeMcpServer().On("tools/call", _ => """{"content":[{"type":"text","text":"ok"}]}""");
        await using var client = NewClient(server);

        var result = await client.CallToolAsync("spot_place_order", "{\n  \"instId\": \"BTC-USDT\",\r\n  \"sz\": \"100\"\n}", Ct);

        Assert.Equal("ok", result.Text);
        // One message, with nothing of the layout left; split in two, the server would have read neither half.
        var arguments = Assert.Single(server.RequestsOf("tools/call")).GetProperty("params").GetProperty("arguments");
        Assert.Equal("""{"instId":"BTC-USDT","sz":"100"}""", arguments.GetRawText());
        Assert.All(server.Sent, message => Assert.DoesNotContain('\n', message));
    }

    [Fact]
    public async Task Arguments_that_are_not_json_are_not_sent()
    {
        var server = new FakeMcpServer().On("tools/call", _ => """{"content":[]}""");
        await using var client = NewClient(server);

        await Assert.ThrowsAnyAsync<System.Text.Json.JsonException>(() => client.CallToolAsync("spot_place_order", "{\"sz\": ", Ct));

        Assert.Empty(server.RequestsOf("tools/call"));
    }

    [Fact]
    public async Task A_result_the_server_marks_as_failed_is_returned_as_a_failure_not_thrown()
    {
        var server = new FakeMcpServer().On("tools/call", _ => """{"content":[{"type":"text","text":"No credentials found."}],"isError":true}""");
        await using var client = NewClient(server);

        var result = await client.CallToolAsync("account_get_balance", "{}", Ct);

        Assert.True(result.IsError);
        Assert.Equal("No credentials found.", result.Text);
    }

    [Fact]
    public async Task An_error_reply_is_thrown_with_the_servers_code_and_message()
    {
        var server = new FakeMcpServer().On("tools/call", _ => """{"error":{"code":-32602,"message":"Unknown tool: nope"}}""");
        await using var client = NewClient(server);

        var error = await Assert.ThrowsAsync<McpException>(() => client.CallToolAsync("nope", "{}", Ct));

        Assert.Equal(-32602, error.Code);
        Assert.Equal("Unknown tool: nope", error.Message);
    }

    [Fact]
    public async Task A_request_the_server_never_answers_fails_after_the_timeout()
    {
        var server = new FakeMcpServer().On("tools/call", _ => null);
        await using var client = NewClient(server, TimeSpan.FromMilliseconds(100));

        var error = await Assert.ThrowsAsync<McpException>(() => client.CallToolAsync("slow", "{}", Ct));

        Assert.Contains("did not answer", error.Message, StringComparison.Ordinal);
        Assert.Null(error.Code);
    }

    [Fact]
    public async Task A_caller_that_stops_waiting_gets_its_cancellation_back()
    {
        var server = new FakeMcpServer().On("tools/call", _ => null);
        await using var client = NewClient(server);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(Ct);

        var call = client.CallToolAsync("slow", "{}", cancel.Token);
        await cancel.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => call);
    }

    [Fact]
    public async Task When_the_server_goes_away_waiting_requests_fail_and_the_client_reports_it_closed()
    {
        var server = new FakeMcpServer().On("tools/call", _ => null);
        await using var client = NewClient(server);

        var call = client.CallToolAsync("slow", "{}", Ct);
        server.Close();

        var error = await Assert.ThrowsAsync<McpException>(() => call);
        Assert.Contains("closed", error.Message, StringComparison.Ordinal);
        await client.Closed.WaitAsync(TimeSpan.FromSeconds(5), Ct);
    }

    [Fact]
    public async Task Lines_that_are_not_protocol_messages_are_skipped()
    {
        var server = new FakeMcpServer().On("tools/call", _ => """{"content":[{"type":"text","text":"ok"}]}""");
        await using var client = NewClient(server);

        // A server that prints a banner, an empty line, a JSON value that is no message, a
        // notification, and a reply to a request nobody is waiting for.
        server.Push("okx-trade-mcp starting...");
        server.Push(string.Empty);
        server.Push("[1,2,3]");
        server.Push("""{"jsonrpc":"2.0","method":"notifications/tools/list_changed"}""");
        server.Push("""{"jsonrpc":"2.0","id":999,"result":{}}""");
        var result = await client.CallToolAsync("still_works", "{}", Ct);

        Assert.Equal("ok", result.Text);
    }

    [Fact]
    public async Task A_ping_from_the_server_is_answered_and_any_other_request_is_declined()
    {
        var server = new FakeMcpServer().On("tools/call", _ => """{"content":[]}""");
        await using var client = NewClient(server);

        server.Push("""{"jsonrpc":"2.0","id":"srv-1","method":"ping"}""");
        server.Push("""{"jsonrpc":"2.0","id":7,"method":"sampling/createMessage","params":{}}""");
        // A round trip after them: the reader handles messages in order, so both are answered by now.
        await client.CallToolAsync("after", "{}", Ct);

        JsonElement[] replies;
        lock (server.Received)
        {
            replies = [.. server.Received.Where(message => !message.TryGetProperty("method", out _))];
        }

        Assert.Equal(2, replies.Length);
        Assert.Equal("srv-1", replies[0].GetProperty("id").GetString());
        Assert.Equal(JsonValueKind.Object, replies[0].GetProperty("result").ValueKind);
        Assert.Equal(7, replies[1].GetProperty("id").GetInt32());
        Assert.Equal(-32601, replies[1].GetProperty("error").GetProperty("code").GetInt32());
    }

    [Fact]
    public async Task Requests_made_at_the_same_time_each_get_their_own_answer()
    {
        var server = new FakeMcpServer().On(
            "tools/call",
            parameters => $$"""{"content":[{"type":"text","text":"{{parameters.GetProperty("name").GetString()}}"}]}""");
        await using var client = NewClient(server);

        var results = await Task.WhenAll(Enumerable.Range(0, 50).Select(index => client.CallToolAsync($"tool_{index}", "{}", Ct)));

        Assert.Equal(Enumerable.Range(0, 50).Select(index => $"tool_{index}"), results.Select(result => result.Text));
    }

    [Fact]
    public async Task Disposing_the_client_disposes_the_connection_and_later_calls_fail()
    {
        var server = new FakeMcpServer();
        var client = NewClient(server);

        await client.DisposeAsync();

        Assert.True(server.Disposed);
        await Assert.ThrowsAsync<McpException>(() => client.CallToolAsync("late", "{}", Ct));
    }

    private static McpClient NewClient(FakeMcpServer server, TimeSpan? timeout = null) =>
        new(server, NullLogger.Instance, timeout ?? TimeSpan.FromSeconds(10));
}
