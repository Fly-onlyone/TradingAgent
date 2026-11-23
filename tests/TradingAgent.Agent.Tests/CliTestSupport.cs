using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Cli;
using TradingAgent.Agent.Mcp;
using TradingAgent.Core.Shell;

namespace TradingAgent.Agent.Tests;

/// <summary>A command-line program in memory. A test's script decides what it prints.</summary>
internal sealed class FakeCliProcess : ICliProcess
{
    private readonly Channel<string> _output = Channel.CreateUnbounded<string>();
    private readonly TaskCompletionSource<int> _exit = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _inputClosed = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public List<string> Input { get; } = [];

    /// <summary>Completes when the app closed the program's input, which is when Claude Code starts to answer.</summary>
    public Task InputClosed => _inputClosed.Task;

    public bool Killed { get; private set; }

    /// <summary>Completes when the program was killed.</summary>
    public Task WhenKilled => _killed.Task;

    private readonly TaskCompletionSource _killed = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public string ErrorTail { get; set; } = string.Empty;

    public void Emit(string line) => _output.Writer.TryWrite(line);

    public void Exit(int code)
    {
        _output.Writer.TryComplete();
        _exit.TrySetResult(code);
    }

    public Task WriteLineAsync(string line, CancellationToken cancellationToken)
    {
        Input.Add(line);
        return Task.CompletedTask;
    }

    public void CloseInput() => _inputClosed.TrySetResult();

    public async Task<string?> ReadLineAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await _output.Reader.ReadAsync(cancellationToken);
        }
        catch (ChannelClosedException)
        {
            return null;
        }
    }

    public Task<int> WaitForExitAsync(CancellationToken cancellationToken) => _exit.Task.WaitAsync(cancellationToken);

    public void Kill()
    {
        Killed = true;
        _killed.TrySetResult();
        Exit(-1);
    }

    public ValueTask DisposeAsync()
    {
        Exit(-1);
        return ValueTask.CompletedTask;
    }
}

/// <summary>One started run of the fake Claude Code, as its script sees it.</summary>
internal sealed class FakeCliRun(FakeCliProcess process, IReadOnlyList<string> arguments)
{
    public FakeCliProcess Process => process;

    public IReadOnlyList<string> Arguments => arguments;

    /// <summary>The value that follows a flag, or null when the flag is not there.</summary>
    public string? Arg(string flag)
    {
        var index = arguments.ToList().IndexOf(flag);
        return index >= 0 && index + 1 < arguments.Count ? arguments[index + 1] : null;
    }

    public string SessionId => Arg("--session-id") ?? Arg("--resume") ?? string.Empty;

    /// <summary>The first line of a real run. Without names, the one tool the tests' tool host has.</summary>
    public void Init(params string[] tools) =>
        InitServers("""[{"name":"trading","status":"connected"}]""", tools.Length > 0 ? tools : ["mcp__trading__get_ticker"]);

    /// <summary>The first line with the given <c>mcp_servers</c> array.</summary>
    public void InitServers(string serversJson, params string[] tools) =>
        process.Emit($$"""{"type":"system","subtype":"init","session_id":"{{SessionId}}","model":"claude-sonnet-5-5","tools":[{{string.Join(',', tools.Select(tool => $"\"{tool}\""))}}],"mcp_servers":{{serversJson}},"permissionMode":"dontAsk"}""");

    public void MessageStart() => process.Emit("""{"type":"stream_event","event":{"type":"message_start","message":{"role":"assistant"}}}""");

    public void Delta(string text) =>
        process.Emit("""{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":""" + Quoted(text) + "}}}");

    public void AssistantText(string text) =>
        process.Emit("""{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":""" + Quoted(text) + "}]}}");

    public void ToolUse(string id, string modelToolName) =>
        process.Emit("""{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":""" + Quoted(id) + ""","name":""" + Quoted(modelToolName) + ""","input":{}}]}}""");

    public void Success(string text, long input = 120, long output = 30) =>
        process.Emit(
            """{"type":"result","subtype":"success","is_error":false,"result":""" + Quoted(text) + ""","session_id":""" + Quoted(SessionId)
            + $$""","usage":{"input_tokens":{{input}},"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":{{output}}""" + "}}");

    public void Error(string subtype, string text) =>
        process.Emit("""{"type":"result","subtype":""" + Quoted(subtype) + ""","is_error":true,"result":""" + Quoted(text) + ""","session_id":""" + Quoted(SessionId) + "}");

    private static string Quoted(string text) => JsonSerializer.Serialize(text, TestJson.Default.String);

    /// <summary>
    /// Connects to the app's tools the way Claude Code does through the bridge exe: the pipe and the
    /// token are read from the config file the app wrote for this run.
    /// </summary>
    public async Task<McpClient> ConnectBridgeAsync(string? token = null) =>
        new(await ConnectRawAsync(token), NullLogger.Instance, TimeSpan.FromSeconds(10));

    /// <summary>The same connection without a client on top: the script writes and reads the protocol lines itself.</summary>
    public async Task<StreamTransport> ConnectRawAsync(string? token = null)
    {
        using var config = JsonDocument.Parse(await File.ReadAllTextAsync(Arg("--mcp-config")!));
        var server = config.RootElement.GetProperty("mcpServers").GetProperty(ClaudeCliRuntime.ServerName);
        var pipeName = server.GetProperty("args")[1].GetString()!;
        token ??= server.GetProperty("env").GetProperty(StdioPipeBridge.TokenVariable).GetString()!;

        var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        await pipe.ConnectAsync(TimeSpan.FromSeconds(10), CancellationToken.None);
        await pipe.WriteAsync(Encoding.UTF8.GetBytes(token + "\n"));
        await pipe.FlushAsync();
        return new StreamTransport(pipe);
    }
}

/// <summary>Stands in for starting Claude Code: answers the sign-in question and plays a script per run.</summary>
internal sealed class FakeCliLauncher : ICliProcessLauncher
{
    private readonly Queue<Func<FakeCliRun, Task>> _scripts = new();

    /// <summary>What <c>claude auth status</c> prints. Holds an address the app must never keep.</summary>
    public string StatusOutput { get; set; } = """{"loggedIn":true,"authMethod":"claude.ai","email":"someone@example.com","orgName":"Someone's organization"}""";

    public List<(string File, IReadOnlyList<string> Arguments, string Directory)> Starts { get; } = [];

    /// <summary>Runs only: the starts that were not the sign-in question.</summary>
    public List<FakeCliRun> Runs { get; } = [];

    /// <summary>What went wrong inside a script; a test checks that this stays empty.</summary>
    public List<Exception> ScriptFailures { get; } = [];

    public int StatusQuestions => Starts.Count(start => start.Arguments is ["auth", "status"]);

    public FakeCliLauncher Plays(Func<FakeCliRun, Task> script)
    {
        _scripts.Enqueue(script);
        return this;
    }

    public ICliProcess Start(string fileName, IReadOnlyList<string> arguments, string workingDirectory)
    {
        lock (Starts)
        {
            Starts.Add((fileName, arguments, workingDirectory));
        }

        var process = new FakeCliProcess();
        if (arguments is ["auth", "status"])
        {
            process.Emit(StatusOutput);
            process.Exit(0);
            return process;
        }

        var run = new FakeCliRun(process, arguments);
        Runs.Add(run);
        var script = _scripts.Count > 0 ? _scripts.Dequeue() : throw new InvalidOperationException("The test did not script this run.");
        _ = Task.Run(async () =>
        {
            try
            {
                await process.InputClosed;
                await script(run);
            }
            catch (Exception ex)
            {
                lock (ScriptFailures)
                {
                    ScriptFailures.Add(ex);
                }
            }
            finally
            {
                process.Exit(0);
            }
        });
        return process;
    }
}

[System.Text.Json.Serialization.JsonSerializable(typeof(string))]
internal sealed partial class TestJson : System.Text.Json.Serialization.JsonSerializerContext;
