using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace TradingAgent.App.Controls;

/// <summary>
/// The outline of a Material text field: a rounded border whose top edge opens where the label sits
/// once the label has floated up.
/// </summary>
/// <remarks>
/// The gap is as wide as the label at three quarters of its size plus 5 px on each side, and starts
/// 9 px from the left, as in the component library of the previous UI. Its width is a property so a
/// transition can open and close it.
/// </remarks>
public sealed class OutlineNotch : Control
{
    public static readonly StyledProperty<IBrush?> StrokeProperty =
        AvaloniaProperty.Register<OutlineNotch, IBrush?>(nameof(Stroke));

    public static readonly StyledProperty<double> ThicknessProperty =
        AvaloniaProperty.Register<OutlineNotch, double>(nameof(Thickness), 1);

    public static readonly StyledProperty<CornerRadius> CornerRadiusProperty =
        Border.CornerRadiusProperty.AddOwner<OutlineNotch>();

    /// <summary>The label the gap makes room for. Its width decides the width of the gap.</summary>
    public static readonly StyledProperty<Control?> LabelProperty =
        AvaloniaProperty.Register<OutlineNotch, Control?>(nameof(Label));

    /// <summary>True while the label is up in the outline.</summary>
    public static readonly StyledProperty<bool> IsOpenProperty =
        AvaloniaProperty.Register<OutlineNotch, bool>(nameof(IsOpen));

    /// <summary>The width of the gap now. Set by the control itself; a transition on it animates the gap.</summary>
    public static readonly StyledProperty<double> GapWidthProperty =
        AvaloniaProperty.Register<OutlineNotch, double>(nameof(GapWidth));

    private const double GapStart = 9;
    private const double LabelScale = 0.75;
    private const double GapPadding = 5;

    static OutlineNotch()
    {
        IsHitTestVisibleProperty.OverrideDefaultValue<OutlineNotch>(false);
        AffectsRender<OutlineNotch>(StrokeProperty, ThicknessProperty, CornerRadiusProperty, GapWidthProperty);
        IsOpenProperty.Changed.AddClassHandler<OutlineNotch>((notch, _) => notch.UpdateGap());
        LabelProperty.Changed.AddClassHandler<OutlineNotch>((notch, change) =>
        {
            if (change.OldValue is Control before)
            {
                before.PropertyChanged -= notch.OnLabelChanged;
            }

            if (change.NewValue is Control after)
            {
                after.PropertyChanged += notch.OnLabelChanged;
            }

            notch.UpdateGap();
        });
    }

    public IBrush? Stroke
    {
        get => GetValue(StrokeProperty);
        set => SetValue(StrokeProperty, value);
    }

    public double Thickness
    {
        get => GetValue(ThicknessProperty);
        set => SetValue(ThicknessProperty, value);
    }

    public CornerRadius CornerRadius
    {
        get => GetValue(CornerRadiusProperty);
        set => SetValue(CornerRadiusProperty, value);
    }

    public Control? Label
    {
        get => GetValue(LabelProperty);
        set => SetValue(LabelProperty, value);
    }

    public bool IsOpen
    {
        get => GetValue(IsOpenProperty);
        set => SetValue(IsOpenProperty, value);
    }

    public double GapWidth
    {
        get => GetValue(GapWidthProperty);
        set => SetValue(GapWidthProperty, value);
    }

    public override void Render(DrawingContext context)
    {
        if (Stroke is not { } stroke || Thickness <= 0)
        {
            return;
        }

        var thickness = Thickness;
        var bounds = new Rect(Bounds.Size);
        var radius = CornerRadius;
        var outline = new RoundedRect(
            bounds.Deflate(thickness / 2),
            Math.Max(0, radius.TopLeft - (thickness / 2)),
            Math.Max(0, radius.TopRight - (thickness / 2)),
            Math.Max(0, radius.BottomRight - (thickness / 2)),
            Math.Max(0, radius.BottomLeft - (thickness / 2)));
        var pen = new Pen(stroke, thickness);

        var gap = GapWidth;
        if (gap < 0.5)
        {
            context.DrawRectangle(null, pen, outline);
            return;
        }

        // Everything but a slot over the top edge: the border is drawn whole and the slot cuts it.
        var around = new CombinedGeometry(
            GeometryCombineMode.Exclude,
            new RectangleGeometry(bounds.Inflate(2)),
            new RectangleGeometry(new Rect(GapStart, -2, gap, thickness + 4)));
        using (context.PushGeometryClip(around))
        {
            context.DrawRectangle(null, pen, outline);
        }
    }

    private void OnLabelChanged(object? sender, AvaloniaPropertyChangedEventArgs change)
    {
        if (change.Property == BoundsProperty)
        {
            UpdateGap();
        }
    }

    private void UpdateGap() =>
        GapWidth = IsOpen && Label is { Bounds.Width: > 0 } label ? (label.Bounds.Width * LabelScale) + (GapPadding * 2) : 0;
}
