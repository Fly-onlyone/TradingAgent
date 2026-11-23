using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Models;

namespace TradingAgent.Agent.Tools;

/// <summary>
/// The one way a tool gets called, whichever runtime asks. It finds the tool, runs the gates, runs the
/// tool with a time limit, and always answers with an outcome: a tool call never ends in an exception.
/// </summary>
/// <remarks>
/// Only tools registered here exist for the model. A name that is not registered is refused, so a
/// model cannot reach anything by guessing a name.
/// </remarks>
public sealed partial class ToolHost
{
    /// <summary>Longest tool result passed to the model, in characters.</summary>
    public const int MaxResultLength = 200_000;

    private readonly Dictionary<string, ITool> _tools = new(StringComparer.Ordinal);
    private readonly ToolDefinition[] _definitions;
    private readonly IToolSource[] _sources;
    private readonly IToolGate[] _gates;
    private readonly TimeSpan _timeout;
    private readonly ILogger<ToolHost> _logger;

    /// <param name="tools">The tools that always exist. Names must be unique.</param>
    /// <param name="gates">Checks run before every call, in this order.</param>
    /// <param name="logger">Receives failures. Never tool arguments or results.</param>
    /// <param name="timeout">Longest a tool may run; two minutes when null.</param>
    /// <param name="sources">Tools that come and go while the app runs. A fixed tool wins over one of the same name.</param>
    public ToolHost(
        IEnumerable<ITool> tools,
        IEnumerable<IToolGate> gates,
        ILogger<ToolHost> logger,
        TimeSpan? timeout = null,
        IEnumerable<IToolSource>? sources = null)
    {
        ArgumentNullException.ThrowIfNull(tools);
        ArgumentNullException.ThrowIfNull(gates);
        ArgumentNullException.ThrowIfNull(logger);
        _sources = [.. sources ?? []];
        foreach (var tool in tools)
        {
            if (!_tools.TryAdd(tool.Definition.Name, tool))
            {
                throw new ArgumentException($"Two tools are named '{tool.Definition.Name}'.", nameof(tools));
            }
        }

        // Sorted: the tool list is part of the cached prompt prefix and must not change order between runs.
        _definitions = [.. _tools.Values.Select(tool => tool.Definition).OrderBy(definition => definition.Name, StringComparer.Ordinal)];
        _gates = [.. gates];
        _timeout = timeout ?? TimeSpan.FromMinutes(2);
        _logger = logger;
    }

    /// <summary>The tools to describe to the model right now, in a stable order.</summary>
    public IReadOnlyList<ToolDefinition> Definitions
    {
        get
        {
            if (_sources.Length == 0)
            {
                return _definitions;
            }

            var definitions = new SortedDictionary<string, ToolDefinition>(StringComparer.Ordinal);
            foreach (var source in _sources)
            {
                foreach (var tool in source.GetTools())
                {
                    definitions.TryAdd(tool.Definition.Name, tool.Definition);
                }
            }

            foreach (var definition in _definitions)
            {
                definitions[definition.Name] = definition;
            }

            return [.. definitions.Values];
        }
    }

    /// <summary>Runs one tool call. Never throws, except for cancellation by <paramref name="cancellationToken"/>.</summary>
    public async Task<ToolOutcome> InvokeAsync(ToolRequest request, ToolContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(context);

        if (Find(request.Name) is not { } tool)
        {
            return ToolOutcome.Failed($"There is no tool named '{request.Name}'.");
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(request.InputJson);
        }
        catch (JsonException)
        {
            return ToolOutcome.Failed("The arguments are not valid JSON. Send the tool's arguments as one JSON object.");
        }

        using (document)
        {
            var input = document.RootElement;
            if (input.ValueKind != JsonValueKind.Object)
            {
                return ToolOutcome.Failed("The arguments must be a JSON object.");
            }

            foreach (var gate in _gates)
            {
                GateDecision decision;
                try
                {
                    decision = await gate.CheckAsync(request.Name, input, context, cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    throw;
                }
#pragma warning disable CA1031 // Fail closed: a gate that cannot decide must refuse, whatever went wrong.
                catch (Exception ex)
#pragma warning restore CA1031
                {
                    LogGateFailed(_logger, request.Name, ex);
                    return ToolOutcome.Denied("The safety check for this call failed, so the call was refused.");
                }

                if (!decision.Allowed)
                {
                    return ToolOutcome.Denied(decision.Reason ?? "The call was refused.");
                }

                if (decision.Input is { } replaced)
                {
                    input = replaced;
                }
            }

            var timeout = tool.Timeout ?? _timeout;
            using var limit = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            limit.CancelAfter(timeout);
            try
            {
                var outcome = await tool.InvokeAsync(input, context, limit.Token).ConfigureAwait(false);
                return outcome.Content.Length <= MaxResultLength
                    ? outcome
                    : outcome with
                    {
                        // Said in the result itself, so the model knows it does not have all of it.
                        Content = string.Concat(
                            outcome.Content.AsSpan(0, MaxResultLength),
                            $"\n[The result was cut off after {MaxResultLength} characters. Ask for less data.]"),
                    };
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (OperationCanceledException)
            {
                return ToolOutcome.Failed($"The tool did not finish within {timeout.TotalSeconds:0} seconds.");
            }
#pragma warning disable CA1031 // A tool's failure is an answer for the model, not a crash of the run.
            catch (Exception ex)
#pragma warning restore CA1031
            {
                LogToolFailed(_logger, request.Name, ex);
                return ToolOutcome.Failed($"The tool failed: {ex.Message}");
            }
        }
    }

    private ITool? Find(string name)
    {
        if (_tools.TryGetValue(name, out var tool))
        {
            return tool;
        }

        foreach (var source in _sources)
        {
            foreach (var candidate in source.GetTools())
            {
                if (candidate.Definition.Name == name)
                {
                    return candidate;
                }
            }
        }

        return null;
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "The safety check for tool '{Tool}' threw; the call was refused.")]
    private static partial void LogGateFailed(ILogger logger, string tool, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Tool '{Tool}' failed.")]
    private static partial void LogToolFailed(ILogger logger, string tool, Exception exception);
}
