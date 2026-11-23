using System.Collections.ObjectModel;
using System.Globalization;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.Tasks;
using TradingAgent.Core.Tasks;
using TradingAgent.Data.Tasks;

namespace TradingAgent.App.ViewModels;

/// <summary>Lets one page ask the shell to show another.</summary>
internal sealed class AppNavigator
{
    /// <summary>Raised with the id of the session the chat screen should show.</summary>
    public event Action<string>? ChatRequested;

    public void OpenChat(string sessionId) => ChatRequested?.Invoke(sessionId);
}

/// <summary>Times as the pages show them.</summary>
internal static class Display
{
    public static string Time(long? unixMs) =>
        unixMs is { } value
            ? DateTimeOffset.FromUnixTimeMilliseconds(value).ToLocalTime().ToString("yyyy-MM-dd HH:mm", CultureInfo.CurrentCulture)
            : "never";
}

/// <summary>One scheduled task in the list.</summary>
internal sealed class TaskItemViewModel(AgentTask source, bool running)
{
    public AgentTask Source { get; } = source;

    public string Name => Source.Name;

    public string Line =>
        running ? "running now"
        : Source.Status != AgentTask.Active ? Source.Status
        : $"next {Display.Time(Source.NextRunAt)}";
}

/// <summary>The Tasks page: the work the agent does on a schedule, and a form to make and change it.</summary>
internal sealed partial class TasksViewModel : PageViewModel, IDisposable
{
    private readonly AgentTaskRepository _tasks;
    private readonly AgentTaskScheduler _scheduler;
    private readonly AppNavigator _navigator;
    private readonly Action<Action> _post;
    private string? _editingId;

    public TasksViewModel(AgentTaskRepository tasks, AgentTaskScheduler scheduler, AppNavigator navigator, Action<Action>? post = null)
    {
        _tasks = tasks;
        _scheduler = scheduler;
        _navigator = navigator;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        _scheduler.TasksChanged += OnTasksChanged;
        Reload();
    }

    public override string Title => "Tasks";

    public ObservableCollection<TaskItemViewModel> Tasks { get; } = [];

    public IReadOnlyList<string> ScheduleKinds { get; } = [TaskSchedule.Interval, TaskSchedule.Daily, TaskSchedule.Weekly];

    [ObservableProperty]
    public partial TaskItemViewModel? Selected { get; set; }

    [ObservableProperty]
    public partial string Name { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Instructions { get; set; } = string.Empty;

    /// <summary>Instruments, separated by commas.</summary>
    [ObservableProperty]
    public partial string Symbols { get; set; } = string.Empty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsInterval), nameof(IsTimed), nameof(IsWeekly))]
    public partial string ScheduleKind { get; set; } = TaskSchedule.Daily;

    [ObservableProperty]
    public partial decimal? Minutes { get; set; } = 60;

    /// <summary>Time of day, 24-hour, in this computer's time zone.</summary>
    [ObservableProperty]
    public partial string Time { get; set; } = "09:00";

    /// <summary>Weekdays, separated by commas: mon, tue, wed, thu, fri, sat, sun.</summary>
    [ObservableProperty]
    public partial string Days { get; set; } = "mon, tue, wed, thu, fri";

    [ObservableProperty]
    public partial bool TradingEnabled { get; set; }

    [ObservableProperty]
    public partial bool AskFirst { get; set; } = true;

    /// <summary>How the chosen task has done so far.</summary>
    [ObservableProperty]
    public partial string Info { get; set; } = string.Empty;

    /// <summary>What is wrong with the form, or what was just done.</summary>
    [ObservableProperty]
    public partial string Message { get; set; } = string.Empty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(PauseLabel))]
    public partial bool IsPaused { get; set; }

    [ObservableProperty]
    public partial bool HasSelection { get; set; }

    public bool IsInterval => ScheduleKind == TaskSchedule.Interval;

    public bool IsTimed => ScheduleKind != TaskSchedule.Interval;

    public bool IsWeekly => ScheduleKind == TaskSchedule.Weekly;

    public string PauseLabel => IsPaused ? "Resume" : "Pause";

    public override void Activate() => Reload();

    public void Dispose() => _scheduler.TasksChanged -= OnTasksChanged;

    /// <summary>Clears the form for a new task.</summary>
    [RelayCommand]
    public void New()
    {
        Selected = null;
        _editingId = null;
        Name = string.Empty;
        Instructions = string.Empty;
        Symbols = string.Empty;
        ScheduleKind = TaskSchedule.Daily;
        Minutes = 60;
        Time = "09:00";
        Days = "mon, tue, wed, thu, fri";
        TradingEnabled = false;
        AskFirst = true;
        Info = string.Empty;
        Message = string.Empty;
        HasSelection = false;
    }

    [RelayCommand]
    public void Save()
    {
        if (string.IsNullOrWhiteSpace(Name))
        {
            Message = "Give the task a name.";
            return;
        }

        if (ReadSchedule() is not { } schedule)
        {
            return;
        }

        var draft = new TaskDraft(
            Name,
            Instructions,
            [schedule],
            Symbols.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            TradingEnabled,
            AskFirst);
        if (_editingId is { } id)
        {
            _tasks.Update(id, draft);
        }
        else
        {
            _editingId = _tasks.Create(draft).Id;
        }

        Message = "Saved.";
        Reload();
    }

    [RelayCommand]
    public void Delete()
    {
        if (_editingId is { } id)
        {
            _tasks.Delete(id);
            New();
            Reload();
        }
    }

    [RelayCommand]
    public void TogglePause()
    {
        if (_editingId is { } id)
        {
            _tasks.SetPaused(id, !IsPaused);
            Reload();
        }
    }

    /// <summary>Starts a run of the chosen task now, whatever its schedule says.</summary>
    [RelayCommand]
    public void RunNow()
    {
        if (_editingId is { } id)
        {
            Message = "Started. The run appears in Chat.";
            _ = Task.Run(() => _scheduler.RunNowAsync(id, CancellationToken.None));
        }
    }

    /// <summary>Shows the conversation of the latest run.</summary>
    [RelayCommand]
    public void OpenLastRun()
    {
        if (_editingId is { } id && _tasks.Get(id)?.LastSessionId is { } session)
        {
            _navigator.OpenChat(session);
        }
        else
        {
            Message = "This task has not run yet.";
        }
    }

    private TaskSchedule? ReadSchedule()
    {
        if (ScheduleKind == TaskSchedule.Interval)
        {
            if (Minutes is >= 5 and <= 100_000)
            {
                return TaskSchedule.Every((int)Minutes.Value);
            }

            Message = "A task can run every 5 minutes at most.";
            return null;
        }

        if (!TaskSchedule.TryParseTime(Time, out var time))
        {
            Message = "Give the time as hours and minutes, for example 09:00.";
            return null;
        }

        if (ScheduleKind == TaskSchedule.Daily)
        {
            return TaskSchedule.DailyAt(time);
        }

        var days = new List<DayOfWeek>();
        foreach (var word in Days.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!TaskSchedule.TryParseDay(word, out var day))
            {
                Message = $"'{word}' is not a weekday. Use mon, tue, wed, thu, fri, sat, sun.";
                return null;
            }

            if (!days.Contains(day))
            {
                days.Add(day);
            }
        }

        if (days.Count == 0)
        {
            Message = "Give at least one weekday.";
            return null;
        }

        return TaskSchedule.WeeklyAt(time, days);
    }

    partial void OnSelectedChanged(TaskItemViewModel? value)
    {
        if (value is null)
        {
            return;
        }

        var task = value.Source;
        _editingId = task.Id;
        Name = task.Name;
        Instructions = task.Instructions;
        Symbols = string.Join(", ", task.Symbols);
        TradingEnabled = task.TradingEnabled;
        AskFirst = task.AskFirst;
        IsPaused = task.Status == AgentTask.Paused;
        HasSelection = true;
        if (task.Schedules.Count > 0)
        {
            var schedule = task.Schedules[0];
            ScheduleKind = schedule.Kind;
            Minutes = schedule.Kind == TaskSchedule.Interval ? schedule.Minutes : Minutes;
            Time = schedule.Kind == TaskSchedule.Interval ? Time : schedule.Time.ToString("HH:mm", CultureInfo.InvariantCulture);
            Days = schedule.Kind == TaskSchedule.Weekly
                ? string.Join(", ", schedule.Days.Select(day => day.ToString()[..3].ToLowerInvariant()))
                : Days;
        }

        Info = string.Create(
            CultureInfo.CurrentCulture,
            $"{task.Status}. {task.RunCount} runs, {task.SuccessCount} finished, {task.FailureCount} failed. Last run {Display.Time(task.LastRunAt)}; next {Display.Time(task.NextRunAt)}.")
            + (task.LastError is { } error ? $" Last error: {error}" : string.Empty);
    }

    private void OnTasksChanged(object? sender, EventArgs e) => _post(Reload);

    private void Reload()
    {
        var keep = _editingId;
        Tasks.Clear();
        foreach (var task in _tasks.List())
        {
            Tasks.Add(new TaskItemViewModel(task, _scheduler.IsRunning(task.Id)));
        }

        if (keep is not null && Tasks.FirstOrDefault(item => item.Source.Id == keep) is { } same)
        {
            Selected = same;
            // Selecting the same task again does not raise a change; the figures are read anew here.
            OnSelectedChanged(same);
        }
    }
}
