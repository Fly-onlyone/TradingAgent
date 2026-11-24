using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>How the gradient of a <see cref="GradientFlow"/> moves.</summary>
public enum GradientMotion
{
    /// <summary>Still: the first half of the gradient shows.</summary>
    None,

    /// <summary>Drifts to the second half and back, easing at both ends: the line on a card under the pointer, a divider.</summary>
    Flow,

    /// <summary>Runs to the left without end at an even speed: the line under the header.</summary>
    Slide,
}

/// <summary>
/// The accent gradient of the theme as a line or a bar, standing still or moving.
/// </summary>
/// <remarks>
/// The previous UI drew the gradient twice as wide as its box and moved it by changing the
/// background position. Here a strip wider than the box carries the gradient and is moved by the
/// compositor, which gives the same picture without redrawing anything.
/// </remarks>
public sealed class GradientFlow : Border
{
    public static readonly StyledProperty<IReadOnlyList<ImmutableGradientStop>?> StopsProperty =
        AvaloniaProperty.Register<GradientFlow, IReadOnlyList<ImmutableGradientStop>?>(nameof(Stops));

    public static readonly StyledProperty<GradientMotion> MotionProperty =
        AvaloniaProperty.Register<GradientFlow, GradientMotion>(nameof(Motion));

    /// <summary>Seconds for one round.</summary>
    public static readonly StyledProperty<double> SecondsProperty =
        AvaloniaProperty.Register<GradientFlow, double>(nameof(Seconds), 6);

    private static readonly Easing _ease = new SplineEasing(0.25, 0.1, 0.25, 1);

    private readonly Border _strip = new() { HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left };
    private IDisposable? _running;

    static GradientFlow()
    {
        ClipToBoundsProperty.OverrideDefaultValue<GradientFlow>(true);
        IsHitTestVisibleProperty.OverrideDefaultValue<GradientFlow>(false);
        StopsProperty.Changed.AddClassHandler<GradientFlow>((flow, _) => flow.Paint());
        MotionProperty.Changed.AddClassHandler<GradientFlow>((flow, _) =>
        {
            flow.Paint();
            flow.Restart();
        });
        SecondsProperty.Changed.AddClassHandler<GradientFlow>((flow, _) => flow.Restart());
    }

    public GradientFlow()
    {
        Child = _strip;
    }

    public IReadOnlyList<ImmutableGradientStop>? Stops
    {
        get => GetValue(StopsProperty);
        set => SetValue(StopsProperty, value);
    }

    public GradientMotion Motion
    {
        get => GetValue(MotionProperty);
        set => SetValue(MotionProperty, value);
    }

    public double Seconds
    {
        get => GetValue(SecondsProperty);
        set => SetValue(SecondsProperty, value);
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Restart();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _running?.Dispose();
        _running = null;
    }

    protected override void OnSizeChanged(SizeChangedEventArgs e)
    {
        base.OnSizeChanged(e);
        Paint();
        Restart();
    }

    private void Paint()
    {
        // Sliding needs one more tile than flowing, so the strip never runs out.
        var tiles = Motion == GradientMotion.Slide ? 2 : 1;
        _strip.Width = Bounds.Width * 2 * tiles;
        _strip.Background = Stops is { Count: > 0 } stops
            ? new ImmutableLinearGradientBrush(
                stops,
                spreadMethod: GradientSpreadMethod.Repeat,
                startPoint: new RelativePoint(0, 0.5, RelativeUnit.Relative),
                endPoint: new RelativePoint(1.0 / tiles, 0.5, RelativeUnit.Relative))
            : null;
    }

    private void Restart()
    {
        _running?.Dispose();
        _running = null;
        var width = Bounds.Width;
        if (width <= 0 || !this.IsAttachedToVisualTree())
        {
            return;
        }

        var round = TimeSpan.FromSeconds(Seconds);
        _running = Motion switch
        {
            GradientMotion.Flow => Endless.SlideX(_strip, round, _ease, 0, -width, 0),
            GradientMotion.Slide => Endless.SlideX(_strip, round, null, 0, -2 * width),
            _ => null,
        };
    }
}
