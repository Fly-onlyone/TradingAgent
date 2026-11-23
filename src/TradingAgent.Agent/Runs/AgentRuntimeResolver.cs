using TradingAgent.Agent.Models;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Agent;

namespace TradingAgent.Agent.Runs;

/// <summary>The runtime chosen for a run, or why none can be used.</summary>
/// <param name="Runtime">Null when no runtime can be used.</param>
/// <param name="Provider"><c>anthropic</c> or <c>openai</c>.</param>
/// <param name="AuthMode"><c>api_key</c> or <c>subscription</c>.</param>
/// <param name="Problem">Why there is no runtime, in words for the user.</param>
public sealed record ResolvedRuntime(IAgentRuntime? Runtime, string Provider, string AuthMode, string? Problem = null);

/// <summary>Chooses the runtime for a run from the settings as they are at that moment.</summary>
public interface IAgentRuntimeResolver
{
    ResolvedRuntime Resolve();
}

/// <inheritdoc cref="IAgentRuntimeResolver"/>
/// <remarks>
/// <c>agent.provider</c> picks the provider and <c>agent.auth_mode</c> the way to sign in. OpenAI has
/// only API keys. The sign-in mode is obeyed as set: a saved API key is not used in subscription mode,
/// so a subscription user is never billed on a key by surprise.
/// </remarks>
public sealed class AgentRuntimeResolver(
    ISettingsStore settings,
    AnthropicModelClient anthropic,
    OpenAiModelClient openAi,
    ToolHost tools,
    TranscriptRepository transcript,
    ISystemPrompt systemPrompt) : IAgentRuntimeResolver
{
    public ResolvedRuntime Resolve()
    {
        var provider = settings.GetValue(SettingKeys.AgentProvider) == AgentWire.OpenAi ? AgentWire.OpenAi : AgentWire.Anthropic;
        var configuredModel = settings.GetValue(SettingKeys.AgentModel);
        var effort = ModelCatalog.AnthropicEffort(settings.GetValue(SettingKeys.AgentEffort));

        if (provider == AgentWire.OpenAi)
        {
            return new ResolvedRuntime(
                new ModelLoopRuntime(openAi, tools, transcript, systemPrompt, ModelCatalog.Resolve(provider, configuredModel), effort),
                provider,
                AgentWire.ApiKey);
        }

        var authMode = settings.GetValue(SettingKeys.AgentAuthMode) == AgentWire.ApiKey ? AgentWire.ApiKey : AgentWire.Subscription;
        if (authMode == AgentWire.Subscription)
        {
            return new ResolvedRuntime(
                null,
                provider,
                authMode,
                "Signing in with a Claude subscription is not available in this version yet. "
                + "Choose \"API key\" as the sign-in mode in Settings.");
        }

        return new ResolvedRuntime(
            new ModelLoopRuntime(anthropic, tools, transcript, systemPrompt, ModelCatalog.Resolve(provider, configuredModel), effort),
            provider,
            authMode);
    }
}

/// <summary>The instructions used until the full prompt of the trading agent is ported.</summary>
public sealed class DefaultSystemPrompt : ISystemPrompt
{
    public string Build() =>
        """
        You are the assistant inside Trading agent, a desktop app for one person who trades cryptocurrency on OKX.

        Answer in plain language and keep answers short. Use the tools you are given to look things up
        instead of guessing; if a tool fails, say so and say what you would need. Never state a price,
        balance or position that you did not get from a tool in this conversation.

        You cannot place, change or cancel orders in this version. If asked to, say so.
        """;
}
