using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>
/// A small line of how a figure went, with a dot on its last value: green when the line ends above
/// where it began, red otherwise.
/// </summary>
/// <remarks>
/// As in the previous UI: the line is drawn in over 1.2 s when it first shows, and the dot breathes
/// every 2 s. The line fills the size the control is given.
/// </remarks>
public sealed class Sparkline : Control
{
    public static readonly StyledProperty<IReadOnlyList<double>?> DataProperty =
        AvaloniaProperty.Register<Sparkline, IReadOnlyList<double>?>(nameof(Data));

    public static readonly StyledProperty<Color> StrokeProperty =
        AvaloniaProperty.Register<Sparkline, Color>(nameof(Stroke), Colors.Orange);

    /// <summary>The colour under the line at its top; it fades to nothing at the bottom.</summary>
    public static readonly StyledProperty<Color> FillProperty =
        AvaloniaProperty.Register<Sparkline, Color>(nameof(Fill));

    public static readonly StyledProperty<Color> RisingProperty =
        AvaloniaProperty.Register<Sparkline, Color>(nameof(Rising), Colors.Green);

    public static readonly StyledProperty<Color> FallingProperty =
        AvaloniaProperty.Register<Sparkline, Color>(nameof(Falling), Colors.Red);

    private const double Inset = 2;

    private static readonly Easing _easeOut = new SplineEasing(0, 0, 0.58, 1);
    private static readonly Easing _easeInOut = new SplineEasing(0.42, 0, 0.58, 1);
    private static readonly double[] _radii = [3, 4.5, 3];
    private static readonly double[] _opacities = [1, 0.7, 1];
    private static readonly TimeSpan _breath = TimeSpan.FromSeconds(2);

    private double _drawn = 1;
    private double _radius = 3;
    private double _dotOpacity = 1;
    private bool _hasDrawnIn;
    private IDisposable? _drawing;
    private IDisposable? _breathing;
    private IDisposable? _visibility;

    static Sparkline()
    {
        AffectsRender<Sparkline>(DataProperty, StrokeProperty, FillProperty, RisingProperty, FallingProperty);
        DataProperty.Changed.AddClassHandler<Sparkline>((line, _) => line.DrawInOnce());
    }

    public IReadOnlyList<double>? Data
    {
        get => GetValue(DataProperty);
        set => SetValue(DataProperty, value);
    }

    public Color Stroke
    {
        get => GetValue(StrokeProperty);
        set => SetValue(StrokeProperty, value);
    }

    public Color Fill
    {
        get => GetValue(FillProperty);
        set => SetValue(FillProperty, value);
    }

    public Color Rising
    {
        get => GetValue(RisingProperty);
        set => SetValue(RisingProperty, value);
    }

    public Color Falling
    {
        get => GetValue(FallingProperty);
        set => SetValue(FallingProperty, value);
    }

    public override void Render(DrawingContext context)
    {
        var data = Data;
        var width = Bounds.Width;
        var height = Bounds.Height;
        if (data is not { Count: >= 2 } || width <= Inset * 2 || height <= Inset * 2)
        {
            return;
        }

        var min = double.MaxValue;
        var max = double.MinValue;
        foreach (var value in data)
        {
            min = Math.Min(min, value);
            max = Math.Max(max, value);
        }

        var range = max - min;
        if (range <= 0)
        {
            range = 1;
        }

        var points = new Point[data.Count];
        for (var index = 0; index < data.Count; index++)
        {
            points[index] = new Point(
                Inset + ((double)index / (data.Count - 1) * (width - (Inset * 2))),
                Inset + ((1 - ((data[index] - min) / range)) * (height - (Inset * 2))));
        }

        var fill = new StreamGeometry();
        using (var path = fill.Open())
        {
            path.BeginFigure(points[0], isFilled: true);
            for (var index = 1; index < points.Length; index++)
            {
                path.LineTo(points[index]);
            }

            path.LineTo(new Point(points[^1].X, height));
            path.LineTo(new Point(points[0].X, height));
            path.EndFigure(isClosed: true);
        }

        var top = Fill;
        var under = new ImmutableLinearGradientBrush(
            [new ImmutableGradientStop(0, top), new ImmutableGradientStop(1, Color.FromArgb(0, top.R, top.G, top.B))],
            opacity: 0.6,
            startPoint: new RelativePoint(0, 0, RelativeUnit.Relative),
            endPoint: new RelativePoint(0, 1, RelativeUnit.Relative));
        context.DrawGeometry(under, null, fill);

        // The part of the line that is drawn so far, by length.
        var total = 0.0;
        for (var index = 1; index < points.Length; index++)
        {
            total += Distance(points[index - 1], points[index]);
        }

        var left = total * Math.Clamp(_drawn, 0, 1);
        var line = new StreamGeometry();
        using (var path = line.Open())
        {
            path.BeginFigure(points[0], isFilled: false);
            for (var index = 1; index < points.Length && left > 0; index++)
            {
                var length = Distance(points[index - 1], points[index]);
                if (length <= left)
                {
                    path.LineTo(points[index]);
                }
                else
                {
                    var part = left / length;
                    path.LineTo(points[index - 1] + ((points[index] - points[index - 1]) * part));
                }

                left -= length;
            }

            path.EndFigure(isClosed: false);
        }

        context.DrawGeometry(null, new ImmutablePen(new ImmutableSolidColorBrush(Stroke), 1.5, lineCap: PenLineCap.Round, lineJoin: PenLineJoin.Round), line);

        var dot = data[^1] >= data[0] ? Rising : Falling;
        context.DrawEllipse(new ImmutableSolidColorBrush(dot, _dotOpacity), null, points[^1], _radius, _radius);
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        _visibility = VisibilityWatch.Subscribe(this, Breathe);
        DrawInOnce();
        Breathe();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _visibility?.Dispose();
        _visibility = null;
        _drawing?.Dispose();
        _drawing = null;
        _breathing?.Dispose();
        _breathing = null;
        _hasDrawnIn = false;
    }

    private static double Distance(Point from, Point to) => Math.Sqrt(((to.X - from.X) * (to.X - from.X)) + ((to.Y - from.Y) * (to.Y - from.Y)));

    /// <summary>Draws the line in, the first time there is one to draw; new figures after that just replace it.</summary>
    private void DrawInOnce()
    {
        if (_hasDrawnIn || Data is not { Count: >= 2 } || !this.IsAttachedToVisualTree())
        {
            return;
        }

        _hasDrawnIn = true;
        _drawing?.Dispose();
        _drawing = FrameDriver.Run(this, seconds =>
        {
            _drawn = seconds >= 1.2 ? 1 : _easeOut.Ease(seconds / 1.2);
            InvalidateVisual();
            return seconds < 1.2;
        });
    }

    private void Breathe()
    {
        _breathing?.Dispose();
        _breathing = null;
        _radius = 3;
        _dotOpacity = 1;
        if (this.IsAttachedToVisualTree() && IsEffectivelyVisible)
        {
            _breathing = Endless.Every(seconds =>
            {
                _radius = Endless.Along(_radii, seconds, _breath, _easeInOut);
                _dotOpacity = Endless.Along(_opacities, seconds, _breath, _easeInOut);
                InvalidateVisual();
            });
        }
    }
}
