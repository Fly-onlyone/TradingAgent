using System.Text.Json;
using System.Threading.Channels;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Mcp;
using TradingAgent.Core.Settings;

namespace TradingAgent.Agent.Tests;

/// <summary>
/// A tool server in memory. A test sets how it answers each method; everything the client sent is kept.
/// </summary>
internal sealed class FakeMcpServer : IMcpTransport
{
    private readonly Channel<string> _toClient = Channel.CreateUnbounded<string>();
    private readonly Dictionary<string, Func<JsonElement, string?>> _handlers = new(StringComparer.Ordinal);

    public FakeMcpServer()
    {
        On("initialize", _ => """{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"fake-kit","version":"9.9.9"}}""");
        On("tools/list", _ => """{"tools":[]}""");
    }

    /// <summary>Every message the client sent, as it was written.</summary>
    public List<string> Sent { get; } = [];

    /// <summary>Every message the client sent, parsed.</summary>
    public List<JsonElement> Received { get; } = [];

    public bool Disposed { get; private set; }

    /// <summary>Requests of one method, in the order they came.</summary>
    public IEnumerable<JsonElement> RequestsOf(string method)
    {
        lock (Received)
        {
            return [.. Received.Where(message => message.TryGetProperty("method", out var name) && name.GetString() == method)];
        }
    }

    /// <summary>
    /// Sets the answer to a method: the JSON of the result, a whole reply when it starts with
    /// <c>{"error"</c>, or null for no answer at all.
    /// </summary>
    public FakeMcpServer On(string method, Func<JsonElement, string?> answer)
    {
        _handlers[method] = answer;
        return this;
    }

    /// <summary>Offers these tools. Each is <c>(name, readOnlyHint)</c>; a null hint leaves the annotation out.</summary>
    public FakeMcpServer Offers(params (string Name, bool? ReadOnly)[] tools) =>
        On("tools/list", _ => $$"""{"tools":[{{string.Join(',', tools.Select(ToolJson))}}]}""");

    /// <summary>Sends a raw line to the client, as a server writing to its output would.</summary>
    public void Push(string line) => _toClient.Writer.TryWrite(line);

    /// <summary>Ends the connection, as a server that exits would.</summary>
    public void Close() => _toClient.Writer.TryComplete();

    public Task SendAsync(string message, CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(Disposed, this);

        using var document = JsonDocument.Parse(message);
        var root = document.RootElement.Clone();
        lock (Received)
        {
            Sent.Add(message);
            Received.Add(root);
        }

        if (root.TryGetProperty("method", out var method)
            && root.TryGetProperty("id", out var id)
            && _handlers.TryGetValue(method.GetString()!, out var handler))
        {
            var answer = handler(root.TryGetProperty("params", out var parameters) ? parameters : default);
            if (answer is not null)
            {
                Push(answer.StartsWith("{\"error\"", StringComparison.Ordinal)
                    ? $$"""{"jsonrpc":"2.0","id":{{id.GetRawText()}},{{answer[1..]}}"""
                    : $$"""{"jsonrpc":"2.0","id":{{id.GetRawText()}},"result":{{answer}}}""");
            }
        }

        return Task.CompletedTask;
    }

    public async Task<string?> ReceiveAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await _toClient.Reader.ReadAsync(cancellationToken);
        }
        catch (ChannelClosedException)
        {
            return null;
        }
    }

    public ValueTask DisposeAsync()
    {
        Disposed = true;
        Close();
        return ValueTask.CompletedTask;
    }

    private static string ToolJson((string Name, bool? ReadOnly) tool)
    {
        var annotations = tool.ReadOnly is { } readOnly ? $$""","annotations":{"readOnlyHint":{{(readOnly ? "true" : "false")}}}""" : string.Empty;
        const string Schema = """{"type":"object","properties":{"instId":{"type":"string"}}}""";
        return $$"""{"name":"{{tool.Name}}","description":"Does {{tool.Name}}.","inputSchema":{{Schema}}{{annotations}}}""";
    }
}

/// <summary>Hands out prepared servers in place of starting a process, and keeps what it was asked to start.</summary>
internal sealed class FakeAtkLauncher : IAtkLauncher
{
    private readonly Queue<Func<FakeMcpServer>> _next = new();

    public List<AtkLaunchOptions> Launches { get; } = [];

    public List<FakeMcpServer> Servers { get; } = [];

    /// <summary>Completes each time a launch was asked for; a test awaits it to know the service got that far.</summary>
    public Channel<int> Launched { get; } = Channel.CreateUnbounded<int>();

    /// <summary>The next launch returns this server.</summary>
    public FakeAtkLauncher Returns(FakeMcpServer server)
    {
        _next.Enqueue(() => server);
        return this;
    }

    /// <summary>The next launch fails as on a machine without the trade kit.</summary>
    public FakeAtkLauncher IsNotInstalled()
    {
        _next.Enqueue(() => throw new AtkUnavailableException("The OKX trade kit is not installed."));
        return this;
    }

    public Task<IMcpTransport> LaunchAsync(AtkLaunchOptions options, CancellationToken cancellationToken)
    {
        lock (Launches)
        {
            Launches.Add(options);
        }

        Launched.Writer.TryWrite(Launches.Count);
        // A launch the test did not prepare gets a server that offers nothing.
        var server = _next.Count > 0 ? _next.Dequeue()() : new FakeMcpServer();
        Servers.Add(server);
        return Task.FromResult<IMcpTransport>(server);
    }
}

/// <summary>Settings in memory.</summary>
internal sealed class FakeSettings : ISettingsStore
{
    private readonly Dictionary<string, object?> _values = new(StringComparer.Ordinal);

    public event EventHandler<SettingChangedEventArgs>? Changed;

    public T GetValue<T>(SettingKey<T> key)
    {
        lock (_values)
        {
            return _values.TryGetValue(key.Name, out var value) ? (T)value! : key.DefaultValue;
        }
    }

    public void SetValue<T>(SettingKey<T> key, T value)
    {
        lock (_values)
        {
            _values[key.Name] = value;
        }

        Changed?.Invoke(this, new SettingChangedEventArgs(key.Name));
    }

    /// <summary>Changes a value without telling anyone, as a write that is seen only at the next read.</summary>
    public void SetQuietly<T>(SettingKey<T> key, T value)
    {
        lock (_values)
        {
            _values[key.Name] = value;
        }
    }

    public void Reset<T>(SettingKey<T> key)
    {
        lock (_values)
        {
            _values.Remove(key.Name);
        }

        Changed?.Invoke(this, new SettingChangedEventArgs(key.Name));
    }
}
