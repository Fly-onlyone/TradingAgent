using System.Globalization;
using System.Text.RegularExpressions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Runs;
using TradingAgent.Core.Settings;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed partial class TradingSystemPromptTests
{
    private readonly FakeSettings _settings = new();

    [Theory]
    [InlineData(true, "DEMO mode", "LIVE mode")]
    [InlineData(false, "LIVE mode", "DEMO mode")]
    public void The_model_is_told_which_exchange_its_orders_go_to(bool sandbox, string expected, string never)
    {
        _settings.SetValue(SettingKeys.OkxSandbox, sandbox);

        var prompt = new TradingSystemPrompt(_settings).Build();

        Assert.Contains(expected, prompt, StringComparison.Ordinal);
        Assert.DoesNotContain(never, prompt, StringComparison.Ordinal);
    }

    [Fact]
    public void The_risk_rules_carry_the_users_own_limits()
    {
        _settings.SetValue(SettingKeys.RiskMaxPositionSizePercent, 7.5);
        _settings.SetValue(SettingKeys.RiskStopLossPercent, 1.25);
        _settings.SetValue(SettingKeys.RiskTakeProfitPercent, 4);

        var prompt = new TradingSystemPrompt(_settings).Build();

        Assert.Contains("at or below 7.5 % of the account, counting what is already held", prompt, StringComparison.Ordinal);
        Assert.Contains("larger than 7.5 % of the account", prompt, StringComparison.Ordinal);
        // The way out of a position is named, so that the limit is not met with a retry.
        Assert.Contains("a spot sell with `tdMode` `cash`, or a swap order with `reduceOnly` true", prompt, StringComparison.Ordinal);
        Assert.Contains("the stop-loss is 1.25 % and the take-profit 4 % from the entry price", prompt, StringComparison.Ordinal);
    }

    [Fact]
    public void The_limits_it_names_are_the_ones_the_gate_enforces()
    {
        var prompt = new TradingSystemPrompt(_settings).Build();

        Assert.Contains($"a whole number from 1 to {RiskGate.MaxLeverage}", prompt, StringComparison.Ordinal);
        Assert.Contains($"is above {RiskGate.MaxTransferAmount.ToString(CultureInfo.InvariantCulture)}", prompt, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("search_web")]
    [InlineData("search_news")]
    [InlineData("browse_url")]
    [InlineData("extract_strategy_from_url")]
    [InlineData("search_strategies")]
    [InlineData("search_lessons")]
    [InlineData("save_memory")]
    [InlineData("create_task")]
    [InlineData("submit_recommendation")]
    [InlineData("mcp__okx__")]
    public void It_promises_no_tool_of_the_old_app_that_does_not_exist_here(string tool)
    {
        // A model told it has a tool it does not have invents the result.
        Assert.DoesNotContain(tool, new TradingSystemPrompt(_settings).Build(), StringComparison.Ordinal);
    }

    [Fact]
    public void Every_trade_kit_tool_it_names_is_in_the_inventory()
    {
        var named = KitToolName().Matches(new TradingSystemPrompt(_settings).Build()).Select(match => match.Value).Distinct().ToList();

        Assert.NotEmpty(named);
        Assert.All(named, name => Assert.NotEqual(AtkToolKind.Unknown, AtkToolCatalog.Kind(AtkToolCatalog.ToolName(name)!)));
    }

    [Fact]
    public void It_leaves_the_client_order_id_to_the_app_and_calls_a_refusal_final()
    {
        var prompt = new TradingSystemPrompt(_settings).Build();

        Assert.Contains("Do not set `clOrdId`", prompt, StringComparison.Ordinal);
        // The old prompt taught a format with a hyphen, which OKX does not accept.
        Assert.DoesNotContain("SESSION", prompt, StringComparison.Ordinal);
        Assert.Contains("A refusal is final", prompt, StringComparison.Ordinal);
        Assert.Contains("do not take that action on your own", prompt, StringComparison.Ordinal);
        Assert.Contains("Never send the same order again", prompt, StringComparison.Ordinal);
    }

    [Fact]
    public void The_text_is_the_same_from_run_to_run_so_that_the_provider_can_cache_it()
    {
        var prompt = new TradingSystemPrompt(_settings);

        Assert.Equal(prompt.Build(), prompt.Build());
        Assert.DoesNotContain(DateTime.UtcNow.Year.ToString(CultureInfo.InvariantCulture), prompt.Build(), StringComparison.Ordinal);
    }

    [GeneratedRegex("okx_[a-z]+_[a-z_]+")]
    private static partial Regex KitToolName();
}
