using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.Core.Agent;
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
}

/// <summary>One tool the model called, as a line in its reply.</summary>
internal sealed partial class ToolCallItemViewModel(string toolUseId, string name, string arguments) : ObservableObject
{
    public string ToolUseId { get; } = toolUseId;

    public string Name { get; } = name;

    public string Arguments { get; } = arguments;

    /// <summary><c>running</c>, <c>succeeded</c>, <c>failed</c> or <c>denied</c>, and how long it took.</summary>
    [ObservableProperty]
    public partial string Status { get; set; } = "running";

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
    public partial string Content { get; set; } = string.Empty;

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
    public partial bool IsRunning { get; set; }

    public bool HasThinking => Thinking.Length > 0;

    public bool HasNote => Note.Length > 0;

    public ObservableCollection<ToolCallItemViewModel> ToolCalls { get; } = [];
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
    private readonly Action<Action> _post;
    private readonly IAgentEventSubscription _subscription;
    private readonly CancellationTokenSource _closing = new();
    private readonly Dictionary<string, StringBuilder> _streamed = new(StringComparer.Ordinal);
    private readonly Lock _streamLock = new();
    private bool _drawScheduled;
    private string? _questionId;

    /// <param name="sessions">The chats.</param>
    /// <param name="messages">Their messages.</param>
    /// <param name="runner">Starts and stops a reply.</param>
    /// <param name="questions">Takes the answer to a question the agent asked.</param>
    /// <param name="events">What a run reports while it goes on.</param>
    /// <param name="post">Runs an action on the screen's thread; the dispatcher when null.</param>
    public ChatViewModel(
        AgentSessionRepository sessions,
        SessionMessageRepository messages,
        AgentRunner runner,
        QuestionBroker questions,
        IAgentEvents events,
        Action<Action>? post = null)
    {
        _sessions = sessions;
        _messages = messages;
        _runner = runner;
        _questions = questions;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        _subscription = events.Subscribe();

        foreach (var session in sessions.ListRecent(SessionLimit, SessionKind.Chat))
        {
            Sessions.Add(ToItem(session));
        }

        _ = Task.Run(PumpAsync);
    }

    /// <summary>Raised when the newest message changed, so the view can keep it in sight.</summary>
    public event EventHandler? NewestChanged;

    public override string Title => "Chat";

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

    public void Dispose()
    {
        _closing.Cancel();
        _subscription.Dispose();
        _closing.Dispose();
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
            SelectedSession = session;
        }

        Start(session.Id, text);
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
        item.Summary = call.ResultSummaryJson is { Length: > 0 } summary ? Shorten(summary, 300) : string.Empty;
    }

    private static string Shorten(string text, int length) => text.Length <= length ? text : text[..length] + "…";

    private static SessionItemViewModel ToItem(AgentSession session) =>
        new(session.Id) { Title = string.IsNullOrWhiteSpace(session.Title) ? "New chat" : session.Title };

    private static MessageItemViewModel ToItem(SessionMessage message)
    {
        var item = new MessageItemViewModel(message.Id, message.Role == MessageRole.User);
        Apply(item, message);
        return item;
    }

    private static void Apply(MessageItemViewModel item, SessionMessage message)
    {
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
                existing = new ToolCallItemViewModel(call.ToolUseId, call.Name, Shorten(call.ArgumentsJson, 200));
                item.ToolCalls.Add(existing);
            }

            Apply(existing, call);
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
                    var call = new ToolCallItemViewModel(started.Call.ToolUseId, started.Call.Name, Shorten(started.Call.ArgumentsJson, 200));
                    Apply(call, started.Call);
                    calling.ToolCalls.Add(call);
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
        if (_sessions.Get(sessionId) is not { Kind: SessionKind.Chat } session)
        {
            return;
        }

        var item = Sessions.FirstOrDefault(candidate => candidate.Id == sessionId);
        if (item is null)
        {
            Sessions.Insert(0, ToItem(session));
            return;
        }

        item.Title = string.IsNullOrWhiteSpace(session.Title) ? "New chat" : session.Title;
        var index = Sessions.IndexOf(item);
        if (index > 0)
        {
            // The chat that was just written in goes to the top.
            Sessions.Move(index, 0);
        }
    }
}
