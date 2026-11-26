using System.Text.RegularExpressions;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Avalonia.Threading;
using Avalonia.VisualTree;
using TradingAgent.App.Controls;
using TradingAgent.App.Motion;
using TradingAgent.App.Theme;
using TradingAgent.App.Views;
using Xunit;

namespace TradingAgent.App.Tests;

public sealed partial class ThemeTests
{
    [Fact]
    public void The_four_presets_are_those_of_the_previous_ui_and_an_unknown_id_means_solar()
    {
        Assert.Equal(["solar", "glacier", "jade", "eclipse"], ThemePreset.All.Select(preset => preset.Id));
        Assert.Same(ThemePreset.Eclipse, ThemePreset.ById("ECLIPSE"));
        Assert.Same(ThemePreset.Solar, ThemePreset.ById("a theme of a later version"));
        Assert.Same(ThemePreset.Solar, ThemePreset.ById(null));
    }

    [Fact]
    public void A_card_is_the_tint_laid_over_the_glass_colour()
    {
        var resources = ThemeBuilder.Build(ThemePreset.Solar);

        // rgba(62, 47, 26, 0.65) under rgba(249, 115, 22, 0.08), as one colour.
        var glass = Assert.IsType<Color>(resources["GlassCardColor"]);
        Assert.Equal(Color.FromArgb(166, 62, 47, 26), glass);
        var card = Assert.IsType<Color>(resources["CardColor"]);
        Assert.Equal(ThemeBuilder.Over(Color.FromArgb(20, 249, 115, 22), glass), card);
        Assert.True(card.A > glass.A);
        Assert.True(card.R > glass.R);
    }

    [Theory]
    [InlineData("solar", 8, 12, 6)]
    [InlineData("glacier", 6, 10, 4)]
    [InlineData("jade", 10, 14, 8)]
    [InlineData("eclipse", 14, 18, 12)]
    public void Corner_radii_follow_the_radius_of_the_preset(string id, double control, double card, double chip)
    {
        var resources = ThemeBuilder.Build(ThemePreset.ById(id));

        Assert.Equal(new CornerRadius(control), resources["RadiusBase"]);
        Assert.Equal(new CornerRadius(card), resources["RadiusCard"]);
        Assert.Equal(new CornerRadius(chip), resources["RadiusChip"]);
    }

    [Fact]
    public void Every_preset_gives_the_same_resources()
    {
        var expected = ThemeBuilder.Build(ThemePreset.Solar).Keys.Cast<string>().Order().ToList();

        Assert.All(ThemePreset.All, preset =>
            Assert.Equal(expected, ThemeBuilder.Build(preset).Keys.Cast<string>().Order().ToList()));
    }

    [Fact]
    public void Two_states_of_a_shadow_have_the_same_layers_so_a_transition_can_run_between_them()
    {
        var resources = ThemeBuilder.Build(ThemePreset.Jade);

        foreach (var (rest, moved) in (ReadOnlySpan<(string, string)>)[("CardShadow", "CardHoverShadow"), ("ButtonShadow", "ButtonHoverShadow"), ("ButtonShadow", "ButtonPressedShadow"), ("ButtonShadow", "ButtonNoShadow"), ("ChipShadow", "ChipHoverShadow")])
        {
            var from = Assert.IsType<BoxShadows>(resources[rest]);
            var to = Assert.IsType<BoxShadows>(resources[moved]);
            Assert.Equal(from.Count, to.Count);
            for (var layer = 0; layer < from.Count; layer++)
            {
                Assert.Equal(from[layer].IsInset, to[layer].IsInset);
            }
        }
    }

    [Fact]
    public void A_css_blur_is_converted_to_the_blur_that_looks_the_same_in_avalonia()
    {
        // A browser blurs with half the radius as standard deviation; Avalonia with 0.288675 x blur + 0.5.
        var blur = ThemeBuilder.CssBlur(20);

        Assert.Equal(10, (0.288675 * blur) + 0.5, 3);
        Assert.Equal(0, ThemeBuilder.CssBlur(0));
        Assert.True(ThemeBuilder.CssBlur(1) > 0);
    }

    [Fact]
    public void Every_theme_resource_a_view_or_a_control_theme_asks_for_exists()
    {
        // A missing DynamicResource is not an error anywhere: the control just has no colour.
        var known = ThemeBuilder.Build(ThemePreset.Solar).Keys.Cast<string>().ToHashSet(StringComparer.Ordinal);
        var source = Path.Combine(RepositoryRoot(), "src", "TradingAgent.App");
        var missing = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var file in Directory.EnumerateFiles(source, "*.axaml", SearchOption.AllDirectories))
        {
            if (file.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                || file.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            {
                continue;
            }

            foreach (Match match in DynamicResource().Matches(File.ReadAllText(file)))
            {
                var key = match.Groups[1].Value;
                // The one resource that is Fluent's: the menu of a text box.
                if (!known.Contains(key) && key != "DefaultTextBoxContextFlyout")
                {
                    missing.Add($"{key} ({Path.GetFileName(file)})");
                }
            }
        }

        Assert.Empty(missing);
    }

    [AvaloniaFact]
    public void Applying_a_preset_changes_what_a_window_already_shows()
    {
        var app = Assert.IsType<ShellApp>(Application.Current);
        var window = new GalleryWindow();
        window.Show();
        Dispatcher.UIThread.RunJobs();
        try
        {
            app.ApplyTheme(ThemePreset.Glacier);
            Dispatcher.UIThread.RunJobs();

            Assert.Equal(ThemePreset.Glacier.Background, Assert.IsAssignableFrom<ISolidColorBrush>(window.Background).Color);
            Assert.Same(ThemePreset.Glacier, app.Preset);
        }
        finally
        {
            app.ApplyTheme(ThemePreset.Solar);
            window.Close();
        }
    }

    [AvaloniaTheory]
    [InlineData("solar")]
    [InlineData("eclipse")]
    public void Every_control_of_the_kit_builds_its_template(string id)
    {
        var app = Assert.IsType<ShellApp>(Application.Current);
        app.ApplyTheme(ThemePreset.ById(id));
        var window = new GalleryWindow();
        try
        {
            window.Show();
            Dispatcher.UIThread.RunJobs();

            // The kit's themes are the ones in use, not Fluent's of the same controls.
            var button = window.GetVisualDescendants().OfType<Button>().First(candidate => candidate.Classes.Contains("contained"));
            Assert.Contains(button.GetVisualDescendants().OfType<Ripple>(), _ => true);
            Assert.Contains(window.GetVisualDescendants().OfType<TextBox>(), box => box.GetVisualDescendants().OfType<OutlineNotch>().Any());
            Assert.NotEmpty(window.GetVisualDescendants().OfType<Card>().First().GetVisualDescendants().OfType<GradientFlow>());
        }
        finally
        {
            window.Close();
            app.ApplyTheme(ThemePreset.Solar);
        }
    }

    [Fact]
    public void A_spring_leaves_from_its_start_overshoots_when_it_is_underdamped_and_comes_to_rest_at_its_target()
    {
        var spring = Spring.Bouncy;

        var (start, startSpeed) = spring.At(0, 0, 1);
        var peak = Enumerable.Range(1, 200).Max(step => spring.At(step * 0.005, 0, 1).Position);
        var (late, lateSpeed) = spring.At(3, 0, 1);

        Assert.Equal(0, start, 6);
        Assert.Equal(0, startSpeed, 6);
        Assert.True(peak > 1.02, $"Peak was {peak}.");
        Assert.True(Spring.IsAtRest(late, lateSpeed, 1, 1));
        Assert.Equal((1d, 0d), spring.At(double.PositiveInfinity, 0, 1));
    }

    [Theory]
    [InlineData(400, 30, 1)]
    [InlineData(100, 20, 1)]
    [InlineData(100, 40, 1)]
    public void A_spring_obeys_its_own_equation_of_motion(double stiffness, double damping, double mass)
    {
        // Under-damped, critically damped and over-damped: each branch of the closed form.
        var spring = new Spring(stiffness, damping, mass);
        const double Step = 1e-5;

        foreach (var time in (double[])[0.02, 0.1, 0.4])
        {
            var (position, velocity) = spring.At(time, 0, 1, 0.5);
            var acceleration = (spring.At(time + Step, 0, 1, 0.5).Velocity - spring.At(time - Step, 0, 1, 0.5).Velocity) / (2 * Step);
            var numericVelocity = (spring.At(time + Step, 0, 1, 0.5).Position - spring.At(time - Step, 0, 1, 0.5).Position) / (2 * Step);

            Assert.Equal(numericVelocity, velocity, 3);
            Assert.Equal(((-stiffness * (position - 1)) - (damping * velocity)) / mass, acceleration, 1);
        }
    }

    [Fact]
    public void Every_way_to_enter_ends_in_place()
    {
        Assert.All(Enum.GetValues<EnterKind>().Where(kind => kind != EnterKind.None), kind =>
        {
            var motion = EnterMotion.Of(kind);
            Assert.NotNull(motion);
            Assert.Equal((1d, true), motion.At(double.PositiveInfinity));
            Assert.False(motion.At(0).Done);
            Assert.True(motion.At(5).Done);
        });
        Assert.Null(EnterMotion.Of(EnterKind.None));
    }

    [AvaloniaFact]
    public void With_animations_off_an_entering_control_is_in_place_at_once()
    {
        Assert.True(FrameDriver.IsInstant);
        var panel = new StackPanel { Children = { new Border(), new Border() } };
        Enter.SetChildren(panel, EnterKind.Cascade);
        var window = new Window { Content = panel };

        window.Show();
        Dispatcher.UIThread.RunJobs();

        Assert.All(panel.Children, child =>
        {
            Assert.Equal(1, child.Opacity);
            Assert.Null(child.RenderTransform);
        });
        window.Close();
    }

    [Fact]
    public void The_grow_of_a_menu_takes_longer_for_a_taller_menu()
    {
        Assert.Equal(0, Grow.SecondsFor(0));
        Assert.True(Grow.SecondsFor(400) > Grow.SecondsFor(100));
        Assert.InRange(Grow.SecondsFor(200), 0.25, 0.3);
    }

    private static string RepositoryRoot()
    {
        var folder = new DirectoryInfo(AppContext.BaseDirectory);
        while (folder is not null && !File.Exists(Path.Combine(folder.FullName, "TradingAgent.slnx")))
        {
            folder = folder.Parent;
        }

        return folder?.FullName ?? throw new InvalidOperationException("The repository root was not found above the test folder.");
    }

    [GeneratedRegex(@"\{DynamicResource\s+(\w+)\}")]
    private static partial Regex DynamicResource();
}
