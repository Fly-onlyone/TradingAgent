using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>What a <see cref="StatusDot"/> reports.</summary>
public enum DotStatus
{
    Offline,
    Online,
    Away,
    Busy,
    Loading,
}

/// <summary>
/// A small coloured dot for the state of a service. While the service is online or loading, a halo
/// of the same colour swells to 1.8 times the dot and fades, every two seconds.
/// </summary>
/// <remarks>The colour comes from a style on <see cref="Status"/>, so it follows the theme.</remarks>
public sealed class StatusDot : Panel
{
    public static readonly StyledProperty<DotStatus> StatusProperty =
        AvaloniaProperty.Register<StatusDot, DotStatus>(nameof(Status));

    public static readonly StyledProperty<IBrush?> FillProperty =
        AvaloniaProperty.Register<StatusDot, IBrush?>(nameof(Fill));

    private static readonly Easing _easeInOut = new SplineEasing(0.42, 0, 0.58, 1);

    private readonly Border _halo = new() { CornerRadius = new CornerRadius(999), Opacity = 0, IsVisible = false };
    private readonly Border _dot = new() { CornerRadius = new CornerRadius(999) };
    private IDisposable? _pulse;

    static StatusDot()
    {
        WidthProperty.OverrideDefaultValue<StatusDot>(8);
        HeightProperty.OverrideDefaultValue<StatusDot>(8);
        StatusProperty.Changed.AddClassHandler<StatusDot>((dot, _) => dot.Restart());
    }

    public StatusDot()
    {
        _halo[!Border.BackgroundProperty] = this[!FillProperty];
        _dot[!Border.BackgroundProperty] = this[!FillProperty];
        Children.Add(_halo);
        Children.Add(_dot);
    }

    public DotStatus Status
    {
        get => GetValue(StatusProperty);
        set => SetValue(StatusProperty, value);
    }

    public IBrush? Fill
    {
        get => GetValue(FillProperty);
        set => SetValue(FillProperty, value);
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Restart();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _pulse?.Dispose();
        _pulse = null;
    }

    protected override void OnSizeChanged(SizeChangedEventArgs e)
    {
        base.OnSizeChanged(e);
        Restart();
    }

    private void Restart()
    {
        _pulse?.Dispose();
        _pulse = null;
        var alive = Status is DotStatus.Online or DotStatus.Loading;
        _halo.IsVisible = alive && !FrameDriver.IsInstant;
        if (_halo.IsVisible && Bounds.Width > 0 && this.IsAttachedToVisualTree())
        {
            _pulse = Endless.Pulse(_halo, TimeSpan.FromSeconds(2), _easeInOut, [1, 1.8, 1], [0.6, 0, 0.6]);
        }
    }
}
