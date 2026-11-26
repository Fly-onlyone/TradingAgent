using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Agent;

namespace TradingAgent.App.ViewModels;

/// <summary>One chat in the list on the left.</summary>
internal sealed partial class SessionItemViewModel(string id) : ObservableObject
{
    public string Id { get; } = id;

    [ObservableProperty]
    public partial string Title { get; set; } = "New chat";

    /// <summary>True while a reply is being written in this chat.</summary>
    [ObservableProperty]
    public partial bool IsRunning { get; set; }

    /// <summary>"12 messages", under the title.</summary>
    [ObservableProperty]
    public partial string MessagesLabel { get; set; } = string.Empty;

    /// <summary>When the chat was last written in, in Unix milliseconds; decides its group.</summary>
    public long LastActiveAt { get; set; }

    /// <summary>
    /// The heading over this chat when it is the first of its group ("TODAY", "YESTERDAY", ...);
    /// null for the others.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasGroup))]
    public partial string? Group { get; set; }

    public bool HasGroup => Group is not null;
}

/// <summary>One tool the model called, as a line in its reply.</summary>
internal sealed partial class ToolCallItemViewModel(string toolUseId, string name, string arguments) : ObservableObject
{
    public string ToolUseId { get; } = toolUseId;

    public string Name { get; } = name;

    public string Arguments { get; } = arguments;

    /// <summary>The name as a person reads it: <c>get_ticker</c> becomes "Get ticker".</summary>
    public string Label { get; } = Humanize(name);

    /// <summary>The one argument that says what the call was about, shown beside the name.</summary>
    public string KeyArgument { get; } = FirstValue(arguments);

    /// <summary><c>running</c>, <c>succeeded</c>, <c>failed</c> or <c>denied</c>, and how long it took.</summary>
    [ObservableProperty]
    public partial string Status { get; set; } = "running";

    /// <summary>"120ms" once the call is over; empty before.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasDuration))]
    public partial string Duration { get; set; } = string.Empty;

    public bool HasDuration => Duration.Length > 0;

    [ObservableProperty]
    public partial bool IsSucceeded { get; set; }

    [ObservableProperty]
    public partial bool IsRunning { get; set; } = true;

    /// <summary>True shows the arguments and the result under the line.</summary>
    [ObservableProperty]
    public partial bool IsExpanded { get; set; }

    [RelayCommand]
    private void Toggle() => IsExpanded = !IsExpanded;

    private static string Humanize(string name)
    {
        var words = name.Replace('_', ' ').Replace('-', ' ').Trim();
        return words.Length == 0 ? name : char.ToUpperInvariant(words[0]) + words[1..];
    }

    /// <summary>The first plain value among the arguments; nothing when they are not a JSON object.</summary>
    private static string FirstValue(string arguments)
    {
        try
        {
            using var document = JsonDocument.Parse(arguments);
            if (document.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var property in document.RootElement.EnumerateObject())
                {
                    if (property.Value.ValueKind is JsonValueKind.String or JsonValueKind.Number)
                    {
                        var text = property.Value.ToString();
                        return text.Length <= 60 ? text : text[..60] + "…";
                    }
                }
            }
        }
        catch (JsonException)
        {
            // Shortened or not JSON at all: the line then shows the name alone.
        }

        return string.Empty;
    }

    /// <summary>A short account of the result when there is one: for an order, what became of it.</summary>
    [ObservableProperty]
    public partial string Summary { get; set; } = string.Empty;

    [ObservableProperty]
    public partial bool IsProblem { get; set; }
}

/// <summary>One message of the chat.</summary>
internal sealed partial class MessageItemViewModel(string id, bool isUser) : ObservableObject
{
    public string Id { get; } = id;

    public bool IsUser { get; } = isUser;

    public bool IsAssistant => !IsUser;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsWaiting))]
    [NotifyPropertyChangedFor(nameof(IsStreaming))]
    public partial string Content { get; set; } = string.Empty;

    /// <summary>"You", or "Agent" and the model that answered.</summary>
    [ObservableProperty]
    public partial string Author { get; set; } = isUser ? "You" : "Agent";

    /// <summary>When the message was written, as the time of day.</summary>
    [ObservableProperty]
    public partial string Time { get; set; } = string.Empty;

    /// <summary>The model's reasoning summary, shown folded.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasThinking))]
    public partial string Thinking { get; set; } = string.Empty;

    /// <summary>Why the reply failed or that it was stopped; empty otherwise.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNote))]
    public partial string Note { get; set; } = string.Empty;

    /// <summary>The model and the tokens of a finished reply.</summary>
    [ObservableProperty]
    public partial string Footer { get; set; } = string.Empty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsWaiting))]
    [NotifyPropertyChangedFor(nameof(IsStreaming))]
    public partial bool IsRunning { get; set; }

    public bool HasThinking => Thinking.Length > 0;

    public bool HasNote => Note.Length > 0;

    /// <summary>True while the reply has started and no text has come yet: the three dots show.</summary>
    public bool IsWaiting => IsRunning && Content.Length == 0;

    /// <summary>True while text is coming in: the caret blinks after it.</summary>
    public bool IsStreaming => IsRunning && Content.Length > 0;

    public ObservableCollection<ToolCallItemViewModel> ToolCalls { get; } = [];

    /// <summary>"Tools Used (3)"; empty without tool calls.</summary>
    public string ToolsLabel => ToolCalls.Count == 0 ? string.Empty : string.Create(CultureInfo.InvariantCulture, $"Tools Used ({ToolCalls.Count})");

    public bool HasTools => ToolCalls.Count > 0;

    /// <summary>Call after the tool calls changed, so the heading over them follows.</summary>
    public void ToolsChanged()
    {
        OnPropertyChanged(nameof(ToolsLabel));
        OnPropertyChanged(nameof(HasTools));
    }
}

/// <summary>
/// The chat screen: the list of chats, the messages of the chosen one as they are written, the
/// question the agent may ask, and the box to type in.
/// </summary>
/// <remarks>
/// The screen does not drive the agent's work and does not hold its state. It starts a run and then
/// follows <see cref="IAgentEvents"/>, the same stream a run from a schedule or the Diagnostics test
/// produces; what it shows after a restart comes from the database. A reply that streams is drawn a
/// few times a second, not for every piece of text: drawing Markdown is the expensive part.
/// </remarks>
internal sealed partial class ChatViewModel : PageViewModel, IDisposable
{
    private const int HistoryLimit = 200;
    private const int SessionLimit = 100;

    /// <summary>How long streamed text is collected before it is drawn.</summary>
    private static readonly TimeSpan _drawInterval = TimeSpan.FromMilliseconds(80);

    private readonly AgentSessionRepository _sessions;
    private readonly SessionMessageRepository _messages;
    private readonly AgentRunner _runner;
    private readonly QuestionBroker _questions;
    private readonly ISettingsStore? _settings;
    private readonly TimeProvider _time;
    private readonly Action<Action> _post;
    private readonly IAgentEventSubscription _subscription;
    private readonly CancellationTokenSource _closing = new();
    private readonly Dictionary<string, StringBuilder> _streamed = new(StringComparer.Ordinal);
    private readonly Lock _streamLock = new();
    private bool _drawScheduled;
    private string? _questionId;
    private bool _disposed;

    /// <param name="sessions">The chats.</param>
    /// <param name="messages">Their messages.</param>
    /// <param name="runner">Starts and stops a reply.</param>
    /// <param name="questions">Takes the answer to a question the agent asked.</param>
    /// <param name="events">What a run reports while it goes on.</param>
    /// <param name="post">Runs an action on the screen's thread; the dispatcher when null.</param>
    /// <param name="settings">Where the effort level is kept; without it the level cannot be changed here.</param>
    /// <param name="time">Tells today from yesterday in the list of chats; the system clock when null.</param>
    public ChatViewModel(
        AgentSessionRepository sessions,
        SessionMessageRepository messages,
        AgentRunner runner,
        QuestionBroker questions,
        IAgentEvents events,
        Action<Action>? post = null,
        ISettingsStore? settings = null,
        TimeProvider? time = null)
    {
        _sessions = sessions;
        _messages = messages;
        _runner = runner;
        _questions = questions;
        _settings = settings;
        _time = time ?? TimeProvider.System;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        _subscription = events.Subscribe();
        Effort = settings?.GetValue(SettingKeys.AgentEffort) ?? "high";
        Model = settings?.GetValue(SettingKeys.AgentModel) ?? string.Empty;

        // Chats and the runs of scheduled tasks; a helper's own session is part of its parent's.
        foreach (var session in sessions.ListRecent(SessionLimit).Where(session => session.Kind != SessionKind.Subagent))
        {
            Sessions.Add(ToItem(session));
        }

        Regroup();
        _ = Task.Run(PumpAsync);
    }

    /// <summary>Raised when the newest message changed, so the view can keep it in sight.</summary>
    public event EventHandler? NewestChanged;

    public override string Title => "Chat";

    /// <summary>The effort levels a reply can be asked for, lowest first.</summary>
    public IReadOnlyList<string> Efforts { get; } = ["low", "medium", "high", "xhigh", "max"];

    /// <summary>What the cards of an empty chat and the pills under the box send.</summary>
    public IReadOnlyList<QuickAction> QuickActions { get; } =
    [
        new("Analyze Market", "Run market analysis", "BarChart"),
        new("Review Portfolio", "Check current positions", "AccountBalanceWallet"),
        new("Adjust Strategy", "Optimize trading strategy", "Tune"),
        new("Start Trading", "Begin automated trading", "RocketLaunch"),
    ];

    public ObservableCollection<SessionItemViewModel> Sessions { get; } = [];

    public ObservableCollection<MessageItemViewModel> Messages { get; } = [];

    /// <summary>The answers the agent offers with its question.</summary>
    public ObservableCollection<string> QuestionOptions { get; } = [];

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(DeleteChatCommand))]
    public partial SessionItemViewModel? SelectedSession { get; set; }

    /// <summary>What is typed and not yet sent.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SendCommand))]
    public partial string Draft { get; set; } = string.Empty;

    /// <summary>True while a reply is being written in the chosen chat.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SendCommand))]
    [NotifyCanExecuteChangedFor(nameof(StopCommand))]
    [NotifyCanExecuteChangedFor(nameof(DeleteChatCommand))]
    public partial bool IsRunning { get; set; }

    /// <summary>The question the agent is waiting on; empty when there is none.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasQuestion))]
    [NotifyCanExecuteChangedFor(nameof(SendCommand))]
    public partial string Question { get; set; } = string.Empty;

    public bool HasQuestion => Question.Length > 0;

    public bool IsEmpty => Messages.Count == 0;

    /// <summary>True shows the model's reasoning over each reply that has one.</summary>
    [ObservableProperty]
    public partial bool ShowThinking { get; set; }

    /// <summary>True opens every tool call to its arguments and result.</summary>
    [ObservableProperty]
    public partial bool ExpandAllTools { get; set; }

    /// <summary>How hard the model thinks: one of <see cref="Efforts"/>. Saved as the setting <c>agent.effort</c>.</summary>
    [ObservableProperty]
    public partial string Effort { get; set; }

    /// <summary>The model replies come from, as set on the Settings page.</summary>
    [ObservableProperty]
    public partial string Model { get; set; }

    /// <summary>"3 conversations", under the list.</summary>
    public string SessionsLabel => Sessions.Count == 1 ? "1 conversation" : string.Create(CultureInfo.InvariantCulture, $"{Sessions.Count} conversations");

    /// <summary>The title of the open chat, under the heading; a hint while none is open.</summary>
    public string Subtitle => SelectedSession?.Title ?? "New chat";

    public override void Activate()
    {
        base.Activate();
        if (_settings is not null)
        {
            // Both can have changed on the Settings page.
            Effort = _settings.GetValue(SettingKeys.AgentEffort);
            Model = _settings.GetValue(SettingKeys.AgentModel);
        }
    }

    public void Dispose()
    {
        // Registered under two types, so the container asks twice.
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _closing.Cancel();
        _subscription.Dispose();
        _closing.Dispose();
    }

    /// <summary>Shows one session, for example the run of a task another page points to.</summary>
    public void Open(string sessionId)
    {
        RefreshSession(sessionId);
        if (Sessions.FirstOrDefault(session => session.Id == sessionId) is { } item)
        {
            SelectedSession = item;
        }
    }

    /// <summary>Opens an empty chat. Nothing is stored until the first message is sent.</summary>
    [RelayCommand]
    public void NewChat() => SelectedSession = null;

    [RelayCommand(CanExecute = nameof(CanSend))]
    public void Send()
    {
        var text = Draft.Trim();
        Draft = string.Empty;

        // While the agent waits for an answer, what is typed is that answer.
        if (_questionId is { } questionId && SelectedSession is { } asking)
        {
            Answer(asking.Id, questionId, text);
            return;
        }

        var session = SelectedSession;
        if (session is null)
        {
            session = ToItem(_sessions.Create());
            Sessions.Insert(0, session);
            Regroup();
            SelectedSession = session;
        }

        Start(session.Id, text);
    }

    /// <summary>Sends the text of a quick action as a message, as if it had been typed.</summary>
    [RelayCommand]
    public void RunQuickAction(string? prompt)
    {
        if (string.IsNullOrWhiteSpace(prompt) || (IsRunning && !HasQuestion))
        {
            return;
        }

        Draft = prompt;
        Send();
    }

    [RelayCommand]
    private void ChooseEffort(string? effort)
    {
        if (effort is not null && Efforts.Contains(effort))
        {
            Effort = effort;
            _settings?.SetValue(SettingKeys.AgentEffort, effort);
        }
    }

    /// <summary>Answers the agent's question with one of the options it offered.</summary>
    [RelayCommand]
    public void ChooseOption(string option)
    {
        if (_questionId is { } questionId && SelectedSession is { } session)
        {
            Answer(session.Id, questionId, option);
        }
    }

    [RelayCommand(CanExecute = nameof(IsRunning))]
    public void Stop()
    {
        if (SelectedSession is { } session)
        {
            _runner.Cancel(session.Id);
        }
    }

    [RelayCommand(CanExecute = nameof(CanDelete))]
    public void DeleteChat()
    {
        if (SelectedSession is not { } session)
        {
            return;
        }

        _sessions.Delete(session.Id);
        Sessions.Remove(session);
        SelectedSession = null;
        Regroup();
    }

    private static string FooterOf(SessionMessage message) =>
        message.Role == MessageRole.Assistant && message.Status == MessageStatus.Complete && message.Model is { Length: > 0 } model
            ? string.Create(CultureInfo.InvariantCulture, $"{model} · {message.InputTokens ?? 0} tokens in, {message.OutputTokens ?? 0} out")
            : string.Empty;

    private static string NoteOf(SessionMessage message) => message.Status switch
    {
        MessageStatus.Failed => message.Error ?? "The reply failed.",
        MessageStatus.Cancelled => "Stopped.",
        _ => string.Empty,
    };

    private static void Apply(ToolCallItemViewModel item, ToolCall call)
    {
        var status = call.Status.ToString().ToLowerInvariant();
        item.Status = call.DurationMs is { } milliseconds
            ? string.Create(CultureInfo.InvariantCulture, $"{status} · {milliseconds} ms")
            : status;
        item.IsProblem = call.Status is ToolCallStatus.Failed or ToolCallStatus.Denied;
        item.IsSucceeded = call.Status == ToolCallStatus.Succeeded;
        item.IsRunning = !item.IsProblem && !item.IsSucceeded;
        item.Duration = call.DurationMs is { } took ? string.Create(CultureInfo.InvariantCulture, $"{took}ms") : string.Empty;
        item.Summary = call.ResultSummaryJson is { Length: > 0 } summary ? Shorten(summary, 300) : string.Empty;
    }

    private static string Shorten(string text, int length) => text.Length <= length ? text : text[..length] + "…";

    private static SessionItemViewModel ToItem(AgentSession session)
    {
        var item = new SessionItemViewModel(session.Id);
        Apply(item, session);
        return item;
    }

    private static void Apply(SessionItemViewModel item, AgentSession session)
    {
        item.Title = string.IsNullOrWhiteSpace(session.Title) ? "New chat" : session.Title;
        item.MessagesLabel = session.TotalMessages == 1 ? "1 message" : string.Create(CultureInfo.InvariantCulture, $"{session.TotalMessages} messages");
        item.LastActiveAt = session.LastMessageAt ?? session.StartedAt;
    }

    private MessageItemViewModel ToItem(SessionMessage message)
    {
        var item = new MessageItemViewModel(message.Id, message.Role == MessageRole.User);
        Apply(item, message);
        return item;
    }

    private void Apply(MessageItemViewModel item, SessionMessage message)
    {
        if (!item.IsUser && message.Model is { Length: > 0 } model)
        {
            item.Author = $"Agent · {model}";
        }

        item.Time = message.CreatedAt > 0
            ? DateTimeOffset.FromUnixTimeMilliseconds(message.CreatedAt).ToLocalTime().ToString("HH:mm", CultureInfo.CurrentCulture)
            : string.Empty;
        item.Content = message.Content;
        item.Thinking = message.ThinkingContent ?? string.Empty;
        item.Note = NoteOf(message);
        item.Footer = FooterOf(message);
        item.IsRunning = message.Status == MessageStatus.Running;
        foreach (var call in message.ToolCalls)
        {
            var existing = item.ToolCalls.FirstOrDefault(candidate => candidate.ToolUseId == call.ToolUseId);
            if (existing is null)
            {
                existing = new ToolCallItemViewModel(call.ToolUseId, call.Name, Shorten(call.ArgumentsJson, 200)) { IsExpanded = ExpandAllTools };
                item.ToolCalls.Add(existing);
            }

            Apply(existing, call);
        }

        item.ToolsChanged();
    }

    /// <summary>
    /// Puts a heading on the first chat of each day group: today, yesterday, the last seven days,
    /// earlier. The list is already newest first.
    /// </summary>
    private void Regroup()
    {
        var today = _time.GetLocalNow().Date;
        string? previous = null;
        foreach (var session in Sessions)
        {
            var day = DateTimeOffset.FromUnixTimeMilliseconds(session.LastActiveAt).ToLocalTime().Date;
            var age = (today - day).Days;
            var group = age <= 0 ? "TODAY" : age == 1 ? "YESTERDAY" : age < 7 ? "PREVIOUS 7 DAYS" : "EARLIER";
            session.Group = group == previous ? null : group;
            previous = group;
        }

        OnPropertyChanged(nameof(SessionsLabel));
    }

    partial void OnExpandAllToolsChanged(bool value)
    {
        foreach (var call in Messages.SelectMany(message => message.ToolCalls))
        {
            call.IsExpanded = value;
        }
    }

    private bool CanSend() => !string.IsNullOrWhiteSpace(Draft) && (!IsRunning || HasQuestion);

    private bool CanDelete() => SelectedSession is not null && !IsRunning;

    partial void OnSelectedSessionChanged(SessionItemViewModel? value)
    {
        lock (_streamLock)
        {
            _streamed.Clear();
        }

        Messages.Clear();
        ShowQuestion(null);
        OnPropertyChanged(nameof(Subtitle));
        if (value is null)
        {
            IsRunning = false;
            OnPropertyChanged(nameof(IsEmpty));
            return;
        }

        // Newest last. The window comes back oldest first.
        foreach (var message in _messages.GetWindow(value.Id, HistoryLimit))
        {
            if (message.Role is MessageRole.User or MessageRole.Assistant)
            {
                Messages.Add(ToItem(message));
            }
        }

        IsRunning = _runner.IsRunning(value.Id);
        ShowQuestion(_sessions.Get(value.Id)?.PendingQuestion);
        OnPropertyChanged(nameof(IsEmpty));
        NewestChanged?.Invoke(this, EventArgs.Empty);
    }

    private void Start(string sessionId, string text)
    {
        IsRunning = true;
        // Not awaited: the reply arrives through the events, like every other run's.
        _ = Task.Run(() => _runner.RunAsync(sessionId, text, CancellationToken.None));
    }

    private void Answer(string sessionId, string questionId, string answer)
    {
        var result = _questions.Answer(sessionId, questionId, answer);
        ShowQuestion(null);
        if (result == AnswerResult.StartNewRun)
        {
            // The run that asked is gone (the app was restarted): the answer starts a new one.
            Start(sessionId, answer);
        }
    }

    private void ShowQuestion(PendingQuestion? question)
    {
        _questionId = question?.Id;
        QuestionOptions.Clear();
        foreach (var option in question?.Options ?? [])
        {
            QuestionOptions.Add(option);
        }

        Question = question?.Question ?? string.Empty;
    }

    private async Task PumpAsync()
    {
        try
        {
            await foreach (var item in _subscription.Reader.ReadAllAsync(_closing.Token).ConfigureAwait(false))
            {
                if (item is TextDelta delta)
                {
                    Collect(delta);
                }
                else
                {
                    var captured = item;
                    _post(() => Handle(captured));
                }
            }
        }
        catch (OperationCanceledException)
        {
            // The screen is gone.
        }
    }

    /// <summary>Keeps streamed text until the next drawing, so that a fast reply is not drawn for every piece.</summary>
    private void Collect(TextDelta delta)
    {
        bool schedule;
        lock (_streamLock)
        {
            if (!_streamed.TryGetValue(delta.MessageId, out var text))
            {
                _streamed[delta.MessageId] = text = new StringBuilder();
            }

            text.Append(delta.Text);
            schedule = !_drawScheduled;
            _drawScheduled = true;
        }

        if (schedule)
        {
            _ = Task.Delay(_drawInterval).ContinueWith(_ => _post(Draw), TaskScheduler.Default);
        }
    }

    private void Draw()
    {
        Dictionary<string, string> pieces;
        lock (_streamLock)
        {
            _drawScheduled = false;
            pieces = _streamed.ToDictionary(pair => pair.Key, pair => pair.Value.ToString(), StringComparer.Ordinal);
            _streamed.Clear();
        }

        foreach (var (messageId, text) in pieces)
        {
            if (Messages.FirstOrDefault(message => message.Id == messageId) is { } item)
            {
                item.Content += text;
            }
        }

        NewestChanged?.Invoke(this, EventArgs.Empty);
    }

    private void Handle(AgentEvent item)
    {
        if (item is SessionChanged changed)
        {
            RefreshSession(changed.SessionId);
            return;
        }

        if (Sessions.FirstOrDefault(session => session.Id == item.SessionId) is { } listed)
        {
            listed.IsRunning = item switch
            {
                RunStarted => true,
                RunFinished => false,
                _ => listed.IsRunning,
            };
        }

        if (SelectedSession?.Id != item.SessionId)
        {
            return;
        }

        switch (item)
        {
            case MessageAdded added when added.Message.Role is MessageRole.User or MessageRole.Assistant:
                if (Messages.All(message => message.Id != added.Message.Id))
                {
                    Messages.Add(ToItem(added.Message));
                    OnPropertyChanged(nameof(IsEmpty));
                }

                break;

            case MessageUpdated updated:
                if (Messages.FirstOrDefault(message => message.Id == updated.Message.Id) is { } shown)
                {
                    // Text that is still on its way to the screen is in the stored message too.
                    lock (_streamLock)
                    {
                        _streamed.Remove(updated.Message.Id);
                    }

                    Apply(shown, updated.Message);
                }

                break;

            case ThinkingDelta thinking:
                if (Messages.FirstOrDefault(message => message.Id == thinking.MessageId) is { } reasoning)
                {
                    reasoning.Thinking += thinking.Text;
                }

                break;

            case ToolCallStarted started:
                if (Messages.FirstOrDefault(message => message.Id == started.Call.MessageId) is { } calling
                    && calling.ToolCalls.All(call => call.ToolUseId != started.Call.ToolUseId))
                {
                    var call = new ToolCallItemViewModel(started.Call.ToolUseId, started.Call.Name, Shorten(started.Call.ArgumentsJson, 200)) { IsExpanded = ExpandAllTools };
                    Apply(call, started.Call);
                    calling.ToolCalls.Add(call);
                    calling.ToolsChanged();
                }

                break;

            case ToolCallFinished finished:
                if (Messages.FirstOrDefault(message => message.Id == finished.Call.MessageId) is { } called
                    && called.ToolCalls.FirstOrDefault(call => call.ToolUseId == finished.Call.ToolUseId) is { } done)
                {
                    Apply(done, finished.Call);
                }

                break;

            case QuestionAsked asked:
                ShowQuestion(asked.Question);
                break;

            case QuestionClosed:
                ShowQuestion(null);
                break;

            case RunStarted:
                IsRunning = true;
                break;

            case RunFinished finished:
                IsRunning = false;
                ShowQuestion(null);
                // The stored reply is the truth; what was drawn while it streamed gives way to it.
                if (_messages.Get(finished.MessageId) is { } stored
                    && Messages.FirstOrDefault(message => message.Id == stored.Id) is { } final)
                {
                    lock (_streamLock)
                    {
                        _streamed.Remove(stored.Id);
                    }

                    Apply(final, stored);
                }

                break;
        }

        NewestChanged?.Invoke(this, EventArgs.Empty);
    }

    private void RefreshSession(string sessionId)
    {
        if (_sessions.Get(sessionId) is not { } session || session.Kind == SessionKind.Subagent)
        {
            return;
        }

        var item = Sessions.FirstOrDefault(candidate => candidate.Id == sessionId);
        if (item is null)
        {
            Sessions.Insert(0, ToItem(session));
            Regroup();
            return;
        }

        Apply(item, session);
        var index = Sessions.IndexOf(item);
        if (index > 0)
        {
            // The chat that was just written in goes to the top.
            Sessions.Move(index, 0);
        }

        Regroup();
        if (ReferenceEquals(item, SelectedSession))
        {
            OnPropertyChanged(nameof(Subtitle));
        }
    }
}

/// <summary>A ready-made request: a card of an empty chat sends its title as a message.</summary>
/// <param name="Title">What the card says and what is sent.</param>
/// <param name="Description">The line under the title.</param>
/// <param name="Icon">The key of its icon in <c>Theme/Tokens/Icons.axaml</c>, without the "Icon" prefix.</param>
internal sealed record QuickAction(string Title, string Description, string Icon)
{
    public Avalonia.Media.Geometry? Glyph =>
        Avalonia.Application.Current is { } app && Avalonia.Controls.ResourceNodeExtensions.TryFindResource(app, "Icon" + Icon, out var found)
            ? found as Avalonia.Media.Geometry
            : null;
}
