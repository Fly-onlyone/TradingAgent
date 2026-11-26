using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using TradingAgent.App.Theme;

namespace TradingAgent.App.Controls;

/// <summary>One value of a chart, at a moment (Unix milliseconds).</summary>
public sealed record ChartPoint(long Time, double Value);

public enum SeriesKind
{
    /// <summary>A line with the area under it filled: a running total.</summary>
    Area,

    /// <summary>One bar per value, up from zero in green or down in red: what each trade came to.</summary>
    Bars,
}

/// <summary>
/// A chart of values over time with a price scale on the right and dates along the bottom: the
/// equity curve of the Dashboard and the profit and loss of each trade on the Trades page.
/// </summary>
/// <remarks>
/// It looks like the charts of the previous UI, which a charting library drew: values are spaced
/// evenly, one step per value and not by the time between them, the grid is faint, and the last
/// value of a line is written on the scale. It cannot be scrolled or zoomed and has no crosshair:
/// the app shows a few hundred closed trades at most.
/// </remarks>
public sealed class SeriesChart : Control
{
    public static readonly StyledProperty<IReadOnlyList<ChartPoint>?> PointsProperty =
        AvaloniaProperty.Register<SeriesChart, IReadOnlyList<ChartPoint>?>(nameof(Points));

    public static readonly StyledProperty<SeriesKind> KindProperty =
        AvaloniaProperty.Register<SeriesChart, SeriesKind>(nameof(Kind));

    private const double ScaleWidth = 68;
    private const double DatesHeight = 26;
    private const double FontSize = 12;

    private Color _rising = Colors.Green;
    private Color _falling = Colors.Red;
    private Color _text = Colors.Gray;
    private FontFamily _font = FontFamily.Default;

    static SeriesChart()
    {
        AffectsRender<SeriesChart>(PointsProperty, KindProperty);
        ClipToBoundsProperty.OverrideDefaultValue<SeriesChart>(true);
    }

    public IReadOnlyList<ChartPoint>? Points
    {
        get => GetValue(PointsProperty);
        set => SetValue(PointsProperty, value);
    }

    public SeriesKind Kind
    {
        get => GetValue(KindProperty);
        set => SetValue(KindProperty, value);
    }

    /// <summary>Round values for the lines of a scale from <paramref name="min"/> to <paramref name="max"/>, about <paramref name="wanted"/> of them.</summary>
    public static IReadOnlyList<double> Ticks(double min, double max, int wanted)
    {
        if (!(max > min) || wanted < 1)
        {
            return [min];
        }

        var rough = (max - min) / wanted;
        var magnitude = Math.Pow(10, Math.Floor(Math.Log10(rough)));
        var part = rough / magnitude;
        var step = magnitude * (part <= 1 ? 1 : part <= 2 ? 2 : part <= 2.5 ? 2.5 : part <= 5 ? 5 : 10);
        var ticks = new List<double>();
        for (var tick = Math.Ceiling(min / step) * step; tick <= max + (step * 1e-9); tick += step)
        {
            // Sums of a step such as 0.1 drift; a scale shows the round value.
            ticks.Add(Math.Round(tick / step) * step);
        }

        return ticks;
    }

    public override void Render(DrawingContext context)
    {
        var points = Points;
        var plot = new Rect(0, 0, Bounds.Width - ScaleWidth, Bounds.Height - DatesHeight);
        if (points is not { Count: > 0 } || plot.Width <= 0 || plot.Height <= 0)
        {
            return;
        }

        var bars = Kind == SeriesKind.Bars;
        var min = bars ? 0 : double.MaxValue;
        var max = bars ? 0 : double.MinValue;
        foreach (var point in points)
        {
            min = Math.Min(min, point.Value);
            max = Math.Max(max, point.Value);
        }

        if (max - min <= 0)
        {
            // One value, or all the same: a band around it, so the line is not on an edge.
            var half = Math.Max(Math.Abs(max) * 0.1, 1);
            min -= half;
            max += half;
        }

        // The margins of the scale the library left: a fifth above, a tenth below.
        var span = max - min;
        var top = max + (span * 0.2);
        var bottom = min - (span * 0.1);
        double Y(double value) => plot.Top + ((top - value) / (top - bottom) * plot.Height);
        var step = plot.Width / points.Count;
        double X(int index) => plot.Left + ((index + 0.5) * step);

        var grid = new ImmutablePen(new ImmutableSolidColorBrush(Colors.White, 0.06));
        var edge = new ImmutablePen(new ImmutableSolidColorBrush(Colors.White, 0.1));
        var label = new ImmutableSolidColorBrush(_text);
        var typeface = new Typeface(_font);

        foreach (var tick in Ticks(bottom, top, Math.Max(3, (int)(plot.Height / 36))))
        {
            var y = Math.Round(Y(tick)) + 0.5;
            context.DrawLine(grid, new Point(plot.Left, y), new Point(plot.Right, y));
            var text = new FormattedText(Amount(tick), CultureInfo.CurrentCulture, FlowDirection.LeftToRight, typeface, FontSize, label);
            if (y - (text.Height / 2) >= plot.Top && y + (text.Height / 2) <= plot.Bottom)
            {
                context.DrawText(text, new Point(plot.Right + 8, y - (text.Height / 2)));
            }
        }

        // A date under every so many values, far enough apart to be read.
        var every = Math.Max(1, (int)Math.Ceiling(96 / step));
        for (var index = every / 2; index < points.Count; index += every)
        {
            var x = Math.Round(X(index)) + 0.5;
            context.DrawLine(grid, new Point(x, plot.Top), new Point(x, plot.Bottom));
            var date = DateTimeOffset.FromUnixTimeMilliseconds(points[index].Time).ToLocalTime().ToString("d MMM", CultureInfo.CurrentCulture);
            var text = new FormattedText(date, CultureInfo.CurrentCulture, FlowDirection.LeftToRight, typeface, FontSize, label);
            var left = Math.Clamp(x - (text.Width / 2), plot.Left, Math.Max(plot.Left, plot.Right - text.Width));
            context.DrawText(text, new Point(left, plot.Bottom + ((DatesHeight - text.Height) / 2)));
        }

        context.DrawLine(edge, new Point(plot.Right + 0.5, plot.Top), new Point(plot.Right + 0.5, plot.Bottom));
        context.DrawLine(edge, new Point(plot.Left, plot.Bottom + 0.5), new Point(Bounds.Width, plot.Bottom + 0.5));

        using (context.PushClip(plot))
        {
            if (bars)
            {
                DrawBars(context, points, X, Y, step);
            }
            else
            {
                DrawArea(context, points, X, Y, plot);
            }
        }

        if (!bars)
        {
            // The last value, written on the scale in a tag of the line's colour.
            var last = points[^1].Value;
            var text = new FormattedText(Amount(last), CultureInfo.CurrentCulture, FlowDirection.LeftToRight, typeface, FontSize, Brushes.White);
            var y = Math.Clamp(Y(last), plot.Top + (text.Height / 2) + 2, plot.Bottom - (text.Height / 2) - 2);
            var tag = new Rect(plot.Right + 1, y - (text.Height / 2) - 2, ScaleWidth - 1, text.Height + 4);
            context.DrawRectangle(new ImmutableSolidColorBrush(_rising), null, tag, 2, 2);
            context.DrawText(text, new Point(plot.Right + 8, y - (text.Height / 2)));
        }
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        ResourcesChanged += OnResourcesChanged;
        ReadTheme();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        ResourcesChanged -= OnResourcesChanged;
    }

    // Nothing is written as "-0.00": a value that rounds to zero has no sign.
    private static string Amount(double value) => (Math.Abs(value) < 0.005 ? 0 : value).ToString("#,0.00", CultureInfo.CurrentCulture);

    private void DrawArea(DrawingContext context, IReadOnlyList<ChartPoint> points, Func<int, double> x, Func<double, double> y, Rect plot)
    {
        var first = new Point(x(0), y(points[0].Value));
        if (points.Count == 1)
        {
            context.DrawEllipse(new ImmutableSolidColorBrush(_rising), null, first, 3, 3);
            return;
        }

        var line = new StreamGeometry();
        var area = new StreamGeometry();
        using (var path = line.Open())
        using (var under = area.Open())
        {
            path.BeginFigure(first, isFilled: false);
            under.BeginFigure(new Point(first.X, plot.Bottom), isFilled: true);
            under.LineTo(first);
            for (var index = 1; index < points.Count; index++)
            {
                var point = new Point(x(index), y(points[index].Value));
                path.LineTo(point);
                under.LineTo(point);
            }

            under.LineTo(new Point(x(points.Count - 1), plot.Bottom));
            under.EndFigure(isClosed: true);
            path.EndFigure(isClosed: false);
        }

        // A quarter of the colour at the top of the chart, almost none at the bottom.
        var fill = new ImmutableLinearGradientBrush(
            [new ImmutableGradientStop(0, ThemeBuilder.Alpha(_rising, 0.25)), new ImmutableGradientStop(1, ThemeBuilder.Alpha(_rising, 0.02))],
            startPoint: new RelativePoint(0, plot.Top, RelativeUnit.Absolute),
            endPoint: new RelativePoint(0, plot.Bottom, RelativeUnit.Absolute));
        context.DrawGeometry(fill, null, area);
        context.DrawGeometry(null, new ImmutablePen(new ImmutableSolidColorBrush(_rising), 2, lineJoin: PenLineJoin.Round), line);
    }

    private void DrawBars(DrawingContext context, IReadOnlyList<ChartPoint> points, Func<int, double> x, Func<double, double> y, double step)
    {
        var zero = y(0);
        var width = Math.Clamp(Math.Floor(step * 0.8), 1, 48);
        var rising = new ImmutableSolidColorBrush(_rising);
        var falling = new ImmutableSolidColorBrush(_falling);
        for (var index = 0; index < points.Count; index++)
        {
            var value = points[index].Value;
            var end = y(value);
            var left = Math.Round(x(index) - (width / 2));
            context.DrawRectangle(value >= 0 ? rising : falling, null, new Rect(left, Math.Min(zero, end), width, Math.Max(1, Math.Abs(end - zero))));
        }
    }

    private void OnResourcesChanged(object? sender, ResourcesChangedEventArgs e)
    {
        ReadTheme();
        InvalidateVisual();
    }

    private void ReadTheme()
    {
        Color Find(string key, Color fallback) => this.TryFindResource(key, out var found) && found is Color color ? color : fallback;

        _rising = Find("SuccessColor", Colors.Green);
        _falling = Find("ErrorColor", Colors.Red);
        _text = Find("TextSecondaryColor", Colors.Gray);
        _font = this.TryFindResource("FontSans", out var font) && font is FontFamily family ? family : FontFamily.Default;
    }
}
