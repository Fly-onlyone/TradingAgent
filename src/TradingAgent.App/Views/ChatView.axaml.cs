using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Threading;
using TradingAgent.App.ViewModels;

namespace TradingAgent.App.Views;

public sealed partial class ChatView : UserControl
{
    private ChatViewModel? _viewModel;

    public ChatView()
    {
        InitializeComponent();
        // Tunnelling: the text box would otherwise take Enter as a new line before this is asked.
        DraftBox.AddHandler(KeyDownEvent, OnDraftKeyDown, RoutingStrategies.Tunnel);
    }

    protected override void OnDataContextChanged(EventArgs e)
    {
        base.OnDataContextChanged(e);
        if (_viewModel is not null)
        {
            _viewModel.NewestChanged -= OnNewestChanged;
        }

        _viewModel = DataContext as ChatViewModel;
        if (_viewModel is not null)
        {
            _viewModel.NewestChanged += OnNewestChanged;
        }
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        if (_viewModel is not null)
        {
            _viewModel.NewestChanged -= OnNewestChanged;
            _viewModel = null;
        }
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        if (_viewModel is null && DataContext is ChatViewModel viewModel)
        {
            _viewModel = viewModel;
            viewModel.NewestChanged += OnNewestChanged;
        }
    }

    private void OnDraftKeyDown(object? sender, KeyEventArgs e)
    {
        // Enter sends; Shift+Enter is a new line.
        if (e.Key == Key.Enter && !e.KeyModifiers.HasFlag(KeyModifiers.Shift) && DataContext is ChatViewModel viewModel)
        {
            e.Handled = true;
            if (viewModel.SendCommand.CanExecute(null))
            {
                viewModel.SendCommand.Execute(null);
            }
        }
    }

    /// <summary>Closes the list of effort levels once one is chosen; a flyout does not close on a press inside it.</summary>
    private void OnEffortChosen(object? sender, RoutedEventArgs e) => EffortButton.Flyout?.Hide();

    /// <summary>Keeps the newest message in sight while a reply is written.</summary>
    private void OnNewestChanged(object? sender, EventArgs e)
    {
        if (DataContext is ChatViewModel { Messages.Count: > 0 } viewModel)
        {
            var last = viewModel.Messages[^1];
            // After layout: the message has just grown.
            Dispatcher.UIThread.Post(() => MessageList.ScrollIntoView(last), DispatcherPriority.Background);
        }
    }
}
