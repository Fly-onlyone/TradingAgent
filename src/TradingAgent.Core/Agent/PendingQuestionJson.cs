using System.Text.Json;
using System.Text.Json.Serialization;

namespace TradingAgent.Core.Agent;

/// <summary>Reads and writes a <see cref="PendingQuestion"/> as the JSON kept on its session.</summary>
public static class PendingQuestionJson
{
    public static string Serialize(PendingQuestion question)
    {
        ArgumentNullException.ThrowIfNull(question);
        return JsonSerializer.Serialize(question, AgentJsonContext.Default.PendingQuestion);
    }

    /// <summary>Returns null for text that is not a pending question: a damaged value must not break a session.</summary>
    public static PendingQuestion? Deserialize(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            var question = JsonSerializer.Deserialize(json, AgentJsonContext.Default.PendingQuestion);
            return question is { Id.Length: > 0, Question: not null, Options: not null } ? question : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.SnakeCaseLower)]
[JsonSerializable(typeof(PendingQuestion))]
internal sealed partial class AgentJsonContext : JsonSerializerContext;
