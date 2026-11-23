using System.Diagnostics;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using TradingAgent.Data.Agent;

namespace TradingAgent.Agent.Runs;

/// <summary>
/// This app's own agent loop: call the model, run the tools it asks for, send the results back, and
/// repeat until the model answers without asking for a tool.
/// </summary>
/// <remarks>
/// The loop owns the session's transcript. One rule holds at every exit, including a cancel and an
/// error: a tool call in the transcript always has its result in the transcript. Both providers
/// reject a conversation with an unanswered tool call, which would leave the session unusable.
/// </remarks>
public sealed class ModelLoopRuntime : IAgentRuntime
{
    /// <summary>Most model calls in one reply. A model that still wants tools after this is stuck in a loop.</summary>
    public const int MaxSteps = 40;

    private const string CancelledResult = "The call was cancelled before it finished. Whether it had any effect is not known.";

    private readonly IModelClient _client;
    private readonly ToolHost _tools;
    private readonly TranscriptRepository _transcript;
    private readonly ISystemPrompt _systemPrompt;
    private readonly string _effort;

    public ModelLoopRuntime(
        IModelClient client,
        ToolHost tools,
        TranscriptRepository transcript,
        ISystemPrompt systemPrompt,
        string model,
        string effort)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(tools);
        ArgumentNullException.ThrowIfNull(transcript);
        ArgumentNullException.ThrowIfNull(systemPrompt);
        _client = client;
        _tools = tools;
        _transcript = transcript;
        _systemPrompt = systemPrompt;
        Model = model;
        _effort = effort;
    }

    public string Model { get; }

    public async Task<RunOutcome> ExecuteAsync(RunContext context, RunRecorder recorder, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(recorder);

        var items = LoadTranscript(context);
        Append(context.SessionId, items, [_client.UserItem(context.UserText)]);

        var systemPrompt = _systemPrompt.Build();
        for (var step = 0; step < MaxSteps; step++)
        {
            if (step > 0)
            {
                recorder.BeginNextStep();
            }

            var turn = await _client
                .StreamAsync(
                    new ModelRequest
                    {
                        Model = Model,
                        SystemPrompt = systemPrompt,
                        Transcript = items,
                        Tools = _tools.Definitions,
                        Effort = _effort,
                    },
                    recorder,
                    cancellationToken)
                .ConfigureAwait(false);

            Append(context.SessionId, items, turn.TranscriptItems);
            recorder.AddUsage(turn.InputTokens, turn.OutputTokens, turn.Model);

            if (turn.ToolRequests.Count > 0)
            {
                // Whatever the stop reason, calls that are in the transcript must be answered.
                var results = await RunToolsAsync(context, recorder, turn.ToolRequests, cancellationToken).ConfigureAwait(false);
                Append(context.SessionId, items, _client.ToolResultItems(results));
            }

            switch (turn.StopReason)
            {
                case StopReason.ToolUse when turn.ToolRequests.Count > 0:
                case StopReason.Paused:
                    continue;

                case StopReason.MaxTokens:
                    return RunOutcome.Failed("The answer reached the model's output limit and was cut off.");

                case StopReason.Refused:
                    return RunOutcome.Failed("The model declined to answer this request.");

                default:
                    return RunOutcome.Complete;
            }
        }

        return RunOutcome.Failed($"Stopped after {MaxSteps} steps: the model kept asking for tools without giving an answer.");
    }

    private List<string> LoadTranscript(RunContext context)
    {
        if (!context.RuntimeChanged)
        {
            return [.. _transcript.Load(context.SessionId).Select(item => item.Json)];
        }

        // The stored items were written for another provider. Start again from what the chat shows:
        // the words survive, tool calls and reasoning of the earlier turns do not.
        _transcript.Clear(context.SessionId);
        var seeded = new List<string>();
        foreach (var message in context.EarlierMessages)
        {
            if (string.IsNullOrWhiteSpace(message.Content))
            {
                continue;
            }

            if (message.Role == MessageRole.User)
            {
                seeded.Add(_client.UserItem(message.Content));
            }
            else if (message.Role == MessageRole.Assistant)
            {
                seeded.Add(_client.AssistantTextItem(message.Content));
            }
        }

        _transcript.Append(context.SessionId, _client.Provider, Model, seeded);
        return seeded;
    }

    private void Append(string sessionId, List<string> items, IReadOnlyList<string> added)
    {
        if (added.Count == 0)
        {
            return;
        }

        _transcript.Append(sessionId, _client.Provider, Model, added);
        items.AddRange(added);
    }

    private async Task<ToolResult[]> RunToolsAsync(
        RunContext context,
        RunRecorder recorder,
        IReadOnlyList<ToolRequest> requests,
        CancellationToken cancellationToken)
    {
        foreach (var request in requests)
        {
            recorder.StartTool(request);
        }

        var results = new ToolResult?[requests.Count];
        try
        {
            // Together: the model asked for them in one step because they do not depend on each other.
            await Task.WhenAll(requests.Select((request, index) => RunOneAsync(index, request))).ConfigureAwait(false);
        }
        catch
        {
            // The run is ending early: cancelled, or something failed while recording a result. First
            // answer what is still open in the transcript, so the session stays usable; only then
            // touch the display rows, which may be what failed.
            var open = Enumerable.Range(0, results.Length).Where(index => results[index] is null).ToArray();
            var answered = FillOpen(results, requests);
            _transcript.Append(context.SessionId, _client.Provider, Model, _client.ToolResultItems(answered));
            foreach (var index in open)
            {
                recorder.FinishTool(requests[index].Id, ToolOutcome.Failed(CancelledResult), durationMs: null);
            }

            throw;
        }

        return FillOpen(results, requests);

        async Task RunOneAsync(int index, ToolRequest request)
        {
            var started = Stopwatch.GetTimestamp();
            var outcome = await _tools
                .InvokeAsync(request, new ToolContext(context.SessionId, context.MessageId, request.Id), cancellationToken)
                .ConfigureAwait(false);
            recorder.FinishTool(request.Id, outcome, (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds);
            results[index] = new ToolResult(request.Id, outcome.Content, outcome.Status != ToolCallStatus.Succeeded);
        }
    }

    /// <summary>One result per request: the real one, or a "cancelled" error for a call that has none.</summary>
    private static ToolResult[] FillOpen(ToolResult?[] results, IReadOnlyList<ToolRequest> requests)
    {
        var complete = new ToolResult[results.Length];
        for (var i = 0; i < results.Length; i++)
        {
            complete[i] = results[i] ?? new ToolResult(requests[i].Id, CancelledResult, IsError: true);
        }

        return complete;
    }
}
