using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;
using TradingAgent.App.Theme;

namespace TradingAgent.App.Controls;

/// <summary>
/// A placeholder shown while content loads: a muted block with a lighter band sweeping across it.
/// </summary>
/// <remarks>
/// The previous UI drew this as a gradient twice as wide as the block, tiled, sliding two tile
/// widths to the left every 1.5 s. Here a band five times as wide as the block carries the same
/// tiled gradient and slides by the same distance, so the sweep is the same. The slide runs in the
/// compositor.
/// </remarks>
public sealed class Skeleton : Border
{
    /// <summary>The colour of the block. The band is the same colour, two and a half times as opaque.</summary>
    public static readonly StyledProperty<Color> ColorProperty =
        AvaloniaProperty.Register<Skeleton, Color>(nameof(Color));

    /// <summary>The opacity of the block; 0.2 for a placeholder.</summary>
    public static readonly StyledProperty<double> FaintOpacityProperty =
        AvaloniaProperty.Register<Skeleton, double>(nameof(FaintOpacity), 0.2);

    /// <summary>The opacity of the middle of the band; 0.5 for a placeholder.</summary>
    public static readonly StyledProperty<double> StrongOpacityProperty =
        AvaloniaProperty.Register<Skeleton, double>(nameof(StrongOpacity), 0.5);

    private static readonly Easing _easeInOut = new SplineEasing(0.42, 0, 0.58, 1);

    private readonly Border _band = new() { HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left };
    private IDisposable? _sweep;

    static Skeleton()
    {
        ClipToBoundsProperty.OverrideDefaultValue<Skeleton>(true);
        ColorProperty.Changed.AddClassHandler<Skeleton>((skeleton, _) => skeleton.Paint());
        FaintOpacityProperty.Changed.AddClassHandler<Skeleton>((skeleton, _) => skeleton.Paint());
        StrongOpacityProperty.Changed.AddClassHandler<Skeleton>((skeleton, _) => skeleton.Paint());
    }

    public Skeleton()
    {
        Child = _band;
    }

    public Color Color
    {
        get => GetValue(ColorProperty);
        set => SetValue(ColorProperty, value);
    }

    public double FaintOpacity
    {
        get => GetValue(FaintOpacityProperty);
        set => SetValue(FaintOpacityProperty, value);
    }

    public double StrongOpacity
    {
        get => GetValue(StrongOpacityProperty);
        set => SetValue(StrongOpacityProperty, value);
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Restart();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _sweep?.Dispose();
        _sweep = null;
    }

    protected override void OnSizeChanged(SizeChangedEventArgs e)
    {
        base.OnSizeChanged(e);
        _band.Width = e.NewSize.Width * 5;
        Restart();
    }

    private void Paint()
    {
        var faint = ThemeBuilder.Alpha(Color, FaintOpacity);
        var strong = ThemeBuilder.Alpha(Color, StrongOpacity);
        _band.Background = new LinearGradientBrush
        {
            // One tile is two block widths: two fifths of the band.
            StartPoint = new RelativePoint(0, 0.5, RelativeUnit.Relative),
            EndPoint = new RelativePoint(0.4, 0.5, RelativeUnit.Relative),
            SpreadMethod = GradientSpreadMethod.Repeat,
            GradientStops =
            {
                new GradientStop(faint, 0),
                new GradientStop(faint, 0.25),
                new GradientStop(strong, 0.5),
                new GradientStop(faint, 0.75),
                new GradientStop(faint, 1),
            },
        }.ToImmutable();
    }

    private void Restart()
    {
        _sweep?.Dispose();
        _sweep = null;
        var width = Bounds.Width;
        if (width > 0 && this.IsAttachedToVisualTree())
        {
            _sweep = Endless.SlideX(_band, TimeSpan.FromSeconds(1.5), _easeInOut, 0, -4 * width);
        }
    }
}
