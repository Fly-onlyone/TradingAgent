using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.App.ViewModels;
using TradingAgent.Core;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Data;
using Xunit;

namespace TradingAgent.App.Tests;

public sealed class DiagnosticsViewModelTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));
    private readonly AppPaths _paths;
    private readonly Database _database;
    private readonly SqliteSettingsStore _settings;
    private readonly FakeAutostart _autostart = new();
    private readonly FakeToasts _toasts = new();

    public DiagnosticsViewModelTests()
    {
        _paths = new AppPaths(_root, isDevelopmentBuild: true);
        _paths.EnsureCreated();
        _database = new Database(_paths.DatabaseFile);
        _database.Initialize();
        _settings = new SqliteSettingsStore(_database, TimeProvider.System, NullLogger<SqliteSettingsStore>.Instance);
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
    public void Switches_start_from_the_real_state_without_changing_anything()
    {
        _autostart.IsEnabled = true;
        _settings.SetValue(SettingKeys.WindowStartOpen, false);

        var viewModel = NewViewModel();

        Assert.True(viewModel.StartWithWindows);
        Assert.False(viewModel.OpenWindowAtStart);
        Assert.Equal(0, _autostart.Calls);
        Assert.False(_settings.GetValue(SettingKeys.AutostartEnabled));
    }

    [Fact]
    public void Turning_start_with_windows_on_and_off_creates_and_removes_the_shortcut_and_saves_the_choice()
    {
        var viewModel = NewViewModel();

        viewModel.StartWithWindows = true;

        Assert.True(_autostart.IsEnabled);
        Assert.True(_settings.GetValue(SettingKeys.AutostartEnabled));

        viewModel.StartWithWindows = false;

        Assert.False(_autostart.IsEnabled);
        Assert.False(_settings.GetValue(SettingKeys.AutostartEnabled));
    }

    [Fact]
    public void A_failed_shortcut_change_reverts_the_switch_and_explains_why()
    {
        _autostart.FailWith = "The start-up shortcut could not be created.";
        var viewModel = NewViewModel();

        viewModel.StartWithWindows = true;

        Assert.False(viewModel.StartWithWindows);
        Assert.False(_settings.GetValue(SettingKeys.AutostartEnabled));
        Assert.Equal("The start-up shortcut could not be created.", viewModel.ShellStatus);
    }

    [Fact]
    public void Open_window_at_start_is_saved()
    {
        var viewModel = NewViewModel();

        viewModel.OpenWindowAtStart = false;

        Assert.False(_settings.GetValue(SettingKeys.WindowStartOpen));
    }

    [Fact]
    public void Test_notification_goes_out_under_the_product_name()
    {
        var viewModel = NewViewModel();

        viewModel.SendTestNotificationCommand.Execute(null);

        var (title, body) = Assert.Single(_toasts.Shown);
        Assert.Equal("Trading agent", title);
        Assert.NotEmpty(body);
    }

    private DiagnosticsViewModel NewViewModel() =>
        new(new AppInfo("1.0.0", IsDevelopmentBuild: true), _paths, _database, _settings, _autostart, _toasts);

    private sealed class FakeAutostart : IAutostart
    {
        public bool IsEnabled { get; set; }

        public int Calls { get; private set; }

        public string? FailWith { get; set; }

        public void Enable() => Change(true);

        public void Disable() => Change(false);

        private void Change(bool enabled)
        {
            Calls++;
            if (FailWith is not null)
            {
                throw new InvalidOperationException(FailWith);
            }

            IsEnabled = enabled;
        }
    }

    private sealed class FakeToasts : IToastNotifier
    {
        public event EventHandler? Activated
        {
            add { }
            remove { }
        }

        public List<(string Title, string Body)> Shown { get; } = [];

        public void Show(string title, string body) => Shown.Add((title, body));
    }
}
