namespace TradingAgent.Core.Shell;

/// <summary>Where the main window was when it was last seen, so it can reopen there.</summary>
/// <param name="X">Left edge in physical pixels of the virtual desktop.</param>
/// <param name="Y">Top edge in physical pixels of the virtual desktop.</param>
/// <param name="Width">Width in device-independent units.</param>
/// <param name="Height">Height in device-independent units.</param>
/// <param name="Maximized">The window was maximized; the other values are its restored geometry.</param>
public sealed record WindowPlacement(int X, int Y, double Width, double Height, bool Maximized);

/// <summary>The usable area of one monitor, in physical pixels, and its scale factor.</summary>
public readonly record struct ScreenArea(int X, int Y, int Width, int Height, double Scaling);

public static class WindowPlacementRules
{
    public const double MinimumWidth = 1024;
    public const double MinimumHeight = 700;

    /// <summary>Pixels of the window that must lie on a screen in each direction for it to count as reachable.</summary>
    public const int MinimumVisiblePixels = 64;

    /// <summary>
    /// Decides whether a saved placement can be restored: enough of the window must lie on a connected
    /// screen for the user to see and grab it. A monitor that was unplugged, or a changed layout, would
    /// otherwise reopen the window where nobody can reach it.
    /// </summary>
    /// <remarks>An empty screen list means the screens could not be read; the placement is then trusted.</remarks>
    public static bool IsReachable(WindowPlacement placement, IReadOnlyList<ScreenArea> screens)
    {
        ArgumentNullException.ThrowIfNull(placement);
        ArgumentNullException.ThrowIfNull(screens);
        if (screens.Count == 0)
        {
            return true;
        }

        foreach (var screen in screens)
        {
            // Width and height are device-independent; the screen the window sits on gives the scale.
            var scale = screen.Scaling > 0 ? screen.Scaling : 1.0;
            var right = placement.X + (placement.Width * scale);
            var bottom = placement.Y + (placement.Height * scale);

            var overlapWidth = Math.Min(right, screen.X + screen.Width) - Math.Max(placement.X, screen.X);
            var overlapHeight = Math.Min(bottom, screen.Y + screen.Height) - Math.Max(placement.Y, screen.Y);
            if (overlapWidth >= MinimumVisiblePixels && overlapHeight >= MinimumVisiblePixels)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>Raises a saved size to the window's minimum, in case the minimum grew between versions.</summary>
    public static WindowPlacement Normalize(WindowPlacement placement)
    {
        ArgumentNullException.ThrowIfNull(placement);
        return placement with
        {
            Width = Math.Max(placement.Width, MinimumWidth),
            Height = Math.Max(placement.Height, MinimumHeight),
        };
    }
}
