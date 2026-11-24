using Avalonia;
using Avalonia.Controls;

namespace TradingAgent.App.Motion;

/// <summary>
/// Runs an animation frame by frame on the UI thread, for motion a style transition cannot describe:
/// springs that keep their speed when the target changes, and drawings that change every frame.
/// </summary>
/// <remarks>
/// Frames are asked for only while something runs, so a still window costs nothing. Endless loops
/// (shimmer, drifting blobs) do not belong here; they are drawn on the render thread.
/// </remarks>
public static class FrameDriver
{
    /// <summary>
    /// True when animations must not play: each jumps to its end at once. Set from the "Reduced
    /// Motion" setting and the Windows animation setting; tests set it so they need no frames.
    /// </summary>
    public static bool IsInstant { get; set; }

    /// <summary>
    /// Calls <paramref name="step"/> every frame with the seconds passed since the start, until it
    /// returns false or the returned handle is disposed.
    /// </summary>
    /// <remarks>
    /// When animations are off, or <paramref name="target"/> is in no window, <paramref name="step"/>
    /// is called once with positive infinity: it must then put everything in its final state.
    /// </remarks>
    public static IDisposable Run(Visual target, Func<double, bool> step)
    {
        ArgumentNullException.ThrowIfNull(target);
        ArgumentNullException.ThrowIfNull(step);
        if (IsInstant || TopLevel.GetTopLevel(target) is not { } window)
        {
            step(double.PositiveInfinity);
            return Stopped.Instance;
        }

        var run = new Running(window, step);
        run.Request();
        return run;
    }

    private sealed class Running(TopLevel window, Func<double, bool> step) : IDisposable
    {
        private TimeSpan? _start;
        private bool _stopped;

        public void Dispose() => _stopped = true;

        public void Request() => window.RequestAnimationFrame(OnFrame);

        private void OnFrame(TimeSpan now)
        {
            if (_stopped)
            {
                return;
            }

            _start ??= now;
            if (IsInstant)
            {
                // Switched off while running: finish now.
                step(double.PositiveInfinity);
                _stopped = true;
                return;
            }

            if (step((now - _start.Value).TotalSeconds))
            {
                Request();
            }
            else
            {
                _stopped = true;
            }
        }
    }

    private sealed class Stopped : IDisposable
    {
        public static Stopped Instance { get; } = new();

        public void Dispose()
        {
        }
    }
}
