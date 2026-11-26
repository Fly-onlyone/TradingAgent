using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;
using TradingAgent.App.Theme;

namespace TradingAgent.App.Controls;

/// <summary>
/// Where a price stands between the low and the high of the day: a bar that runs from the colour of
/// a fall to the colour of a rise, with a round mark on it.
/// </summary>
/// <remarks>As in the previous UI, a spring moves the mark to a new place (stiffness 260, damping 22).</remarks>
public sealed class RangeBar : Control
{
    /// <summary>The place of the mark, from 0 (the low) to 100 (the high).</summary>
    public static readonly StyledProperty<double> ValueProperty =
        AvaloniaProperty.Register<RangeBar, double>(nameof(Value), 50);

    public static readonly StyledProperty<Color> LowColorProperty =
        AvaloniaProperty.Register<RangeBar, Color>(nameof(LowColor), Colors.Red);

    public static readonly StyledProperty<Color> MiddleColorProperty =
        AvaloniaProperty.Register<RangeBar, Color>(nameof(MiddleColor), Colors.Gray);

    public static readonly StyledProperty<Color> HighColorProperty =
        AvaloniaProperty.Register<RangeBar, Color>(nameof(HighColor), Colors.Green);

    /// <summary>The colour of the ring of the mark: that of the day's change.</summary>
    public static readonly StyledProperty<Color> MarkColorProperty =
        AvaloniaProperty.Register<RangeBar, Color>(nameof(MarkColor), Colors.Green);

    /// <summary>The colour inside the mark: that of the surface the bar lies on.</summary>
    public static readonly StyledProperty<Color> MarkFillProperty =
        AvaloniaProperty.Register<RangeBar, Color>(nameof(MarkFill), Colors.Black);

    private const double BarHeight = 6;
    private const double MarkSize = 14;

    private static readonly Spring _spring = new(260, 22);

    private double _shown = 50;
    private double _velocity;
    private IDisposable? _moving;

    static RangeBar()
    {
        AffectsRender<RangeBar>(LowColorProperty, MiddleColorProperty, HighColorProperty, MarkColorProperty, MarkFillProperty);
        HeightProperty.OverrideDefaultValue<RangeBar>(MarkSize);
        ValueProperty.Changed.AddClassHandler<RangeBar>((bar, _) => bar.Move());
    }

    public double Value
    {
        get => GetValue(ValueProperty);
        set => SetValue(ValueProperty, value);
    }

    public Color LowColor
    {
        get => GetValue(LowColorProperty);
        set => SetValue(LowColorProperty, value);
    }

    public Color MiddleColor
    {
        get => GetValue(MiddleColorProperty);
        set => SetValue(MiddleColorProperty, value);
    }

    public Color HighColor
    {
        get => GetValue(HighColorProperty);
        set => SetValue(HighColorProperty, value);
    }

    public Color MarkColor
    {
        get => GetValue(MarkColorProperty);
        set => SetValue(MarkColorProperty, value);
    }

    public Color MarkFill
    {
        get => GetValue(MarkFillProperty);
        set => SetValue(MarkFillProperty, value);
    }

    public override void Render(DrawingContext context)
    {
        var width = Bounds.Width;
        var middle = Bounds.Height / 2;
        if (width <= 0)
        {
            return;
        }

        var bar = new ImmutableLinearGradientBrush(
            [
                new ImmutableGradientStop(0, LowColor),
                new ImmutableGradientStop(0.5, ThemeBuilder.Alpha(MiddleColor, 0.25)),
                new ImmutableGradientStop(1, HighColor),
            ],
            startPoint: new RelativePoint(0, 0.5, RelativeUnit.Relative),
            endPoint: new RelativePoint(1, 0.5, RelativeUnit.Relative));
        context.DrawRectangle(bar, null, new Rect(0, middle - (BarHeight / 2), width, BarHeight), BarHeight / 2, BarHeight / 2);

        var centre = new Point(Math.Clamp(_shown, 0, 100) / 100 * width, middle);
        // A dark ring around the mark, so it stands off the bar.
        context.DrawEllipse(new ImmutableSolidColorBrush(Colors.Black, 0.35), null, centre, (MarkSize / 2) + 2, (MarkSize / 2) + 2);
        context.DrawEllipse(new ImmutableSolidColorBrush(MarkFill), new ImmutablePen(new ImmutableSolidColorBrush(MarkColor), 2), centre, (MarkSize / 2) - 1, (MarkSize / 2) - 1);
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        _shown = Value;
        _velocity = 0;
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _moving?.Dispose();
        _moving = null;
    }

    private void Move()
    {
        _moving?.Dispose();
        _moving = null;
        var to = Value;
        if (!this.IsAttachedToVisualTree())
        {
            _shown = to;
            return;
        }

        var from = _shown;
        var speed = _velocity;
        _moving = FrameDriver.Run(this, seconds =>
        {
            (_shown, _velocity) = _spring.At(seconds, from, to, speed);
            var resting = Spring.IsAtRest(_shown, _velocity, to, to - from);
            if (resting)
            {
                _shown = to;
                _velocity = 0;
            }

            InvalidateVisual();
            return !resting;
        });
    }
}
