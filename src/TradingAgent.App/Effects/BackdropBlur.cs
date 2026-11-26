using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Platform;
using Avalonia.Rendering.SceneGraph;
using Avalonia.Skia;
using Avalonia.VisualTree;
using SkiaSharp;

namespace TradingAgent.App.Effects;

/// <summary>
/// Blurs whatever is drawn behind it, inside its rounded bounds: the frosted glass under a card, the
/// header and the sidebar. It draws nothing of its own; the tint of the glass goes on top of it.
/// </summary>
/// <remarks>
/// <para>
/// Avalonia has no backdrop blur for a single control, only for a whole window. This asks the Skia
/// canvas the frame is drawn on to copy what is already there, blurred, into a new layer: the same
/// thing a browser does for <c>backdrop-filter: blur()</c>. The radius is a CSS blur radius, which is
/// a standard deviation.
/// </para>
/// <para>
/// Where there is no Skia canvas (a test without a renderer) nothing is blurred and the glass shows
/// its tint alone.
/// </para>
/// </remarks>
public sealed class BackdropBlur : Control
{
    /// <summary>The blur, as in <c>backdrop-filter: blur(16px)</c>.</summary>
    public static readonly StyledProperty<double> RadiusProperty =
        AvaloniaProperty.Register<BackdropBlur, double>(nameof(Radius));

    public static readonly StyledProperty<CornerRadius> CornerRadiusProperty =
        Border.CornerRadiusProperty.AddOwner<BackdropBlur>();

    /// <summary>
    /// True blurs what is on the canvas under it, whatever that is: the page under the scrim of a
    /// dialog. False, the default, shows the window's background blurred (<see cref="GlassBackdrop"/>).
    /// </summary>
    public static readonly StyledProperty<bool> IsLiveProperty =
        AvaloniaProperty.Register<BackdropBlur, bool>(nameof(IsLive));

    private bool _isOnGlass;

    static BackdropBlur()
    {
        IsHitTestVisibleProperty.OverrideDefaultValue<BackdropBlur>(false);
        AffectsRender<BackdropBlur>(RadiusProperty, CornerRadiusProperty, IsLiveProperty);
    }

    /// <summary>False switches every backdrop blur of the app off: the "Background Effects" setting.</summary>
    public static bool IsOn { get; set; } = true;

    public double Radius
    {
        get => GetValue(RadiusProperty);
        set => SetValue(RadiusProperty, value);
    }

    public CornerRadius CornerRadius
    {
        get => GetValue(CornerRadiusProperty);
        set => SetValue(CornerRadiusProperty, value);
    }

    /// <summary>True when this sheet lies on another one and so draws nothing itself.</summary>
    internal bool LiesOnGlass => _isOnGlass;

    public bool IsLive
    {
        get => GetValue(IsLiveProperty);
        set => SetValue(IsLiveProperty, value);
    }

    public override void Render(DrawingContext context)
    {
        // Glass that lies on glass has nothing to blur: under it is the tint of the sheet below,
        // which is the same everywhere. Drawing the background again would cut a hole in that tint.
        if (IsOn && !_isOnGlass && Radius > 0 && Bounds.Width > 0 && Bounds.Height > 0)
        {
            context.Custom(new Operation(new Rect(Bounds.Size), Radius, CornerRadius, IsLive));
        }
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        _isOnGlass = IsOnGlass();
    }

    /// <summary>True when a panel above this one in the tree holds a sheet of glass of its own.</summary>
    private bool IsOnGlass()
    {
        // Its own panel holds this sheet; the search starts one above.
        for (var visual = this.GetVisualParent()?.GetVisualParent(); visual is not null; visual = visual.GetVisualParent())
        {
            if (visual is Panel panel)
            {
                foreach (var child in panel.Children)
                {
                    if (child is BackdropBlur other && !ReferenceEquals(other, this))
                    {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private sealed class Operation(Rect bounds, double radius, CornerRadius corners, bool live) : ICustomDrawOperation
    {
        public Rect Bounds => bounds;

        public void Dispose()
        {
        }

        public bool Equals(ICustomDrawOperation? other) =>
            other is Operation operation && operation.Bounds == bounds && operation.Radius == radius && operation.Corners == corners && operation.Live == live;

        public bool HitTest(Point p) => false;

        public void Render(ImmediateDrawingContext context)
        {
            if (context.TryGetFeature<ISkiaSharpApiLeaseFeature>() is not { } feature)
            {
                return;
            }

            using var lease = feature.Lease();
            var canvas = lease.SkCanvas;
            var rect = new SKRect(0, 0, (float)bounds.Width, (float)bounds.Height);
            using var shape = new SKRoundRect();
            shape.SetRectRadii(
                rect,
                [
                    new SKPoint((float)corners.TopLeft, (float)corners.TopLeft),
                    new SKPoint((float)corners.TopRight, (float)corners.TopRight),
                    new SKPoint((float)corners.BottomRight, (float)corners.BottomRight),
                    new SKPoint((float)corners.BottomLeft, (float)corners.BottomLeft),
                ]);

            if (!live && GlassBackdrop.TryDraw(lease, shape))
            {
                return;
            }

            // No picture of the background for this window yet (its first frames, a still picture of
            // a page), or the page itself is to be blurred: blur what is on the canvas.
            // The canvas works in device pixels; the blur is given in the units of the layout.
            var scale = canvas.TotalMatrix.ScaleX;
            var sigma = (float)radius * (scale > 0 ? scale : 1);
            using var blur = SKImageFilter.CreateBlur(sigma, sigma, SKShaderTileMode.Clamp);

            canvas.Save();
            canvas.ClipRoundRect(shape, SKClipOperation.Intersect, antialias: true);
            // A new layer that starts as a blurred copy of what is under it; restoring it puts that copy back.
            canvas.SaveLayer(new SKCanvasSaveLayerRec { Bounds = rect, Backdrop = blur });
            canvas.Restore();
            canvas.Restore();
        }

        private double Radius => radius;

        private CornerRadius Corners => corners;

        private bool Live => live;
    }
}
