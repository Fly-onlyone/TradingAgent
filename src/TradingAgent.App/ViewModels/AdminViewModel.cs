using System.Collections.ObjectModel;
using System.Globalization;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Data;
using TradingAgent.Data.Admin;

namespace TradingAgent.App.ViewModels;

/// <summary>One log entry in the list.</summary>
internal sealed class LogItemViewModel(LogRow row)
{
    public LogRow Source { get; } = row;

    public string When => Display.Time(Source.Timestamp);

    public string Level => Source.Level;

    public string Message => Source.Message;

    public bool IsError => Source.Level is "error" or "critical";

    /// <summary>The last part of the logger's name: the class that wrote the entry.</summary>
    public string Logger => Source.Logger[(Source.Logger.LastIndexOf('.') + 1)..];
}

/// <summary>One backup in the list.</summary>
internal sealed class BackupItemViewModel(BackupFile file)
{
    public BackupFile Source { get; } = file;

    public string Name => Source.Name;

    public string Line => string.Create(
        CultureInfo.CurrentCulture,
        $"{Source.CreatedUtc.ToLocalTime():yyyy-MM-dd HH:mm} · {Source.Size / 1024.0 / 1024.0:0.0} MB");
}

/// <summary>
/// The Admin page: the log of warnings and errors, the state of the database, backups, and deleting
/// whole kinds of data.
/// </summary>
/// <remarks>
/// The two things here that cannot be taken back, a restore and a delete, take two steps: the first
/// press asks, the second does.
/// </remarks>
internal sealed partial class AdminViewModel : PageViewModel
{
    public const string AllLevels = "all";

    private readonly AdminStore _admin;
    private readonly Database _database;
    private readonly Action<Action> _post;

    public AdminViewModel(AdminStore admin, Database database, Action<Action>? post = null)
    {
        _admin = admin;
        _database = database;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        Reload();
    }

    public override string Title => "Admin";

    public IReadOnlyList<string> LogLevels { get; } = [AllLevels, "warning", "error", "critical"];

    public ObservableCollection<LogItemViewModel> Logs { get; } = [];

    public ObservableCollection<TableInfo> Tables { get; } = [];

    public ObservableCollection<BackupItemViewModel> Backups { get; } = [];

    public ObservableCollection<DataCategory> Categories { get; } = [];

    [ObservableProperty]
    public partial string LogLevel { get; set; } = AllLevels;

    [ObservableProperty]
    public partial string LogQuery { get; set; } = string.Empty;

    [ObservableProperty]
    public partial LogItemViewModel? SelectedLog { get; set; }

    /// <summary>The chosen log entry in full, with the error's trace when there is one.</summary>
    [ObservableProperty]
    public partial string LogDetail { get; set; } = string.Empty;

    /// <summary>Where the database is, how large, and at which version.</summary>
    [ObservableProperty]
    public partial string DatabaseInfo { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string DatabaseStatus { get; set; } = string.Empty;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(AskRestoreCommand), nameof(DeleteBackupCommand))]
    public partial BackupItemViewModel? SelectedBackup { get; set; }

    /// <summary>True while the page asks "really restore?" and nothing has changed yet.</summary>
    [ObservableProperty]
    public partial bool ConfirmingRestore { get; set; }

    [ObservableProperty]
    public partial string BackupStatus { get; set; } = string.Empty;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(AskDeleteCommand))]
    public partial DataCategory? SelectedCategory { get; set; }

    /// <summary>True while the page asks "really delete?" and nothing has changed yet.</summary>
    [ObservableProperty]
    public partial bool ConfirmingDelete { get; set; }

    [ObservableProperty]
    public partial string DataStatus { get; set; } = string.Empty;

    public override void Activate() => Reload();

    [RelayCommand]
    public void RefreshLogs() => LoadLogs();

    /// <summary>Asks SQLite whether the database file is sound.</summary>
    [RelayCommand]
    public async Task CheckIntegrityAsync()
    {
        DatabaseStatus = "Checking…";
        var result = await Task.Run(_admin.CheckIntegrity).ConfigureAwait(false);
        _post(() => DatabaseStatus = result == "ok" ? "The database is sound." : $"SQLite reports: {result}");
    }

    /// <summary>Gives back the space deleted rows left in the file.</summary>
    [RelayCommand]
    public async Task CompactAsync()
    {
        DatabaseStatus = "Compacting…";
        await Task.Run(_admin.Compact).ConfigureAwait(false);
        _post(() =>
        {
            LoadDatabase();
            DatabaseStatus = "Compacted.";
        });
    }

    [RelayCommand]
    public async Task BackUpAsync()
    {
        BackupStatus = "Writing the backup…";
        var backup = await Task.Run(_admin.BackUp).ConfigureAwait(false);
        _post(() =>
        {
            LoadBackups();
            BackupStatus = $"Written: {backup.Name}";
        });
    }

    /// <summary>First step of a restore: shows what it means and changes nothing.</summary>
    [RelayCommand(CanExecute = nameof(HasBackup))]
    public void AskRestore() => ConfirmingRestore = true;

    /// <summary>Second step: the chosen backup replaces the database when the app next starts.</summary>
    [RelayCommand]
    public void ConfirmRestore()
    {
        ConfirmingRestore = false;
        if (SelectedBackup is { } backup)
        {
            BackupStatus = _admin.RequestRestore(backup.Source.Path)
                ? $"{backup.Name} replaces the database when the app next starts. Exit the app from the tray icon and start it again."
                : "That file is not a backup of this app.";
        }
    }

    /// <summary>Takes back a restore that was asked for and has not happened yet.</summary>
    [RelayCommand]
    public void CancelRestore()
    {
        ConfirmingRestore = false;
        if (_admin.PendingRestore is not null)
        {
            _admin.CancelRestore();
            BackupStatus = "The restore was called off.";
        }
    }

    [RelayCommand(CanExecute = nameof(HasBackup))]
    public void DeleteBackup()
    {
        if (SelectedBackup is { } backup)
        {
            _admin.DeleteBackup(backup.Source.Path);
            SelectedBackup = null;
            LoadBackups();
            BackupStatus = "Backup deleted.";
        }
    }

    /// <summary>First step of a delete: shows what it means and changes nothing.</summary>
    [RelayCommand(CanExecute = nameof(HasCategory))]
    public void AskDelete() => ConfirmingDelete = true;

    /// <summary>Second step: everything of the chosen kind is deleted.</summary>
    [RelayCommand]
    public void ConfirmDelete()
    {
        ConfirmingDelete = false;
        if (SelectedCategory is { } category)
        {
            var removed = _admin.Delete(category.Key);
            DataStatus = $"Deleted {removed} rows of: {category.Label}.";
            LoadData();
            LoadDatabase();
        }
    }

    [RelayCommand]
    public void CancelDelete() => ConfirmingDelete = false;

    private bool HasBackup() => SelectedBackup is not null;

    private bool HasCategory() => SelectedCategory is not null;

    partial void OnLogLevelChanged(string value) => LoadLogs();

    partial void OnLogQueryChanged(string value) => LoadLogs();

    partial void OnSelectedLogChanged(LogItemViewModel? value) =>
        LogDetail = value is null
            ? string.Empty
            : $"{value.When}  {value.Source.Level}  {value.Source.Logger}\n\n{value.Source.Message}"
              + (value.Source.Exception is { } exception ? $"\n\n{exception}" : string.Empty);

    partial void OnSelectedCategoryChanged(DataCategory? value) => ConfirmingDelete = false;

    partial void OnSelectedBackupChanged(BackupItemViewModel? value) => ConfirmingRestore = false;

    private void Reload()
    {
        LoadLogs();
        LoadDatabase();
        LoadBackups();
        LoadData();
    }

    private void LoadLogs()
    {
        Logs.Clear();
        foreach (var row in _admin.Logs(LogLevel == AllLevels ? null : LogLevel, LogQuery, 500))
        {
            Logs.Add(new LogItemViewModel(row));
        }
    }

    private void LoadDatabase()
    {
        DatabaseInfo = string.Create(
            CultureInfo.CurrentCulture,
            $"{_database.DatabaseFile}\n{_admin.FileSize() / 1024.0 / 1024.0:0.0} MB · schema version {_database.SchemaVersion} · SQLite {_database.SqliteVersion}");
        Tables.Clear();
        foreach (var table in _admin.Tables())
        {
            Tables.Add(table);
        }
    }

    private void LoadBackups()
    {
        Backups.Clear();
        foreach (var backup in _admin.Backups())
        {
            Backups.Add(new BackupItemViewModel(backup));
        }

        if (_admin.PendingRestore is { } pending)
        {
            BackupStatus = $"{Path.GetFileName(pending)} replaces the database when the app next starts.";
        }
    }

    private void LoadData()
    {
        var keep = SelectedCategory?.Key;
        Categories.Clear();
        foreach (var category in _admin.Categories())
        {
            Categories.Add(category);
        }

        SelectedCategory = Categories.FirstOrDefault(category => category.Key == keep);
    }
}
