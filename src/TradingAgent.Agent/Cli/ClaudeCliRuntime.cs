using System.ComponentModel;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Mcp;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Shell;
using TradingAgent.Data.Agent;

namespace TradingAgent.Agent.Cli;

/// <param name="BridgeExecutable">The app's own exe, which Claude Code starts in bridge mode to reach the app's tools.</param>
/// <param name="WorkDirectory">
/// The folder Claude Code runs in. Always the same one: Claude Code files a conversation under the
/// folder it was started in, and a later run must find it there to resume.
/// </param>
public sealed record CliRuntimeOptions(string BridgeExecutable, string WorkDirectory);

/// <summary>
/// Runs a prompt with the Claude Code command line, for a user who signs in with a Claude
/// subscription instead of an API key.
/// </summary>
/// <remarks>
/// One Claude Code process per run. It is the model loop; the tools stay in this app:
/// <list type="bullet">
/// <item><b>Its own tools are off</b> (<c>--tools ""</c>): no shell, no file access, no web. The run is
/// stopped if Claude Code reports any tool that is not one of this app's.</item>
/// <item><b>The only tool server is this app</b> (<c>--strict-mcp-config</c>), reached through
/// <see cref="StdioPipeBridge"/> and <see cref="BridgeEndpoint"/>. Every tool call lands in
/// <see cref="ToolHost"/>, and with that in the risk gate, exactly as for the app's own model loop.</item>
/// <item><b>Nothing is approved by a prompt</b> (<c>--permission-mode dontAsk</c> with the app's
/// tools allowed): never <c>bypassPermissions</c>.</item>
/// <item><b>The user's own Claude Code setup stays out</b> (<c>--setting-sources ""</c>): their hooks,
/// plugins and instruction files are for their coding, not for trading. Not <c>--safe-mode</c>, which
/// was tried against the real program and also drops the tool server given with
/// <c>--mcp-config</c>, leaving the model without this app's tools.</item>
/// </list>
/// Claude Code keeps the conversation itself; the app stores its id and resumes with it. Cancelling
/// ends the process; the next run resumes the conversation.
/// </remarks>
public sealed partial class ClaudeCliRuntime(
    ClaudeCli cli,
    ICliProcessLauncher launcher,
    ToolHost tools,
    ISystemPrompt systemPrompt,
    AgentSessionRepository sessions,
    CliRuntimeOptions options,
    string model,
    string effort,
    string appVersion,
    ILogger<ClaudeCliRuntime> logger) : IAgentRuntime
{
    /// <summary>The name this app's tool server has for Claude Code. The model sees <c>mcp__trading__&lt;tool&gt;</c>.</summary>
    public const string ServerName = "trading";

    private const string ToolPrefix = "mcp__" + ServerName + "__";

    /// <summary>How long a tool call waits for Claude Code to say which call of the model it is.</summary>
    private static readonly TimeSpan _toolUseIdWait = TimeSpan.FromSeconds(1);

    public string Model => model;

    public async Task<RunOutcome> ExecuteAsync(RunContext context, RunRecorder recorder, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(recorder);

        var status = await cli.GetStatusAsync(cancellationToken).ConfigureAwait(false);
        if (status.Problem is { } problem)
        {
            return RunOutcome.Failed(problem);
        }

        // After a change of provider or sign-in mode the earlier turns were not made by Claude Code.
        var stored = context.RuntimeChanged ? null : sessions.Get(context.SessionId)?.SdkSessionId;
        var attempt = await RunOnceAsync(status.Path!, context, recorder, stored, cancellationToken).ConfigureAwait(false);
        if (attempt.ResumeFailed)
        {
            // Claude Code no longer has that conversation (its files were cleared). Start a new one
            // and tell the model what the chat shows.
            LogResumeFailed(logger, context.SessionId);
            sessions.SetSdkSessionId(context.SessionId, null);
            attempt = await RunOnceAsync(status.Path!, context, recorder, resume: null, cancellationToken).ConfigureAwait(false);
        }

        return attempt.Outcome;
    }

    /// <summary>The arguments Claude Code is started with. <c>internal</c> for tests.</summary>
    internal static List<string> Arguments(string configFile, string promptFile, string model, string effort, string sessionId, bool resume)
    {
        List<string> arguments =
        [
            "-p",
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--verbose",
            "--include-partial-messages",
            // Only this app's tool server, and none of Claude Code's own tools.
            "--strict-mcp-config",
            "--mcp-config", configFile,
            "--tools", string.Empty,
            "--allowedTools", "mcp__" + ServerName,
            // Whatever is not allowed above is refused without asking. Never bypassPermissions.
            "--permission-mode", "dontAsk",
            // None of the user's, the project's or the folder's settings: their hooks, plugins and
            // instruction files stay out.
            "--setting-sources", string.Empty,
            "--system-prompt-file", promptFile,
            "--model", model,
            "--effort", effort,
        ];
        arguments.Add(resume ? "--resume" : "--session-id");
        arguments.Add(sessionId);
        return arguments;
    }

    /// <summary>The one line written to Claude Code's input.</summary>
    internal static string UserLine(string text)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteString("type", "user");
            writer.WriteStartObject("message");
            writer.WriteString("role", "user");
            writer.WriteString("content", text);
            writer.WriteEndObject();
            writer.WriteNull("parent_tool_use_id");
            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>The tool server entry Claude Code reads: start this app's exe in bridge mode.</summary>
    internal static string McpConfig(string bridgeExecutable, string pipeName, string token)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, new JsonWriterOptions { Indented = true }))
        {
            writer.WriteStartObject();
            writer.WriteStartObject("mcpServers");
            writer.WriteStartObject(ServerName);
            writer.WriteString("type", "stdio");
            writer.WriteString("command", bridgeExecutable);
            writer.WriteStartArray("args");
            writer.WriteStringValue(StdioPipeBridge.Argument);
            writer.WriteStringValue(pipeName);
            writer.WriteEndArray();
            writer.WriteStartObject("env");
            writer.WriteString(StdioPipeBridge.TokenVariable, token);
            writer.WriteEndObject();
            writer.WriteEndObject();
            writer.WriteEndObject();
            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>
    /// What is sent as the user's message. In a conversation Claude Code has not seen, the earlier
    /// turns are put in front as text: the words survive, tool results and reasoning do not.
    /// </summary>
    internal static string Prompt(RunContext context, bool newConversation)
    {
        if (!newConversation || context.EarlierMessages.Count == 0)
        {
            return context.UserText;
        }

        var text = new StringBuilder("Earlier in this conversation (for context; the results of tools used then are not shown):\n\n");
        var any = false;
        foreach (var message in context.EarlierMessages)
        {
            if (string.IsNullOrWhiteSpace(message.Content) || message.Role is not (MessageRole.User or MessageRole.Assistant))
            {
                continue;
            }

            text.Append(message.Role == MessageRole.User ? "User: " : "Assistant: ").Append(message.Content.Trim()).Append("\n\n");
            any = true;
        }

        return any ? text.Append("The user now says:\n\n").Append(context.UserText).ToString() : context.UserText;
    }

    private async Task<Attempt> RunOnceAsync(string cliPath, RunContext context, RunRecorder recorder, string? resume, CancellationToken cancellationToken)
    {
        var run = new RunState(context, recorder);
        var runDirectory = Path.Combine(options.WorkDirectory, "runs", Guid.NewGuid().ToString("N"));
        var server = new McpToolServer(() => tools.Definitions, (call, token) => InvokeAsync(run, call, token), ServerName, appVersion, logger);
        var endpoint = BridgeEndpoint.Start(server, logger);
        await using (endpoint.ConfigureAwait(false))
        {
            try
            {
                Directory.CreateDirectory(runDirectory);
                var configFile = Path.Combine(runDirectory, "mcp.json");
                var promptFile = Path.Combine(runDirectory, "system-prompt.txt");
                var utf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
                // Holds the run's token. It is good for this run's pipe only, which takes the
                // current user only, and the file is deleted when the run ends.
                await File.WriteAllTextAsync(configFile, McpConfig(options.BridgeExecutable, endpoint.PipeName, endpoint.Token), utf8, cancellationToken).ConfigureAwait(false);
                await File.WriteAllTextAsync(promptFile, systemPrompt.Build(), utf8, cancellationToken).ConfigureAwait(false);

                var cliSessionId = resume ?? Guid.NewGuid().ToString();
                ICliProcess process;
                try
                {
                    process = launcher.Start(cliPath, Arguments(configFile, promptFile, model, effort, cliSessionId, resume is not null), options.WorkDirectory);
                }
                catch (Win32Exception ex)
                {
                    LogStartFailed(logger, ex);
                    cli.Forget();
                    return new Attempt(RunOutcome.Failed("Claude Code could not be started. Check that it is installed, then try again."));
                }

                await using (process.ConfigureAwait(false))
                {
                    // Cancelling ends the process: Claude Code has no other way to be interrupted from outside.
                    await using var kill = cancellationToken.Register(process.Kill).ConfigureAwait(false);
                    await process.WriteLineAsync(UserLine(Prompt(context, newConversation: resume is null)), cancellationToken).ConfigureAwait(false);
                    // One prompt per process: with its input closed Claude Code answers and ends.
                    process.CloseInput();

                    CliResult? result = null;
                    while (await process.ReadLineAsync(cancellationToken).ConfigureAwait(false) is { } line)
                    {
                        foreach (var item in CliOutput.Parse(line))
                        {
                            switch (item)
                            {
                                case CliInit init:
                                    if (logger.IsEnabled(LogLevel.Information))
                                    {
                                        var servers = string.Join(", ", init.Servers.Select(server => $"{server.Name}={server.Status}"));
                                        LogStarted(logger, init.Model, init.Tools.Count, servers);
                                    }

                                    if (Unexpected(init) is { } stop)
                                    {
                                        process.Kill();
                                        return new Attempt(RunOutcome.Failed(stop));
                                    }

                                    run.Model = init.Model;
                                    if (resume is null && init.SessionId.Length > 0)
                                    {
                                        sessions.SetSdkSessionId(context.SessionId, init.SessionId);
                                    }

                                    break;
                                case CliResult final:
                                    result = final;
                                    break;
                                default:
                                    run.Record(item);
                                    break;
                            }
                        }
                    }

                    var exitCode = await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
                    return Conclude(run, result, exitCode, process.ErrorTail, resume is not null);
                }
            }
            finally
            {
                try
                {
                    Directory.Delete(runDirectory, recursive: true);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    // Claude Code may still hold a file for a moment; the folder holds a spent token.
                }
            }
        }
    }

    /// <summary>
    /// Checks what Claude Code says it started with. Returns why the run must stop, or null.
    /// </summary>
    private string? Unexpected(CliInit init)
    {
        // Claude Code waits for its tool servers before it writes this line. One that is not
        // connected by now (missing, failed, or still "pending" after that wait) will not be there
        // for the model's first request: the model would answer without tools, and say whatever it
        // likes about prices it never read. Seen with the real program: it wrote a tool call as text.
        var server = init.Servers.FirstOrDefault(candidate => candidate.Name == ServerName);
        if (server is not { Status: "connected" } || (tools.Definitions.Count > 0 && init.Tools.Count == 0))
        {
            LogBridgeDown(logger, server?.Status ?? "not loaded");
            return "Claude Code could not reach this app's tools. Try again; if it keeps happening, restart the app.";
        }

        if (init.Servers.Count > 1)
        {
            LogForeignTools(logger, string.Join(", ", init.Servers.Select(candidate => candidate.Name).Take(10)));
            return "Claude Code started with tool servers that are not this app's, which this app does not allow. The run was stopped.";
        }

        // The promise of this runtime: the model has this app's tools and nothing else. Checked, not
        // assumed: a version of Claude Code that reads its arguments differently must not get a shell.
        var foreign = init.Tools.Where(tool => !tool.StartsWith(ToolPrefix, StringComparison.Ordinal)).ToList();
        if (foreign.Count > 0)
        {
            LogForeignTools(logger, string.Join(", ", foreign.Take(10)));
            return "Claude Code started with tools of its own switched on, which this app does not allow. The run was stopped.";
        }

        return null;
    }

    private Attempt Conclude(RunState run, CliResult? result, int exitCode, string errorTail, bool resumed)
    {
        // A conversation that is gone shows before anything is answered.
        var nothingYet = !run.Produced;
        if (result is null)
        {
            if (resumed && nothingYet && MentionsMissingConversation(errorTail))
            {
                return new Attempt(RunOutcome.Failed("The conversation could not be resumed."), ResumeFailed: true);
            }

            LogNoResult(logger, exitCode);
            return new Attempt(RunOutcome.Failed($"Claude Code stopped before it answered (exit code {exitCode})."));
        }

        if (!result.IsError)
        {
            run.Finish(result);
            return new Attempt(RunOutcome.Complete);
        }

        if (resumed && nothingYet && (MentionsMissingConversation(result.Text) || MentionsMissingConversation(errorTail)))
        {
            return new Attempt(RunOutcome.Failed("The conversation could not be resumed."), ResumeFailed: true);
        }

        if (run.SignInFailed)
        {
            cli.Forget();
            return new Attempt(RunOutcome.Failed(new CliStatus(CliState.SignedOut, null, null).Problem!));
        }

        return new Attempt(RunOutcome.Failed(result.Subtype switch
        {
            "error_max_turns" => "The model used too many steps without giving an answer.",
            _ when result.Text.Length > 0 => result.Text,
            _ => $"Claude Code reported an error ({result.Subtype}).",
        }));
    }

    private static bool MentionsMissingConversation(string text) =>
        text.Contains("No conversation found", StringComparison.OrdinalIgnoreCase);

    /// <summary>Runs one tool call that arrived over the bridge, through the tool host.</summary>
    private async Task<ToolOutcome> InvokeAsync(RunState run, McpToolCall call, CancellationToken cancellationToken)
    {
        string id;
        if (call.ToolUseId is { } given)
        {
            // Claude Code said which call this is. Its announcement must not be matched to a later call.
            id = given;
            run.Claim(given);
        }
        else
        {
            id = await run.TakeToolUseIdAsync(ToolPrefix + call.Name, _toolUseIdWait, cancellationToken).ConfigureAwait(false)
                ?? "cli_" + Guid.NewGuid().ToString("N");
        }

        var request = new ToolRequest(id, call.Name, call.Arguments.GetRawText());
        run.StartTool(request);
        var started = Stopwatch.GetTimestamp();
        ToolOutcome outcome;
        try
        {
            outcome = await tools.InvokeAsync(request, new ToolContext(run.Context.SessionId, run.Context.MessageId, id), cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            run.FinishTool(id, ToolOutcome.Failed("The run was stopped before this tool finished."), null);
            throw;
        }

        run.FinishTool(id, outcome, (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        return outcome;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Claude Code started: model {Model}, {ToolCount} tools, tool servers: {Servers}.")]
    private static partial void LogStarted(ILogger logger, string model, int toolCount, string servers);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Claude Code could not be started.")]
    private static partial void LogStartFailed(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Information, Message = "Claude Code no longer has the conversation of session {SessionId}; starting a new one.")]
    private static partial void LogResumeFailed(ILogger logger, string sessionId);

    [LoggerMessage(Level = LogLevel.Error, Message = "Claude Code did not connect to the app's tool bridge ({Status}); the run was stopped.")]
    private static partial void LogBridgeDown(ILogger logger, string status);

    [LoggerMessage(Level = LogLevel.Error, Message = "Claude Code reported tools or tool servers that are not this app's; the run was stopped. First of them: {Tools}")]
    private static partial void LogForeignTools(ILogger logger, string tools);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Claude Code ended without a result line (exit code {ExitCode}).")]
    private static partial void LogNoResult(ILogger logger, int exitCode);

    /// <param name="Outcome">How the attempt ended.</param>
    /// <param name="ResumeFailed">True when Claude Code did not know the conversation and nothing was answered yet.</param>
    private sealed record Attempt(RunOutcome Outcome, bool ResumeFailed = false);

    /// <summary>
    /// What one attempt has produced so far. The output reader and the tool calls of the bridge run
    /// on different threads; everything that reaches the recorder goes through here, one at a time.
    /// </summary>
    private sealed class RunState(RunContext context, RunRecorder recorder)
    {
        private readonly Lock _sync = new();
        private readonly List<CliToolUse> _announced = [];
        private bool _sawDelta;
        private int _messages;

        public RunContext Context => context;

        public string? Model { get; set; }

        /// <summary>True once text or a tool call was recorded.</summary>
        public bool Produced { get; private set; }

        public bool SignInFailed { get; private set; }

        public void Record(CliEvent item)
        {
            lock (_sync)
            {
                switch (item)
                {
                    case CliMessageStart:
                        if (_messages++ > 0)
                        {
                            recorder.BeginNextStep();
                        }

                        _sawDelta = false;
                        break;
                    case CliTextDelta delta:
                        _sawDelta = true;
                        Produced = true;
                        recorder.Text(delta.Text);
                        break;
                    case CliThinkingDelta thinking:
                        recorder.Thinking(thinking.Text);
                        break;
                    case CliText whole when !_sawDelta:
                        // Arrives after its pieces. Used only when no pieces came.
                        Produced = true;
                        recorder.Text(whole.Text);
                        break;
                    case CliToolUse use:
                        _announced.Add(use);
                        break;
                    case CliRetry { Error: "authentication_failed" }:
                        SignInFailed = true;
                        break;
                }
            }
        }

        public void Finish(CliResult result)
        {
            lock (_sync)
            {
                if (!Produced && result.Text.Length > 0)
                {
                    recorder.Text(result.Text);
                }

                recorder.AddUsage(result.InputTokens, result.OutputTokens, Model);
            }
        }

        public void StartTool(ToolRequest request)
        {
            lock (_sync)
            {
                Produced = true;
                recorder.StartTool(request);
            }
        }

        public void FinishTool(string toolUseId, ToolOutcome outcome, long? durationMs)
        {
            lock (_sync)
            {
                recorder.FinishTool(toolUseId, outcome, durationMs);
            }
        }

        /// <summary>Marks an announced call as taken by id.</summary>
        public void Claim(string toolUseId)
        {
            lock (_sync)
            {
                _announced.RemoveAll(use => use.Id == toolUseId);
            }
        }

        /// <summary>
        /// The id of the model's oldest call of this tool that no bridge call has claimed yet.
        /// Claude Code announces a call on its output and makes it over the bridge; which of the two
        /// arrives first is not fixed, so this waits a moment for the announcement.
        /// </summary>
        public async Task<string?> TakeToolUseIdAsync(string modelToolName, TimeSpan wait, CancellationToken cancellationToken)
        {
            var deadline = Stopwatch.GetTimestamp();
            while (true)
            {
                lock (_sync)
                {
                    var index = _announced.FindIndex(use => use.Name == modelToolName);
                    if (index >= 0)
                    {
                        var id = _announced[index].Id;
                        _announced.RemoveAt(index);
                        return id;
                    }
                }

                if (Stopwatch.GetElapsedTime(deadline) >= wait)
                {
                    return null;
                }

                await Task.Delay(TimeSpan.FromMilliseconds(25), cancellationToken).ConfigureAwait(false);
            }
        }
    }
}
