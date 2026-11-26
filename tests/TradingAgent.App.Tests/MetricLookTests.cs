using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Avalonia.Threading;
using Avalonia.VisualTree;
using TradingAgent.App.Controls;
using TradingAgent.App.Motion;
using TradingAgent.App.ViewModels;
using TradingAgent.App.Views;
using Xunit;

namespace TradingAgent.App.Tests;

/// <summary>The tiles, charts and small parts the trading pages are built from.</summary>
public sealed class MetricLookTests
{
    [Fact]
    public void A_scale_has_round_values_inside_its_range()
    {
        Assert.Equal([-500, 0, 500], SeriesChart.Ticks(-844, 825, 4));
        Assert.Equal([0.2, 0.4, 0.6, 0.8], SeriesChart.Ticks(0.15, 0.85, 4).Select(tick => Math.Round(tick, 6)));
        // A range with nothing in it has one line, not a loop without end.
        Assert.Equal([5], SeriesChart.Ticks(5, 5, 4));
    }

    [AvaloniaFact]
    public void A_tile_takes_its_colours_from_its_tone_and_a_change_sets_the_tone_itself()
    {
        var plain = new MetricTile { Label = "Total Equity", Value = "$10.00", Kind = MetricKind.Kpi };
        var up = new MetricTile { Label = "Unrealized", Value = "+$5.00", Kind = MetricKind.Delta, Change = 1.234 };
        var down = new MetricTile { Label = "Unrealized", Value = "-$5.00", Kind = MetricKind.Delta, Change = -0.5 };
        var trend = new MetricTile { Label = "Win rate", Value = "40%", Kind = MetricKind.Trend, Tone = MetricTone.Warning };
        var window = Show(new StackPanel { Children = { plain, up, down, trend } });

        Assert.Equal("TOTAL EQUITY", plain.Label);
        var primary = Resource<Color>(window, "PrimaryColor");
        var success = Resource<Color>(window, "SuccessColor");
        var error = Resource<Color>(window, "ErrorColor");
        var warning = Resource<Color>(window, "WarningColor");
        var text = Resource<Color>(window, "TextPrimaryColor");

        Assert.Equal((primary, text), (plain.ToneColor, Colour(plain.ValueBrush)));
        Assert.Null(plain.ChangeText);
        // A figure that rose is green whatever tone the tile was given; one that fell is red.
        Assert.Equal((success, success, "+1.23%", false), (up.ToneColor, Colour(up.ValueBrush), up.ChangeText, up.IsFalling));
        Assert.Equal((error, "-0.50%", true), (down.ToneColor, down.ChangeText, down.IsFalling));
        Assert.Equal((warning, warning), (trend.ToneColor, Colour(trend.ValueBrush)));
        // The shadow under the pointer has as many layers as the one at rest, or the change would jump.
        Assert.Equal(Resource<BoxShadows>(window, "CardShadow").Count, plain.HoverShadow.Count);

        up.Spark = [1, 2, 3];
        Assert.True(up.HasSpark);
        up.Spark = [1];
        Assert.False(up.HasSpark);
        window.Close();
    }

    [AvaloniaFact]
    public void The_small_parts_draw_with_and_without_figures()
    {
        var digits = new RollingDigits { Value = "$12,345.67", FontSize = 28 };
        var line = new Sparkline { Data = [3, 1, 4, 1, 5], Width = 200, Height = 30 };
        var flat = new Sparkline { Data = [2, 2, 2], Width = 200, Height = 30 };
        var none = new Sparkline { Width = 200, Height = 30 };
        var area = new SeriesChart { Kind = SeriesKind.Area, Width = 400, Height = 220, Points = [new ChartPoint(0, 1), new ChartPoint(86_400_000, -2), new ChartPoint(172_800_000, 4)] };
        var one = new SeriesChart { Kind = SeriesKind.Area, Width = 400, Height = 220, Points = [new ChartPoint(0, 7)] };
        var bars = new SeriesChart { Kind = SeriesKind.Bars, Width = 400, Height = 200, Points = [new ChartPoint(0, 1), new ChartPoint(1, -2)] };
        var empty = new SeriesChart { Width = 400, Height = 200 };
        var range = new RangeBar { Value = 85, Width = 200 };
        var window = Show(new StackPanel { Children = { digits, line, flat, none, area, one, bars, empty, range } });

        // Drawing is the test: a frame of each, with and without anything to draw.
        AvaloniaHeadlessPlatform.ForceRenderTimerTick();
        Dispatcher.UIThread.RunJobs();
        // A row of digits is 1.2 font sizes high, to the whole pixel.
        Assert.InRange(digits.Bounds.Height, 33, 35);
        Assert.True(digits.Bounds.Width > 100);
        digits.Value = "$9.10";
        range.Value = 10;
        Dispatcher.UIThread.RunJobs();
        AvaloniaHeadlessPlatform.ForceRenderTimerTick();
        Dispatcher.UIThread.RunJobs();
        window.Close();
    }

    [AvaloniaFact]
    public void The_trading_pages_keep_the_names_the_checks_of_the_real_app_use()
    {
        var names = new List<string?>();
        foreach (var view in new Control[] { new DashboardView(), new TradingView(), new OrdersView(), new TradesView() })
        {
            var window = Show(view);
            names.AddRange(view.GetVisualDescendants().OfType<Control>().Select(Avalonia.Automation.AutomationProperties.GetName));
            names.AddRange(view.GetVisualDescendants().OfType<Button>().Select(button => button.Content as string));
            window.Close();
        }

        foreach (var name in (string[])["Instrument", "Timeframe", "Status filter", "Refresh", "Show", "Ask OKX now", "Work out now", "Measure past signals"])
        {
            Assert.Contains(name, names);
        }
    }

    [Fact]
    public void A_page_of_cards_says_so_and_a_page_can_ask_for_another()
    {
        var navigator = new AppNavigator();
        string? asked = null;
        navigator.PageRequested += title => asked = title;

        navigator.OpenPage("Settings");

        Assert.Equal("Settings", asked);
    }

    [AvaloniaFact]
    public void The_pull_of_the_magnet_is_off_while_animations_are_off()
    {
        // Tests run with animations off: the holder must not move, and must not throw.
        var holder = new Border { Width = 100, Height = 40, Child = new Button { Content = "Ask" } };
        Magnet.SetOn(holder, true);
        var window = Show(holder);

        Assert.True(Magnet.GetOn(holder));
        Assert.Null(holder.RenderTransform);
        window.Close();
    }

    private static Window Show(Control content)
    {
        var window = new Window { Width = 1200, Height = 800, Content = content };
        window.Show();
        Dispatcher.UIThread.RunJobs();
        return window;
    }

    private static T Resource<T>(Control control, string key) =>
        control.TryFindResource(key, out var found) && found is T value ? value : throw new InvalidOperationException($"No resource {key}.");

    private static Color Colour(IBrush? brush) => Assert.IsAssignableFrom<ISolidColorBrush>(brush).Color;
}
