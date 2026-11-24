using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>
/// The Material circular progress: a ring that shows a share from 0 to 100, or, when the share is not
/// known, an arc that chases its own tail.
/// </summary>
/// <remarks>
/// Geometry and timing are those of the component library of the previous UI: a ring drawn on a
/// 44-unit grid with a stroke of <see cref="Thickness"/> units; unknown progress turns once in 1.4 s
/// while the arc grows to 100 units and shrinks again. The arc changes shape every frame, so this one
/// is drawn on the UI thread; it is small and shows only while something loads.
/// </remarks>
public sealed class Spinner : Control
{
    public static readonly StyledProperty<IBrush?> ForegroundProperty =
        AvaloniaProperty.Register<Spinner, IBrush?>(nameof(Foreground));

    /// <summary>The ring behind the arc; none by default.</summary>
    public static readonly StyledProperty<IBrush?> TrackProperty =
        AvaloniaProperty.Register<Spinner, IBrush?>(nameof(Track));

    /// <summary>Stroke width on the 44-unit grid. The previous UI used 4.</summary>
    public static readonly StyledProperty<double> ThicknessProperty =
        AvaloniaProperty.Register<Spinner, double>(nameof(Thickness), 4);

    /// <summary>The share shown, 0 to 100, when <see cref="IsIndeterminate"/> is false.</summary>
    public static readonly StyledProperty<double> ValueProperty =
        AvaloniaProperty.Register<Spinner, double>(nameof(Value));

    public static readonly StyledProperty<bool> IsIndeterminateProperty =
        AvaloniaProperty.Register<Spinner, bool>(nameof(IsIndeterminate), true);

    private const double Grid = 44;
    private const double Period = 1.4;

    private static readonly Easing _easeInOut = new SplineEasing(0.42, 0, 0.58, 1);

    private IDisposable? _frames;
    private double _seconds;

    static Spinner()
    {
        WidthProperty.OverrideDefaultValue<Spinner>(40);
        HeightProperty.OverrideDefaultValue<Spinner>(40);
        AffectsRender<Spinner>(ForegroundProperty, TrackProperty, ThicknessProperty, ValueProperty, IsIndeterminateProperty);
        IsIndeterminateProperty.Changed.AddClassHandler<Spinner>((spinner, _) => spinner.Restart());
    }

    public IBrush? Foreground
    {
        get => GetValue(ForegroundProperty);
        set => SetValue(ForegroundProperty, value);
    }

    public IBrush? Track
    {
        get => GetValue(TrackProperty);
        set => SetValue(TrackProperty, value);
    }

    public double Thickness
    {
        get => GetValue(ThicknessProperty);
        set => SetValue(ThicknessProperty, value);
    }

    public double Value
    {
        get => GetValue(ValueProperty);
        set => SetValue(ValueProperty, value);
    }

    public bool IsIndeterminate
    {
        get => GetValue(IsIndeterminateProperty);
        set => SetValue(IsIndeterminateProperty, value);
    }

    public override void Render(DrawingContext context)
    {
        var size = Math.Min(Bounds.Width, Bounds.Height);
        if (size <= 0)
        {
            return;
        }

        var unit = size / Grid;
        var stroke = Thickness * unit;
        var radius = (Grid - Thickness) / 2 * unit;
        var centre = new Point(Bounds.Width / 2, Bounds.Height / 2);
        if (Track is { } track)
        {
            context.DrawEllipse(null, new Pen(track, stroke), centre, radius, radius);
        }

        if (Foreground is not { } brush)
        {
            return;
        }

        var circumference = 2 * Math.PI * (Grid - Thickness) / 2;
        double start;
        double length;
        if (IsIndeterminate)
        {
            // The dash: 1 unit long at offset 0, 100 long at -15 half way, 1 long at -126 at the end.
            var phase = _seconds % Period / Period;
            double dash;
            double offset;
            if (phase < 0.5)
            {
                var eased = _easeInOut.Ease(phase * 2);
                dash = 1 + (99 * eased);
                offset = 15 * eased;
            }
            else
            {
                var eased = _easeInOut.Ease((phase - 0.5) * 2);
                dash = 100 - (99 * eased);
                offset = 15 + (111 * eased);
            }

            // The whole ring turns once per period on top of that; it starts at 3 o'clock.
            start = (offset / circumference * 360) + (phase * 360);
            length = Math.Min(dash, circumference) / circumference * 360;
        }
        else
        {
            // A known share starts at 12 o'clock.
            start = -90;
            length = Math.Clamp(Value, 0, 100) / 100 * 360;
        }

        if (length <= 0)
        {
            return;
        }

        var pen = new Pen(brush, stroke);
        if (length >= 359.99)
        {
            context.DrawEllipse(null, pen, centre, radius, radius);
            return;
        }

        var geometry = new StreamGeometry();
        using (var path = geometry.Open())
        {
            path.BeginFigure(OnRing(centre, radius, start), false);
            path.ArcTo(OnRing(centre, radius, start + length), new Size(radius, radius), 0, length > 180, SweepDirection.Clockwise);
            path.EndFigure(false);
        }

        context.DrawGeometry(null, pen, geometry);
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Restart();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _frames?.Dispose();
        _frames = null;
    }

    private static Point OnRing(Point centre, double radius, double degrees)
    {
        var radians = degrees * Math.PI / 180;
        return new Point(centre.X + (radius * Math.Cos(radians)), centre.Y + (radius * Math.Sin(radians)));
    }

    private void Restart()
    {
        _frames?.Dispose();
        _frames = null;
        if (!IsIndeterminate || !this.IsAttachedToVisualTree())
        {
            return;
        }

        _frames = FrameDriver.Run(this, seconds =>
        {
            if (double.IsPositiveInfinity(seconds))
            {
                // Animations are off: a still arc, a third of the way round.
                _seconds = Period * 0.35;
                InvalidateVisual();
                return false;
            }

            _seconds = seconds;
            InvalidateVisual();
            return true;
        });
    }
}
