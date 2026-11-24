using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;
using Avalonia.VisualTree;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using TradingAgent.App.Controls;
using TradingAgent.App.Effects;
using TradingAgent.App.Theme;
using TradingAgent.App.ViewModels;
using TradingAgent.App.Views;
using TradingAgent.Core;
using TradingAgent.Core.Settings;
using Xunit;

namespace TradingAgent.App.Tests;

public sealed class ShellLookTests : IDisposable
{
    private static readonly AppInfo _info = new("9.8.7", IsDevelopmentBuild: false);

    private readonly string _root = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));
    private readonly AppPaths _paths;

    public ShellLookTests()
    {
        _paths = new AppPaths(_root, isDevelopmentBuild: true);
        _paths.EnsureCreated();
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
            // A leftover temp folder is harmless.
        }
    }

    [Fact]
    public void The_sidebar_shows_every_page_once_in_the_groups_of_the_previous_ui()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var main = services.GetRequiredService<MainViewModel>();

        var rows = main.NavItems;

        Assert.Equal(main.Pages.Count, rows.Count);
        Assert.Equal(main.Pages.Count, rows.Select(row => row.Page).Distinct().Count());
        Assert.Equal(
            ["Chat", "Dashboard", "Trading", "Orders", "Trades", "Strategies", "Knowledge", "Memory", "News", "Tasks", "Diagnostics", "Admin", "Settings"],
            rows.Select(row => row.Title));
        Assert.Equal(["CORE", "MONITOR", "INTELLIGENCE", "SYSTEM", "ADMIN"], rows.Where(row => row.HasGroup).Select(row => row.Group));
        // Admin and Settings stand at the foot, each under a line.
        Assert.Equal(["Admin", "Settings"], rows.Where(row => row.AtBottom).Select(row => row.Title));
        Assert.All(rows.Where(row => row.AtBottom), row => Assert.True(row.LineAlways));
        Assert.False(rows[0].LineWhenFolded);
    }

    [Fact]
    public void Choosing_a_row_opens_its_page_and_a_cleared_choice_keeps_the_page()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var main = services.GetRequiredService<MainViewModel>();
        var orders = main.NavItems.Single(row => row.Title == "Orders");

        main.SelectedNavItem = orders;
        main.SelectedNavItem = null;

        Assert.Same(orders.Page, main.SelectedPage);
        Assert.Same(orders, main.SelectedNavItem);
    }

    [Fact]
    public void The_emergency_button_only_asks_and_the_answer_sets_the_latch()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var settings = services.GetRequiredService<ISettingsStore>();
        var header = new HeaderViewModel(services.GetRequiredService<AppearanceState>(), settings, post: action => action());

        header.AskEmergencyCommand.Execute(null);
        var askedToStop = header.ConfirmingStop;
        var latchAfterAsking = settings.GetValue(SettingKeys.EmergencyStopActive);
        header.CancelEmergencyCommand.Execute(null);
        var latchAfterCancel = settings.GetValue(SettingKeys.EmergencyStopActive);
        header.AskEmergencyCommand.Execute(null);
        header.ConfirmStopCommand.Execute(null);

        Assert.True(askedToStop);
        Assert.False(latchAfterAsking);
        Assert.False(latchAfterCancel);
        Assert.True(settings.GetValue(SettingKeys.EmergencyStopActive));
        Assert.True(header.IsEmergencyStopped);
        Assert.False(header.ConfirmingStop);

        // Resuming asks too.
        header.AskEmergencyCommand.Execute(null);
        Assert.True(header.ConfirmingResume);
        Assert.True(settings.GetValue(SettingKeys.EmergencyStopActive));
        header.ConfirmResumeCommand.Execute(null);
        Assert.False(settings.GetValue(SettingKeys.EmergencyStopActive));
        Assert.False(header.IsEmergencyStopped);
    }

    [Fact]
    public void The_header_follows_an_emergency_stop_set_on_the_settings_page()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var settings = services.GetRequiredService<ISettingsStore>();
        var header = new HeaderViewModel(services.GetRequiredService<AppearanceState>(), settings, post: action => action());

        settings.SetValue(SettingKeys.EmergencyStopActive, true);

        Assert.True(header.IsEmergencyStopped);
        Assert.False(header.IsRunning);
    }

    [Fact]
    public void A_chosen_theme_is_saved_and_an_unknown_saved_theme_means_solar()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var settings = services.GetRequiredService<ISettingsStore>();
        var appearance = services.GetRequiredService<AppearanceState>();
        var header = new HeaderViewModel(appearance, settings, post: action => action());
        var changes = 0;
        appearance.Changed += (_, _) => changes++;

        header.ChooseThemeCommand.Execute(header.Themes.Single(theme => theme.Label == "Jade"));

        Assert.Equal("jade", settings.GetValue(SettingKeys.UiTheme));
        Assert.Same(ThemePreset.Jade, appearance.Preset);
        Assert.Equal(1, changes);
        Assert.Equal(["Jade"], header.Themes.Where(theme => theme.IsActive).Select(theme => theme.Label));

        settings.SetValue(SettingKeys.UiTheme, "a theme of a later version");
        Assert.Same(ThemePreset.Solar, appearance.Preset);
    }

    [Fact]
    public void The_moving_background_needs_effects_on_and_motion_not_reduced()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var main = services.GetRequiredService<MainViewModel>();
        var settings = services.GetRequiredService<ISettingsStore>();

        Assert.True(main.ShowEffects);
        main.ReducedMotion = true;
        Assert.False(main.ShowEffects);
        Assert.True(settings.GetValue(SettingKeys.UiReducedMotion));
        main.ReducedMotion = false;
        main.EffectsEnabled = false;
        Assert.False(main.ShowEffects);
        Assert.False(settings.GetValue(SettingKeys.UiEffectsEnabled));
    }

    [AvaloniaFact]
    public void Every_row_of_the_sidebar_has_a_name_also_when_it_is_folded_to_icons()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var main = services.GetRequiredService<MainViewModel>();
        var window = new MainWindow { DataContext = main };
        window.Show();
        Dispatcher.UIThread.RunJobs();

        main.IsSidebarPinned = false;
        Dispatcher.UIThread.RunJobs();

        var navigation = window.GetVisualDescendants().OfType<ListBox>().Single(list => list.Name == "Navigation");
        var names = navigation.GetVisualDescendants().OfType<ListBoxItem>().Select(AutomationProperties.GetName).ToList();
        Assert.Equal(main.NavItems.Select(row => row.Title), names);
        Assert.Contains("folded", navigation.Classes);
        Assert.False(main.IsSidebarExpanded);
        // The names of the rows are still in the tree for a tooltip, but not shown.
        Assert.All(
            navigation.GetVisualDescendants().OfType<TextBlock>().Where(text => text.Classes.Contains("navText")),
            text => Assert.False(text.IsEffectivelyVisible));
        window.Close();
    }

    [AvaloniaFact]
    public void The_question_of_the_emergency_stop_shows_over_the_window_only_while_it_is_asked()
    {
        using var services = ShellApp.BuildServices(_info, _paths);
        var main = services.GetRequiredService<MainViewModel>();
        var window = new MainWindow { DataContext = main };
        window.Show();
        Dispatcher.UIThread.RunJobs();
        var dialogs = window.GetVisualDescendants().OfType<Dialog>().ToList();

        Assert.Equal(2, dialogs.Count);
        Assert.All(dialogs, dialog => Assert.False(dialog.IsVisible));
        main.Header.AskEmergencyCommand.Execute(null);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["Emergency Stop"], dialogs.Where(dialog => dialog.IsVisible).Select(dialog => dialog.Title));
        main.Header.CancelEmergencyCommand.Execute(null);
        Dispatcher.UIThread.RunJobs();
        Assert.All(dialogs, dialog => Assert.False(dialog.IsVisible));
        window.Close();
    }

    [Fact]
    public void The_particles_drift_wrap_at_the_edges_and_come_to_rest()
    {
        var field = new ParticleField(400, 300, new Random(1));
        var startX = field.X.ToArray();

        field.Step(16);
        var moved = field.X.ToArray().Zip(startX).Any(pair => pair.First != pair.Second);
        // A frame after a pause is left out.
        var beforePause = field.X.ToArray();
        field.Step(500);
        var afterPause = field.X.ToArray();
        for (var frame = 0; frame < 2000 && !field.IsStill; frame++)
        {
            field.Step(16);
        }

        Assert.True(moved);
        Assert.Equal(beforePause, afterPause);
        Assert.True(field.IsStill);
        Assert.All(field.X.ToArray(), x => Assert.InRange(x, 0, 400));
        Assert.All(field.Y.ToArray(), y => Assert.InRange(y, 0, 300));
        Assert.All(field.Opacity.ToArray(), opacity => Assert.InRange(opacity, 0.4, 0.9));
    }

    [Fact]
    public void A_blob_is_placed_by_its_corner_and_returns_to_its_first_place()
    {
        var blobs = BlobField.For(ThemePreset.Solar);
        var window = new Size(1000, 800);

        Assert.Equal(4, blobs.Count);
        Assert.Equal([18d, 18 + (7d / 3), 18 + (14d / 3), 25d], blobs.Select(blob => blob.Seconds), (expected, actual) => Math.Abs(expected - actual) < 1e-9);
        var first = blobs[0];
        var (start, startScale) = BlobField.At(first, 0, window);
        var (third, thirdScale) = BlobField.At(first, first.Seconds / 3, window);
        var (again, _) = BlobField.At(first, first.Seconds, window);

        // 10 % and 8 % of the window, plus half of the 700 px blob.
        Assert.Equal(new Point(450, 414), start);
        Assert.Equal(1, startScale, 6);
        Assert.Equal(new Point(750, 630), third);
        Assert.Equal(1.2, thirdScale, 6);
        Assert.Equal(start.X, again.X, 6);
    }

    [Fact]
    public void An_endless_motion_goes_through_its_keys_at_even_steps_and_starts_again()
    {
        var round = TimeSpan.FromSeconds(6);
        double[] keys = [0, -100, 0];

        Assert.Equal(0, Motion.Endless.Along(keys, 0, round, null), 6);
        Assert.Equal(-50, Motion.Endless.Along(keys, 1.5, round, null), 6);
        Assert.Equal(-100, Motion.Endless.Along(keys, 3, round, null), 6);
        Assert.Equal(-50, Motion.Endless.Along(keys, 4.5, round, null), 6);
        Assert.Equal(-50, Motion.Endless.Along(keys, 7.5, round, null), 6);
        Assert.Equal(7, Motion.Endless.Along([7], 2, round, null));
    }

    [AvaloniaFact]
    public void With_animations_off_no_endless_motion_starts()
    {
        Assert.True(Motion.FrameDriver.IsInstant);
        var steps = 0;

        using var handle = Motion.Endless.Every(_ => steps++);

        Assert.Equal(0, steps);
    }

    [Fact]
    public void A_blurred_disc_is_solid_in_the_middle_half_there_at_its_edge_and_gone_far_outside()
    {
        Assert.InRange(BlobField.Coverage(0, 350, 100), 0.99, 1);
        Assert.InRange(BlobField.Coverage(350, 350, 100), 0.4, 0.5);
        Assert.InRange(BlobField.Coverage(650, 350, 100), 0, 0.01);
        Assert.True(BlobField.Coverage(300, 350, 100) > BlobField.Coverage(400, 350, 100));
    }
}
