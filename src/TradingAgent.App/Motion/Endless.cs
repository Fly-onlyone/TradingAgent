using System.Diagnostics;
using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Rendering.Composition;
using Avalonia.Threading;

namespace TradingAgent.App.Motion;

/// <summary>
/// Endless motion: a shimmer sliding by, a gradient flowing, a dot pulsing, the background drifting.
/// </summary>
/// <remarks>
/// <para>
/// All of it runs off one clock that ticks 30 times a second, not once per frame of the display.
/// Measured on a 143 Hz display: presenting a frame costs the same whatever is drawn, so a single
/// endless animation that ran at the display's rate kept half a processor core busy in an idle
/// window. These motions are slow and soft; 30 steps a second look the same and cost a fifth.
/// </para>
/// <para>
/// A step only moves, scales or fades a control in the compositor: nothing is laid out or drawn
/// again. The clock stops when nothing is registered, while <see cref="IsSuspended"/> is true (the
/// window is hidden) and while animations are off.
/// </para>
/// </remarks>
public static class Endless
{
    /// <summary>Steps per second of every endless motion.</summary>
    public const double StepsPerSecond = 30;

    private static readonly Easing _linear = new LinearEasing();
    private static readonly List<Entry> _entries = [];
    private static readonly Stopwatch _clock = Stopwatch.StartNew();
    private static DispatcherTimer? _timer;
    private static bool _suspended;

    /// <summary>True stops every endless motion where it is: nobody can see the window.</summary>
    public static bool IsSuspended
    {
        get => _suspended;
        set
        {
            _suspended = value;
            UpdateTimer();
        }
    }

    /// <summary>
    /// Calls <paramref name="step"/> 30 times a second with the seconds passed since this call, until
    /// the returned handle is disposed. With animations off it is never called.
    /// </summary>
    public static IDisposable Every(Action<double> step)
    {
        ArgumentNullException.ThrowIfNull(step);
        if (FrameDriver.IsInstant)
        {
            return Stopped.Instance;
        }

        var entry = new Entry(step, _clock.Elapsed.TotalSeconds);
        _entries.Add(entry);
        UpdateTimer();
        return entry;
    }

    /// <summary>
    /// Moves <paramref name="visual"/> through the given horizontal offsets, one after the other at
    /// even steps of time, then starts again. Each part uses <paramref name="easing"/>.
    /// </summary>
    public static IDisposable SlideX(Visual visual, TimeSpan duration, Easing? easing, params double[] offsets)
    {
        ArgumentNullException.ThrowIfNull(offsets);
        if (offsets.Length < 2 || ElementComposition.GetElementVisual(visual) is not { } composition)
        {
            return Stopped.Instance;
        }

        return Run(
            composition,
            seconds => composition.Translation = new Vector3D(Along(offsets, seconds, duration, easing), 0, 0),
            () => composition.Translation = default);
    }

    /// <summary>
    /// Moves <paramref name="visual"/> up and down through the given vertical offsets, at even steps
    /// of time, then starts again.
    /// </summary>
    public static IDisposable BobY(Visual visual, TimeSpan duration, Easing? easing, TimeSpan delay, params double[] offsets)
    {
        ArgumentNullException.ThrowIfNull(offsets);
        if (offsets.Length < 2 || ElementComposition.GetElementVisual(visual) is not { } composition)
        {
            return Stopped.Instance;
        }

        return Run(
            composition,
            seconds => composition.Translation = new Vector3D(0, Along(offsets, Math.Max(0, seconds - delay.TotalSeconds), duration, easing), 0),
            () => composition.Translation = default);
    }

    /// <summary>
    /// Scales <paramref name="visual"/> around its middle and fades it through the given key values,
    /// at even steps of time, then starts again.
    /// </summary>
    public static IDisposable Pulse(Visual visual, TimeSpan duration, Easing? easing, double[] scales, double[] opacities, TimeSpan delay = default)
    {
        ArgumentNullException.ThrowIfNull(scales);
        ArgumentNullException.ThrowIfNull(opacities);
        if (ElementComposition.GetElementVisual(visual) is not { } composition)
        {
            return Stopped.Instance;
        }

        return Run(
            composition,
            seconds =>
            {
                var time = Math.Max(0, seconds - delay.TotalSeconds);
                if (scales.Length >= 2)
                {
                    var scale = Along(scales, time, duration, easing);
                    composition.CenterPoint = new Vector3D(visual.Bounds.Width / 2, visual.Bounds.Height / 2, 0);
                    composition.Scale = new Vector3D(scale, scale, 1);
                }

                if (opacities.Length >= 2)
                {
                    composition.Opacity = (float)Along(opacities, time, duration, easing);
                }
            },
            () =>
            {
                composition.Scale = new Vector3D(1, 1, 1);
                composition.Opacity = (float)visual.Opacity;
            });
    }

    /// <summary>The value at a moment of a round through <paramref name="keys"/>, which are spread evenly over the round.</summary>
    public static double Along(double[] keys, double seconds, TimeSpan round, Easing? easing)
    {
        ArgumentNullException.ThrowIfNull(keys);
        if (keys.Length == 1 || round <= TimeSpan.Zero)
        {
            return keys[0];
        }

        var parts = keys.Length - 1;
        var position = seconds % round.TotalSeconds / round.TotalSeconds * parts;
        var part = Math.Min((int)position, parts - 1);
        return keys[part] + ((keys[part + 1] - keys[part]) * (easing ?? _linear).Ease(position - part));
    }

    private static Entry Run(CompositionVisual composition, Action<double> step, Action reset)
    {
        if (FrameDriver.IsInstant)
        {
            return Stopped.Instance;
        }

        var entry = new Entry(
            seconds =>
            {
                if (!composition.IsDisposed)
                {
                    step(seconds);
                }
            },
            _clock.Elapsed.TotalSeconds,
            () =>
            {
                // Put the control back as it is drawn.
                if (!composition.IsDisposed)
                {
                    reset();
                }
            });
        _entries.Add(entry);
        UpdateTimer();
        return entry;
    }

    private static void UpdateTimer()
    {
        var needed = _entries.Count > 0 && !_suspended && !FrameDriver.IsInstant;
        if (needed && _timer is null)
        {
            _timer = new DispatcherTimer(TimeSpan.FromSeconds(1 / StepsPerSecond), DispatcherPriority.Normal, OnTick);
            _timer.Start();
        }
        else if (!needed && _timer is not null)
        {
            _timer.Stop();
            _timer = null;
        }
    }

    private static void OnTick(object? sender, EventArgs e)
    {
        if (FrameDriver.IsInstant)
        {
            // Switched off while running.
            UpdateTimer();
            return;
        }

        var now = _clock.Elapsed.TotalSeconds;
        foreach (var entry in _entries.ToArray())
        {
            entry.Step(now - entry.Start);
        }
    }

    private class Entry(Action<double> step, double start, Action? reset = null) : IDisposable
    {
        public Action<double> Step { get; } = step;

        public double Start { get; } = start;

        public void Dispose()
        {
            if (_entries.Remove(this))
            {
                reset?.Invoke();
                UpdateTimer();
            }
        }
    }

    private sealed class Stopped() : Entry(_ => { }, 0)
    {
        public static Stopped Instance { get; } = new();
    }
}
