using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>
/// The Material linear progress: a bar that fills to a share from 0 to 100, or, when the share is
/// not known, two bars running across the track.
/// </summary>
/// <remarks>
/// The two running bars follow the key frames of the component library of the previous UI: one
/// round takes 2.1 s, the second bar starts 1.15 s after the first, each on its own curve. A view
/// that wants the fill to glide sets a transition on <see cref="Value"/>.
/// </remarks>
public sealed class LinearProgress : Control
{
    public static readonly StyledProperty<IBrush?> ForegroundProperty =
        AvaloniaProperty.Register<LinearProgress, IBrush?>(nameof(Foreground));

    public static readonly StyledProperty<IBrush?> TrackProperty =
        AvaloniaProperty.Register<LinearProgress, IBrush?>(nameof(Track));

    public static readonly StyledProperty<CornerRadius> CornerRadiusProperty =
        Border.CornerRadiusProperty.AddOwner<LinearProgress>();

    public static readonly StyledProperty<double> ValueProperty =
        AvaloniaProperty.Register<LinearProgress, double>(nameof(Value));

    public static readonly StyledProperty<bool> IsIndeterminateProperty =
        AvaloniaProperty.Register<LinearProgress, bool>(nameof(IsIndeterminate));

    private const double Period = 2.1;
    private const double SecondDelay = 1.15;

    private static readonly Easing _first = new SplineEasing(0.65, 0.815, 0.735, 0.395);
    private static readonly Easing _second = new SplineEasing(0.165, 0.84, 0.44, 1);

    private IDisposable? _frames;
    private double _seconds;

    static LinearProgress()
    {
        HeightProperty.OverrideDefaultValue<LinearProgress>(4);
        AffectsRender<LinearProgress>(ForegroundProperty, TrackProperty, CornerRadiusProperty, ValueProperty, IsIndeterminateProperty);
        IsIndeterminateProperty.Changed.AddClassHandler<LinearProgress>((bar, _) => bar.Restart());
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

    public CornerRadius CornerRadius
    {
        get => GetValue(CornerRadiusProperty);
        set => SetValue(CornerRadiusProperty, value);
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
        var bounds = new Rect(Bounds.Size);
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        using var clip = context.PushClip(new RoundedRect(bounds, CornerRadius));
        if (Track is { } track)
        {
            context.FillRectangle(track, bounds);
        }

        if (Foreground is not { } fill)
        {
            return;
        }

        if (!IsIndeterminate)
        {
            context.FillRectangle(fill, bounds.WithWidth(bounds.Width * Math.Clamp(Value, 0, 100) / 100));
            return;
        }

        // Left and right edges as shares of the track: both bars start off the left side and leave on
        // the right, reaching their end position at 60 % of the round.
        DrawRunner(context, fill, bounds, _first, _seconds, -0.35, 1.0, 1.0, -0.90);
        if (_seconds >= SecondDelay)
        {
            DrawRunner(context, fill, bounds, _second, _seconds - SecondDelay, -2.0, 1.07, 1.0, -0.08);
        }
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

    private static void DrawRunner(DrawingContext context, IBrush fill, Rect bounds, Easing easing, double seconds, double leftFrom, double leftTo, double rightFrom, double rightTo)
    {
        var phase = seconds % Period / Period;
        var eased = phase >= 0.6 ? 1 : easing.Ease(phase / 0.6);
        var left = (leftFrom + ((leftTo - leftFrom) * eased)) * bounds.Width;
        var right = bounds.Width - ((rightFrom + ((rightTo - rightFrom) * eased)) * bounds.Width);
        if (right > left)
        {
            context.FillRectangle(fill, new Rect(left, 0, right - left, bounds.Height));
        }
    }

    private void Restart()
    {
        _frames?.Dispose();
        _frames = null;
        if (!IsIndeterminate || !this.IsAttachedToVisualTree())
        {
            InvalidateVisual();
            return;
        }

        _frames = FrameDriver.Run(this, seconds =>
        {
            if (double.IsPositiveInfinity(seconds))
            {
                // Animations are off: a still bar in the middle of its run.
                _seconds = Period * 0.3;
                InvalidateVisual();
                return false;
            }

            _seconds = seconds;
            InvalidateVisual();
            return true;
        });
    }
}
