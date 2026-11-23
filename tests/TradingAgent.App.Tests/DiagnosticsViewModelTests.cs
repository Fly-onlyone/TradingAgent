using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.App.Shell;
using TradingAgent.App.Telemetry;
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
    private readonly FakeUpdates _updates = new();
    private readonly ShellRequests _shell = new();
    private readonly TelemetryGate _gate = new();

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
    public void Reporting_switch_saves_the_choice_and_a_build_without_an_address_says_so()
    {
        var viewModel = NewViewModel();

        Assert.True(viewModel.ReportingEnabled);
        Assert.Equal("This build has no reporting address. Nothing is sent.", viewModel.ReportingStatus);

        viewModel.ReportingEnabled = false;

        Assert.False(_settings.GetValue(SettingKeys.TelemetryEnabled));

        viewModel.SendTestErrorCommand.Execute(null);

        Assert.Equal("Nothing was sent: reporting is not active.", viewModel.ReportingStatus);
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

    [Fact]
    public async Task Check_for_updates_asks_the_updater_and_shows_what_it_reports()
    {
        var viewModel = NewViewModel();

        Assert.Equal("Not checked yet.", viewModel.UpdateStatus);

        await viewModel.CheckForUpdatesCommand.ExecuteAsync(null);

        Assert.Equal(1, _updates.Checks);
        Assert.False(viewModel.IsUpdateReady);
    }

    [Fact]
    public void A_downloaded_update_offers_a_restart_and_asks_the_shell_for_it()
    {
        _updates.Status = new UpdateStatus(UpdateState.ReadyToInstall, "2.0.0", "Version 2.0.0 is ready.");
        var requested = 0;
        _shell.RestartToUpdateRequested += (_, _) => requested++;
        var viewModel = NewViewModel();

        Assert.True(viewModel.IsUpdateReady);
        Assert.Equal("Version 2.0.0 is ready.", viewModel.UpdateStatus);

        viewModel.RestartToUpdateCommand.Execute(null);

        Assert.Equal(1, requested);
    }

    private DiagnosticsViewModel NewViewModel() =>
        new(new AppInfo("1.0.0", IsDevelopmentBuild: true), _paths, _database, _settings, _autostart, _toasts, _updates, _shell, new TelemetryService(new AppInfo("1.0.0", IsDevelopmentBuild: true), _settings, _gate, NullLogger<TelemetryService>.Instance, dsn: null));

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

    private sealed class FakeUpdates : IUpdateService
    {
        public event EventHandler? StatusChanged
        {
            add { }
            remove { }
        }

        public int Checks { get; private set; }

        public UpdateStatus Status { get; set; } = new(UpdateState.Idle, null, "Not checked yet.");

        public Task CheckAsync(CancellationToken cancellationToken = default)
        {
            Checks++;
            return Task.CompletedTask;
        }

        public bool ApplyOnExit(bool restart) => false;
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
