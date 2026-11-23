using System.Text.Json;
using System.Text.RegularExpressions;
using TradingAgent.Agent.Atk;
using Xunit;

namespace TradingAgent.Agent.Tests;

/// <summary>
/// Holds the inventory against what the real trade kit reports. <c>Fixtures/atk-1.3.3-tools.json</c>
/// was read from the running kit of the pinned version with the default modules: for each tool its
/// name, whether the kit marks it as read-only, and the names of its arguments.
/// </summary>
public sealed partial class AtkToolCatalogTests
{
    private static readonly List<KitTool> _kit = LoadFixture();

    [Fact]
    public void The_fixture_is_of_the_version_the_app_pins()
    {
        // The fixture's file name carries the version; this fails when one is changed without the other.
        Assert.Equal("1.3.3", AtkCommandResolver.PinnedVersion);
        Assert.Equal(93, _kit.Count);
    }

    [Fact]
    public void Every_tool_the_kit_offers_is_either_in_the_inventory_or_left_out_on_purpose()
    {
        var undecided = _kit.Where(tool => AtkToolCatalog.Kind(tool.Name) == AtkToolKind.Unknown && !AtkToolCatalog.IsExcluded(tool.Name));

        Assert.Empty(undecided.Select(tool => tool.Name));
    }

    [Fact]
    public void Every_tool_of_the_inventory_exists_in_the_kit()
    {
        var offered = _kit.Select(tool => tool.Name).ToHashSet(StringComparer.Ordinal);
        var missing = AtkToolCatalog.Names.Where(name => !offered.Contains(name)).ToList();

        Assert.Empty(missing);
        Assert.Equal(92, AtkToolCatalog.Names.Count());
    }

    [Fact]
    public void No_tool_the_kit_marks_as_writing_is_listed_as_reading()
    {
        var mislabelled = _kit.Where(tool => !tool.ReadOnly && AtkToolCatalog.Kind(tool.Name) == AtkToolKind.Read);

        Assert.Empty(mislabelled.Select(tool => tool.Name));
    }

    [Fact]
    public void Every_tool_the_kit_marks_as_reading_is_listed_as_reading()
    {
        var mislabelled = _kit.Where(tool => tool.ReadOnly && AtkToolCatalog.Kind(tool.Name) != AtkToolKind.Read);

        Assert.Empty(mislabelled.Select(tool => tool.Name));
        Assert.Equal(65, AtkToolCatalog.Names.Count(name => AtkToolCatalog.Kind(name) == AtkToolKind.Read));
    }

    [Fact]
    public void A_tool_left_out_on_purpose_is_not_in_the_inventory()
    {
        Assert.True(AtkToolCatalog.IsExcluded("account_set_position_mode"));
        Assert.Equal(AtkToolKind.Unknown, AtkToolCatalog.Kind("account_set_position_mode"));
        Assert.False(AtkToolCatalog.IsExcluded("spot_place_order"));
    }

    [Theory]
    [InlineData("spot_place_order", AtkToolKind.Place)]
    [InlineData("swap_place_order", AtkToolKind.Place)]
    [InlineData("swap_close_position", AtkToolKind.Place)]
    [InlineData("spot_amend_order", AtkToolKind.Place)]
    [InlineData("spot_batch_orders", AtkToolKind.Place)]
    [InlineData("swap_batch_orders", AtkToolKind.Place)]
    [InlineData("swap_batch_amend", AtkToolKind.Place)]
    [InlineData("swap_place_move_stop_order", AtkToolKind.Place)]
    [InlineData("grid_create_order", AtkToolKind.Place)]
    [InlineData("grid_amend_order", AtkToolKind.Place)]
    [InlineData("dca_create_order", AtkToolKind.Place)]
    [InlineData("spot_cancel_order", AtkToolKind.Cancel)]
    [InlineData("swap_cancel_algo_orders", AtkToolKind.Cancel)]
    [InlineData("spot_batch_cancel", AtkToolKind.Cancel)]
    [InlineData("grid_stop_order", AtkToolKind.Cancel)]
    [InlineData("dca_stop_order", AtkToolKind.Cancel)]
    [InlineData("account_transfer", AtkToolKind.Transfer)]
    [InlineData("swap_set_leverage", AtkToolKind.Leverage)]
    [InlineData("spot_set_leverage", AtkToolKind.Leverage)]
    [InlineData("market_get_ticker", AtkToolKind.Read)]
    [InlineData("account_get_balance", AtkToolKind.Read)]
    public void A_tool_has_the_kind_the_risk_gate_decides_by(string tool, AtkToolKind kind)
    {
        Assert.Equal(kind, AtkToolCatalog.Kind(tool));
        Assert.Equal(kind != AtkToolKind.Read, AtkToolCatalog.IsWrite(kind));
    }

    [Theory]
    [InlineData("withdraw_everything")]
    [InlineData("")]
    [InlineData("SPOT_PLACE_ORDER")]
    [InlineData("okx_market_get_ticker")]
    [InlineData("market_get_ticker ")]
    public void A_name_that_is_not_in_the_inventory_has_no_kind(string name)
    {
        Assert.Equal(AtkToolKind.Unknown, AtkToolCatalog.Kind(name));
        Assert.False(AtkToolCatalog.IsWrite(AtkToolKind.Unknown));
    }

    [Fact]
    public void The_names_the_model_sees_are_prefixed_and_fit_both_providers_rules()
    {
        Assert.All(AtkToolCatalog.Names, name =>
        {
            var modelName = AtkToolCatalog.ModelName(name);
            Assert.StartsWith("okx_", modelName, StringComparison.Ordinal);
            // Anthropic and OpenAI both allow letters, digits, _ and -, up to 64 characters.
            Assert.Matches(ToolNameRule(), modelName);
            Assert.Equal(name, AtkToolCatalog.ToolName(modelName));
        });
        Assert.Null(AtkToolCatalog.ToolName("get_ticker"));
        Assert.Null(AtkToolCatalog.ToolName("OKX_market_get_ticker"));
    }

    [GeneratedRegex("^[a-zA-Z0-9_-]{1,64}$")]
    private static partial Regex ToolNameRule();

    private static List<KitTool> LoadFixture()
    {
        using var stream = typeof(AtkToolCatalogTests).Assembly.GetManifestResourceStream("atk-1.3.3-tools.json")
            ?? throw new InvalidOperationException("The trade kit fixture is not embedded in the test assembly.");
        using var document = JsonDocument.Parse(stream);
        return
        [
            .. document.RootElement.EnumerateArray().Select(tool => new KitTool(
                tool.GetProperty("name").GetString()!,
                tool.GetProperty("readOnly").GetBoolean())),
        ];
    }

    private sealed record KitTool(string Name, bool ReadOnly);
}
