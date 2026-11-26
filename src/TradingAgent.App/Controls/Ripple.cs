using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>
/// The ink ripple of a Material button: a circle that grows from where the pointer went down and
/// fades when it comes up. Placed in a control's template, over its background.
/// </summary>
/// <remarks>
/// The numbers are those of the ripple in the previous UI's component library: 550 ms on its standard
/// curve, growing from nothing while its opacity goes from 0.1 to 0.3, then fading for 550 ms from
/// the release. It takes no pointer input itself; it listens to the control it is a part of.
/// </remarks>
public sealed class Ripple : Control
{
    /// <summary>The colour of the ink. A button gives its text colour.</summary>
    public static readonly StyledProperty<IBrush?> FillProperty =
        AvaloniaProperty.Register<Ripple, IBrush?>(nameof(Fill));

    public static readonly StyledProperty<CornerRadius> CornerRadiusProperty =
        Border.CornerRadiusProperty.AddOwner<Ripple>();

    /// <summary>True for a round icon button: the ripple starts in the middle, wherever the pointer is.</summary>
    public static readonly StyledProperty<bool> IsCenteredProperty =
        AvaloniaProperty.Register<Ripple, bool>(nameof(IsCentered));

    private const double Seconds = 0.55;

    private static readonly Easing _curve = new SplineEasing(0.4, 0, 0.2, 1);

    private readonly List<Drop> _drops = [];
    private InputElement? _host;
    private IDisposable? _frames;
    private double _now;

    static Ripple()
    {
        IsHitTestVisibleProperty.OverrideDefaultValue<Ripple>(false);
        AffectsRender<Ripple>(FillProperty, CornerRadiusProperty);
    }

    public IBrush? Fill
    {
        get => GetValue(FillProperty);
        set => SetValue(FillProperty, value);
    }

    public CornerRadius CornerRadius
    {
        get => GetValue(CornerRadiusProperty);
        set => SetValue(CornerRadiusProperty, value);
    }

    public bool IsCentered
    {
        get => GetValue(IsCenteredProperty);
        set => SetValue(IsCenteredProperty, value);
    }

    public override void Render(DrawingContext context)
    {
        if (_drops.Count == 0 || Fill is not { } fill)
        {
            return;
        }

        using var clip = context.PushClip(new RoundedRect(new Rect(Bounds.Size), CornerRadius));
        foreach (var drop in _drops)
        {
            var grown = _curve.Ease(Math.Clamp((_now - drop.Start) / Seconds, 0, 1));
            var opacity = 0.1 + (0.2 * grown);
            if (drop.Released is { } released)
            {
                opacity *= 1 - _curve.Ease(Math.Clamp((_now - released) / Seconds, 0, 1));
            }

            using var faded = context.PushOpacity(opacity);
            var radius = drop.Diameter / 2 * grown;
            context.DrawEllipse(fill, null, drop.Centre, radius, radius);
        }
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        _host = TemplatedParent as InputElement ?? Parent as InputElement;
        if (_host is not null)
        {
            // Handled presses too: a button marks the press as handled before this would see it.
            _host.AddHandler(PointerPressedEvent, OnHostPressed, RoutingStrategies.Bubble, handledEventsToo: true);
            _host.AddHandler(PointerReleasedEvent, OnHostReleased, RoutingStrategies.Bubble, handledEventsToo: true);
            _host.AddHandler(PointerCaptureLostEvent, OnHostCaptureLost, RoutingStrategies.Bubble, handledEventsToo: true);
        }
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        if (_host is not null)
        {
            _host.RemoveHandler(PointerPressedEvent, OnHostPressed);
            _host.RemoveHandler(PointerReleasedEvent, OnHostReleased);
            _host.RemoveHandler(PointerCaptureLostEvent, OnHostCaptureLost);
            _host = null;
        }

        _frames?.Dispose();
        _frames = null;
        _drops.Clear();
    }

    private void OnHostPressed(object? sender, PointerPressedEventArgs e)
    {
        if (FrameDriver.IsInstant || !e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            return;
        }

        var size = Bounds.Size;
        Point centre;
        double diameter;
        if (IsCentered)
        {
            centre = new Point(size.Width / 2, size.Height / 2);
            diameter = Math.Sqrt(((2 * size.Width * size.Width) + (size.Height * size.Height)) / 3);
        }
        else
        {
            // Wide enough to reach the farthest corner from where the pointer is.
            centre = e.GetPosition(this);
            var width = (Math.Max(Math.Abs(size.Width - centre.X), centre.X) * 2) + 2;
            var height = (Math.Max(Math.Abs(size.Height - centre.Y), centre.Y) * 2) + 2;
            diameter = Math.Sqrt((width * width) + (height * height));
        }

        _drops.Add(new Drop(centre, diameter, _frames is null ? 0 : _now));
        if (_frames is null)
        {
            _now = 0;
            var frames = FrameDriver.Run(this, OnFrame);
            // Outside a window the driver finishes before it returns; nothing is running then.
            _frames = _drops.Count > 0 ? frames : null;
        }
    }

    private void OnHostReleased(object? sender, PointerReleasedEventArgs e) => ReleaseAll();

    private void OnHostCaptureLost(object? sender, PointerCaptureLostEventArgs e) => ReleaseAll();

    private void ReleaseAll()
    {
        for (var index = 0; index < _drops.Count; index++)
        {
            if (_drops[index].Released is null)
            {
                _drops[index] = _drops[index] with { Released = _now };
            }
        }
    }

    private bool OnFrame(double seconds)
    {
        if (double.IsPositiveInfinity(seconds))
        {
            _drops.Clear();
        }
        else
        {
            _now = seconds;
            _drops.RemoveAll(drop => drop.Released is { } released && _now - released >= Seconds);
        }

        InvalidateVisual();
        if (_drops.Count > 0)
        {
            return true;
        }

        _frames = null;
        return false;
    }

    private readonly record struct Drop(Point Centre, double Diameter, double Start, double? Released = null);
}
