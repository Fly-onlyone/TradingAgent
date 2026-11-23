using System.Text.Json;
using TradingAgent.Agent.Models;

namespace TradingAgent.Agent.Tools;

/// <summary>Lets the model ask the user a question and wait for the answer.</summary>
public sealed class AskUserTool(QuestionBroker questions) : ITool
{
    public const string Name = "ask_user";

    public ToolDefinition Definition { get; } = new(
        Name,
        "Ask the user a question and wait for the answer. Use it when you cannot go on without a decision "
        + "that only the user can make, for example which of several symbols they mean, or whether to "
        + "accept a risk. Give 2 to 4 options when the choices are known; leave options empty for a free "
        + "answer. Do not use it for things you can look up with another tool.",
        """
        {
          "type": "object",
          "properties": {
            "question": { "type": "string", "description": "The question, as one clear sentence." },
            "options": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Answers the user can pick from. Empty for a free answer."
            },
            "multi_select": { "type": "boolean", "description": "True if the user may pick several options." }
          },
          "required": ["question"]
        }
        """);

    // A person needs longer than a program; the broker ends the wait itself after its own limit.
    public TimeSpan? Timeout => QuestionBroker.AnswerTimeout + TimeSpan.FromSeconds(30);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        if (!input.TryGetProperty("question", out var questionProperty)
            || questionProperty.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(questionProperty.GetString()))
        {
            return ToolOutcome.Failed("'question' is required and must be text.");
        }

        var options = new List<string>();
        if (input.TryGetProperty("options", out var optionsProperty) && optionsProperty.ValueKind == JsonValueKind.Array)
        {
            foreach (var option in optionsProperty.EnumerateArray())
            {
                if (option.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(option.GetString()))
                {
                    options.Add(option.GetString()!);
                }
            }
        }

        var multiSelect = input.TryGetProperty("multi_select", out var multi) && multi.ValueKind == JsonValueKind.True;

        var answer = await questions
            .AskAsync(context.SessionId, questionProperty.GetString()!, options, multiSelect, timeout: null, cancellationToken)
            .ConfigureAwait(false);

        return answer is null
            ? ToolOutcome.Failed("The user did not answer within 5 minutes. Go on without the answer, or say what you need.")
            : new ToolOutcome($"The user answered: {answer}");
    }
}
