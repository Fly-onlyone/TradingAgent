using TradingAgent.Core.Agent;

namespace TradingAgent.Agent.Models;

/// <summary>
/// Turns the model name kept in settings into a provider's model id. This is the one place that knows
/// model ids: nothing else in the app may name one.
/// </summary>
/// <remarks>
/// Settings hold a family name (<c>sonnet</c>), so that a new model generation is one changed line
/// here and not a setting every user has to edit. A value that is not a known family is taken as a
/// full model id, which lets a user pin a model.
/// </remarks>
public static class ModelCatalog
{
    /// <summary>Used for a provider when the setting holds a family of the other provider.</summary>
    public const string DefaultAnthropicFamily = "sonnet";

    /// <inheritdoc cref="DefaultAnthropicFamily"/>
    public const string DefaultOpenAiModel = "gpt-5.5";

    private static readonly Dictionary<string, string> _anthropic = new(StringComparer.OrdinalIgnoreCase)
    {
        ["sonnet"] = "claude-sonnet-5-5",
        ["opus"] = "claude-opus-5-5",
        ["haiku"] = "claude-haiku-5-5",
        ["fable"] = "claude-fable-5-2",
    };

    private static readonly Dictionary<string, string> _openAi = new(StringComparer.OrdinalIgnoreCase)
    {
        ["gpt-5-5"] = "gpt-5.5",
    };

    // Models whose safety systems can decline a request and that accept a provider-side fallback for it.
    private static readonly HashSet<string> _refusalFallback = new(StringComparer.Ordinal)
    {
        "claude-fable-5-2",
        "claude-opus-5-5",
        "claude-sonnet-5-5",
    };

    /// <summary>The model id to send to <paramref name="provider"/> for the setting value <paramref name="configured"/>.</summary>
    public static string Resolve(string provider, string? configured)
    {
        var name = configured?.Trim() ?? string.Empty;
        if (provider == AgentWire.OpenAi)
        {
            if (_openAi.TryGetValue(name, out var openAiId))
            {
                return openAiId;
            }

            // A Claude family left over from the other provider, or nothing: fall back.
            return name.Length == 0 || _anthropic.ContainsKey(name) || name.StartsWith("claude", StringComparison.OrdinalIgnoreCase)
                ? DefaultOpenAiModel
                : name;
        }

        if (_anthropic.TryGetValue(name, out var anthropicId))
        {
            return anthropicId;
        }

        return name.StartsWith("claude", StringComparison.OrdinalIgnoreCase) ? name : _anthropic[DefaultAnthropicFamily];
    }

    /// <summary>True when a declined request on this model can be retried by the provider on another model.</summary>
    public static bool SupportsRefusalFallback(string modelId) => _refusalFallback.Contains(modelId);

    /// <summary>
    /// The effort value for OpenAI's reasoning models. They have no <c>max</c>; the app's two highest
    /// levels both map to their highest.
    /// </summary>
    public static string OpenAiEffort(string effort) => effort switch
    {
        "low" => "low",
        "medium" => "medium",
        "xhigh" or "max" => "xhigh",
        _ => "high",
    };

    /// <summary>A valid effort for the Anthropic API; an unknown setting value becomes <c>high</c>.</summary>
    public static string AnthropicEffort(string? effort) => effort switch
    {
        "low" or "medium" or "high" or "xhigh" or "max" => effort,
        _ => "high",
    };
}
