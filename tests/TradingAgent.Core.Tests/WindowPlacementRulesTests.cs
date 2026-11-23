using TradingAgent.Core.Shell;
using Xunit;

namespace TradingAgent.Core.Tests;

public sealed class WindowPlacementRulesTests
{
    private static readonly ScreenArea _primary = new(0, 0, 2560, 1400, Scaling: 1.0);
    private static readonly ScreenArea _left = new(-1920, 0, 1920, 1040, Scaling: 1.0);

    [Fact]
    public void Window_inside_a_screen_is_reachable()
    {
        var placement = new WindowPlacement(100, 100, 1400, 900, Maximized: false);

        Assert.True(WindowPlacementRules.IsReachable(placement, [_primary]));
    }

    [Fact]
    public void Window_on_a_second_monitor_with_negative_coordinates_is_reachable()
    {
        var placement = new WindowPlacement(-1800, 50, 1400, 900, Maximized: false);

        Assert.True(WindowPlacementRules.IsReachable(placement, [_primary, _left]));
    }

    [Fact]
    public void Window_left_on_an_unplugged_monitor_is_not_reachable()
    {
        var placement = new WindowPlacement(-1800, 50, 1400, 900, Maximized: false);

        Assert.False(WindowPlacementRules.IsReachable(placement, [_primary]));
    }

    [Theory]
    [InlineData(2560 - 64, 100, true)] // exactly the minimum strip still on screen
    [InlineData(2560 - 63, 100, false)] // one pixel less
    [InlineData(100, 1400 - 63, false)] // only a sliver at the bottom
    public void A_sliver_at_the_screen_edge_does_not_count(int x, int y, bool expected)
    {
        var placement = new WindowPlacement(x, y, 1400, 900, Maximized: false);

        Assert.Equal(expected, WindowPlacementRules.IsReachable(placement, [_primary]));
    }

    [Fact]
    public void Size_is_scaled_by_the_screen_it_is_tested_against()
    {
        // 1400 units wide ends at x = -1500 + 1400 = -100 at 100% scale: left of the screen.
        // At 150% it is 2100 pixels wide and reaches x = 600: well onto the screen.
        var placement = new WindowPlacement(-1500, 100, 1400, 900, Maximized: false);

        Assert.False(WindowPlacementRules.IsReachable(placement, [_primary]));
        Assert.True(WindowPlacementRules.IsReachable(placement, [_primary with { Scaling = 1.5 }]));
    }

    [Fact]
    public void Unknown_screens_do_not_discard_the_placement()
    {
        var placement = new WindowPlacement(-5000, -5000, 1400, 900, Maximized: false);

        Assert.True(WindowPlacementRules.IsReachable(placement, []));
    }

    [Fact]
    public void Normalize_raises_a_too_small_size_to_the_minimum_and_keeps_the_rest()
    {
        var placement = new WindowPlacement(10, 20, 640, 480, Maximized: true);

        Assert.Equal(new WindowPlacement(10, 20, 1024, 700, Maximized: true), WindowPlacementRules.Normalize(placement));
        Assert.Equal(
            new WindowPlacement(10, 20, 1600, 1000, Maximized: false),
            WindowPlacementRules.Normalize(new WindowPlacement(10, 20, 1600, 1000, Maximized: false)));
    }
}
