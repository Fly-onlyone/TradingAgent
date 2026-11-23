using TradingAgent.Agent.Models;
using TradingAgent.Core.Agent;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class ModelCatalogTests
{
    [Theory]
    [InlineData("sonnet", "claude-sonnet-5-5")]
    [InlineData("Opus", "claude-opus-5-5")]
    [InlineData("haiku", "claude-haiku-5-5")]
    [InlineData("fable", "claude-fable-5-2")]
    // A full id pins a model.
    [InlineData("claude-opus-4-8", "claude-opus-4-8")]
    // Nothing, or a name of the other provider, falls back to the default family.
    [InlineData(null, "claude-sonnet-5-5")]
    [InlineData("", "claude-sonnet-5-5")]
    [InlineData("gpt-5-5", "claude-sonnet-5-5")]
    public void Anthropic_setting_values_become_model_ids(string? configured, string expected) =>
        Assert.Equal(expected, ModelCatalog.Resolve(AgentWire.Anthropic, configured));

    [Theory]
    [InlineData("gpt-5-5", "gpt-5.5")]
    [InlineData("gpt-6-mini", "gpt-6-mini")]
    [InlineData("sonnet", "gpt-5.5")]
    [InlineData("claude-opus-5-5", "gpt-5.5")]
    [InlineData(null, "gpt-5.5")]
    public void OpenAi_setting_values_become_model_ids(string? configured, string expected) =>
        Assert.Equal(expected, ModelCatalog.Resolve(AgentWire.OpenAi, configured));

    [Theory]
    [InlineData("low", "low", "low")]
    [InlineData("medium", "medium", "medium")]
    [InlineData("high", "high", "high")]
    [InlineData("xhigh", "xhigh", "xhigh")]
    [InlineData("max", "max", "xhigh")]
    [InlineData("turbo", "high", "high")]
    [InlineData(null, "high", "high")]
    public void Effort_is_always_a_value_the_provider_accepts(string? setting, string anthropic, string openAi)
    {
        var normalized = ModelCatalog.AnthropicEffort(setting);

        Assert.Equal(anthropic, normalized);
        Assert.Equal(openAi, ModelCatalog.OpenAiEffort(normalized));
    }
}
