using System.Numerics;
using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Rendering.Composition;
using Avalonia.Rendering.Composition.Animations;

namespace TradingAgent.App.Motion;

/// <summary>
/// Endless motion: a shimmer sliding by, a gradient flowing, a dot pulsing, a spinner turning.
/// </summary>
/// <remarks>
/// These run in the compositor, on the render thread: once started they cost the UI thread nothing,
/// however long they run. They move, scale, turn or fade a whole control; a drawing that changes its
/// shape every frame cannot be done this way. With animations off nothing starts and the control
/// stays as it is drawn.
/// </remarks>
public static class Endless
{
    private static readonly Easing _linear = new LinearEasing();

    /// <summary>
    /// Moves <paramref name="visual"/> through the given horizontal offsets, one after the other at
    /// even steps of time, then starts again. Each step uses <paramref name="easing"/>.
    /// </summary>
    public static IDisposable SlideX(Visual visual, TimeSpan duration, Easing? easing, params double[] offsets)
    {
        ArgumentNullException.ThrowIfNull(offsets);
        if (FrameDriver.IsInstant || offsets.Length < 2 || ElementComposition.GetElementVisual(visual) is not { } composition)
        {
            return Stopped.Instance;
        }

        var animation = composition.Compositor.CreateVector3KeyFrameAnimation();
        for (var index = 0; index < offsets.Length; index++)
        {
            animation.InsertKeyFrame((float)index / (offsets.Length - 1), new Vector3((float)offsets[index], 0, 0), easing ?? _linear);
        }

        return Start(composition, "Translation", animation, duration);
    }

    /// <summary>Turns <paramref name="visual"/> around its middle, once per <paramref name="period"/>.</summary>
    public static IDisposable Spin(Visual visual, TimeSpan period)
    {
        if (FrameDriver.IsInstant || ElementComposition.GetElementVisual(visual) is not { } composition)
        {
            return Stopped.Instance;
        }

        Centre(visual, composition);
        var animation = composition.Compositor.CreateScalarKeyFrameAnimation();
        animation.InsertKeyFrame(0, 0, _linear);
        animation.InsertKeyFrame(1, MathF.Tau, _linear);
        return Start(composition, "RotationAngle", animation, period);
    }

    /// <summary>
    /// Scales <paramref name="visual"/> around its middle and fades it through the given key values,
    /// at even steps of time, then starts again.
    /// </summary>
    public static IDisposable Pulse(Visual visual, TimeSpan duration, Easing? easing, double[] scales, double[] opacities, TimeSpan delay = default)
    {
        ArgumentNullException.ThrowIfNull(scales);
        ArgumentNullException.ThrowIfNull(opacities);
        if (FrameDriver.IsInstant || ElementComposition.GetElementVisual(visual) is not { } composition)
        {
            return Stopped.Instance;
        }

        Centre(visual, composition);
        var compositor = composition.Compositor;
        var handles = new List<IDisposable>(2);
        if (scales.Length >= 2)
        {
            var scale = compositor.CreateVector3KeyFrameAnimation();
            for (var index = 0; index < scales.Length; index++)
            {
                var value = (float)scales[index];
                scale.InsertKeyFrame((float)index / (scales.Length - 1), new Vector3(value, value, 1), easing ?? _linear);
            }

            scale.DelayTime = delay;
            handles.Add(Start(composition, "Scale", scale, duration));
        }

        if (opacities.Length >= 2)
        {
            var opacity = compositor.CreateScalarKeyFrameAnimation();
            for (var index = 0; index < opacities.Length; index++)
            {
                opacity.InsertKeyFrame((float)index / (opacities.Length - 1), (float)opacities[index], easing ?? _linear);
            }

            opacity.DelayTime = delay;
            handles.Add(Start(composition, "Opacity", opacity, duration));
        }

        return new Several(handles);
    }

    /// <summary>
    /// Moves <paramref name="visual"/> up and down through the given vertical offsets, at even steps
    /// of time, then starts again.
    /// </summary>
    public static IDisposable BobY(Visual visual, TimeSpan duration, Easing? easing, TimeSpan delay, params double[] offsets)
    {
        ArgumentNullException.ThrowIfNull(offsets);
        if (FrameDriver.IsInstant || offsets.Length < 2 || ElementComposition.GetElementVisual(visual) is not { } composition)
        {
            return Stopped.Instance;
        }

        var animation = composition.Compositor.CreateVector3KeyFrameAnimation();
        for (var index = 0; index < offsets.Length; index++)
        {
            animation.InsertKeyFrame((float)index / (offsets.Length - 1), new Vector3(0, (float)offsets[index], 0), easing ?? _linear);
        }

        animation.DelayTime = delay;
        return Start(composition, "Translation", animation, duration);
    }

    private static void Centre(Visual visual, CompositionVisual composition) =>
        composition.CenterPoint = new Vector3D(visual.Bounds.Width / 2, visual.Bounds.Height / 2, 0);

    private static Running Start(CompositionVisual composition, string property, KeyFrameAnimation animation, TimeSpan duration)
    {
        animation.Duration = duration;
        animation.IterationBehavior = AnimationIterationBehavior.Forever;
        composition.StartAnimation(property, animation);
        return new Running(composition, property);
    }

    private sealed class Running(CompositionVisual composition, string property) : IDisposable
    {
        public void Dispose()
        {
            if (composition.IsDisposed)
            {
                return;
            }

            composition.StopAnimation(property);
            // Stopping leaves the value where the animation was; put the control back as it is drawn.
            switch (property)
            {
                case "Translation":
                    composition.Translation = default;
                    break;
                case "RotationAngle":
                    composition.RotationAngle = 0;
                    break;
                case "Scale":
                    composition.Scale = new Vector3D(1, 1, 1);
                    break;
                case "Opacity":
                    composition.Opacity = 1;
                    break;
            }
        }
    }

    private sealed class Several(List<IDisposable> handles) : IDisposable
    {
        public void Dispose()
        {
            foreach (var handle in handles)
            {
                handle.Dispose();
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
