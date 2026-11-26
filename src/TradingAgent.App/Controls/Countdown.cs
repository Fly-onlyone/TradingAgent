using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>
/// A thin bar that runs out from the right at an even pace: how long a message in the corner of the
/// window still stays.
/// </summary>
/// <remarks>It starts when it is shown. With animations off it is not drawn at all.</remarks>
public sealed class Countdown : Control
{
    public static readonly StyledProperty<double> SecondsProperty =
        AvaloniaProperty.Register<Countdown, double>(nameof(Seconds), 5);

    public static readonly StyledProperty<IBrush?> FillProperty =
        AvaloniaProperty.Register<Countdown, IBrush?>(nameof(Fill));

    private double _left = 1;
    private IDisposable? _running;

    static Countdown()
    {
        AffectsRender<Countdown>(FillProperty);
        HeightProperty.OverrideDefaultValue<Countdown>(2);
        IsHitTestVisibleProperty.OverrideDefaultValue<Countdown>(false);
    }

    public double Seconds
    {
        get => GetValue(SecondsProperty);
        set => SetValue(SecondsProperty, value);
    }

    public IBrush? Fill
    {
        get => GetValue(FillProperty);
        set => SetValue(FillProperty, value);
    }

    public override void Render(DrawingContext context)
    {
        if (Fill is { } fill && _left > 0)
        {
            context.DrawRectangle(fill, null, new Rect(0, 0, Bounds.Width * _left, Bounds.Height));
        }
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        var seconds = Math.Max(0.01, Seconds);
        _left = 1;
        _running = FrameDriver.Run(this, passed =>
        {
            _left = Math.Max(0, 1 - (passed / seconds));
            InvalidateVisual();
            return _left > 0;
        });
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _running?.Dispose();
        _running = null;
    }
}
