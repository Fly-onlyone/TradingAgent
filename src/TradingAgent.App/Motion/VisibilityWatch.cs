using Avalonia;
using Avalonia.VisualTree;

namespace TradingAgent.App.Motion;

/// <summary>
/// Tells a control when it, or anything it sits in, is shown or hidden.
/// </summary>
/// <remarks>
/// A control that animates must stop while it cannot be seen, and a control gets no notice when a
/// parent is hidden. Without this a hidden progress bar would go on asking for frames, and in an
/// idle window that alone keeps the processor busy.
/// </remarks>
public static class VisibilityWatch
{
    /// <summary>
    /// Calls <paramref name="changed"/> whenever <paramref name="control"/> or one of its ancestors
    /// is shown or hidden, until the returned handle is disposed. Call it once the control is in a
    /// window; the ancestors are those it has then.
    /// </summary>
    public static IDisposable Subscribe(Visual control, Action changed)
    {
        ArgumentNullException.ThrowIfNull(control);
        ArgumentNullException.ThrowIfNull(changed);
        var watched = new List<Visual>();
        void OnChanged(object? sender, AvaloniaPropertyChangedEventArgs change)
        {
            if (change.Property == Visual.IsVisibleProperty)
            {
                changed();
            }
        }

        foreach (var visual in control.GetSelfAndVisualAncestors())
        {
            visual.PropertyChanged += OnChanged;
            watched.Add(visual);
        }

        return new Handle(() =>
        {
            foreach (var visual in watched)
            {
                visual.PropertyChanged -= OnChanged;
            }
        });
    }

    private sealed class Handle(Action release) : IDisposable
    {
        private Action? _release = release;

        public void Dispose()
        {
            _release?.Invoke();
            _release = null;
        }
    }
}
