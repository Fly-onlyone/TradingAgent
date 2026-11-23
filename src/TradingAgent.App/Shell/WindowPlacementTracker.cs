using Avalonia;
using Avalonia.Controls;
using Avalonia.Threading;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;

namespace TradingAgent.App.Shell;

/// <summary>Reopens the main window where it was left, and remembers where it is moved to.</summary>
internal sealed class WindowPlacementTracker(ISettingsStore settings)
{
    /// <summary>Dragging fires a stream of events; save once the window has rested this long.</summary>
    private static readonly TimeSpan _saveDelay = TimeSpan.FromMilliseconds(500);

    private Window? _window;
    private DispatcherTimer? _timer;
    private WindowPlacement? _current;
    private WindowPlacement? _saved;

    /// <summary>Applies the saved placement to <paramref name="window"/> and starts tracking it. Call before the window is shown.</summary>
    public void Attach(Window window)
    {
        _window = window;
        Restore(window);

        _timer = new DispatcherTimer { Interval = _saveDelay };
        _timer.Tick += (_, _) => SaveNow();
        window.PositionChanged += (_, _) => Schedule();
        window.Resized += (_, _) => Schedule();
        window.Activated += (_, _) => SaveNow();
        window.PropertyChanged += (_, e) =>
        {
            if (e.Property == Window.WindowStateProperty)
            {
                Schedule();
            }
        };
    }

    /// <summary>Saves the placement immediately. Call before hiding or closing the window.</summary>
    public void SaveNow()
    {
        _timer?.Stop();
        if (_window is not { IsVisible: true } window)
        {
            return;
        }

        switch (window.WindowState)
        {
            case WindowState.Normal:
                var size = window.ClientSize;
                _current = new WindowPlacement(window.Position.X, window.Position.Y, size.Width, size.Height, Maximized: false);
                break;

            case WindowState.Maximized or WindowState.FullScreen:
                // Keep the geometry from before maximizing: that is what "restore down" should return to.
                if (_current is null)
                {
                    return;
                }

                _current = _current with { Maximized = true };
                break;

            default:
                return; // Minimized: position and size are meaningless.
        }

        if (_current != _saved)
        {
            settings.SetValue(SettingKeys.MainWindowPlacement, _current);
            _saved = _current;
        }
    }

    private void Schedule()
    {
        _timer?.Stop();
        _timer?.Start();
    }

    private void Restore(Window window)
    {
        var saved = settings.GetValue(SettingKeys.MainWindowPlacement);
        if (saved is null)
        {
            return;
        }

        saved = WindowPlacementRules.Normalize(saved);
        var screens = new List<ScreenArea>();
        foreach (var screen in window.Screens.All)
        {
            var area = screen.WorkingArea;
            screens.Add(new ScreenArea(area.X, area.Y, area.Width, area.Height, screen.Scaling));
        }

        // Unreachable position (monitor unplugged, layout changed): keep the size, let the window centre.
        if (WindowPlacementRules.IsReachable(saved, screens))
        {
            window.WindowStartupLocation = WindowStartupLocation.Manual;
            window.Position = new PixelPoint(saved.X, saved.Y);
        }

        window.Width = saved.Width;
        window.Height = saved.Height;
        if (saved.Maximized)
        {
            window.WindowState = WindowState.Maximized;
        }

        _current = saved;
        _saved = saved;
    }
}
