using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Data;
using Avalonia.Media;

namespace TradingAgent.App.Motion;

/// <summary>
/// Makes a menu or popover grow out of the corner it is anchored at when it opens, as the "Grow"
/// transition of the previous UI's component library did.
/// </summary>
/// <remarks>
/// The surface fades in while it scales from 75 % of its width and 56 % of its height, around its
/// <c>RenderTransformOrigin</c>. The time follows the height of the surface, by that library's rule
/// for menus of unknown size; the scaling takes two thirds of it. There is no closing animation: a
/// popup is gone the moment it closes.
/// </remarks>
public sealed class Grow : AvaloniaObject
{
    public static readonly AttachedProperty<bool> OnProperty =
        AvaloniaProperty.RegisterAttached<Grow, Control, bool>("On");

    /// <summary>The length of the fade in seconds; by the height of the surface when not set.</summary>
    public static readonly AttachedProperty<double> SecondsProperty =
        AvaloniaProperty.RegisterAttached<Grow, Control, double>("Seconds", double.NaN);

    private static readonly Easing _curve = new SplineEasing(0.4, 0, 0.2, 1);

    static Grow()
    {
        OnProperty.Changed.AddClassHandler<Control>((control, change) =>
        {
            control.AttachedToVisualTree -= OnAttached;
            if (change.GetNewValue<bool>())
            {
                control.AttachedToVisualTree += OnAttached;
            }
        });
    }

    public static bool GetOn(Control control) => control.GetValue(OnProperty);

    public static void SetOn(Control control, bool value) => control.SetValue(OnProperty, value);

    public static double GetSeconds(Control control) => control.GetValue(SecondsProperty);

    public static void SetSeconds(Control control, double value) => control.SetValue(SecondsProperty, value);

    /// <summary>The length of the fade for a surface this high, in seconds.</summary>
    public static double SecondsFor(double height)
    {
        if (height <= 0)
        {
            return 0;
        }

        var constant = height / 36;
        return Math.Min(Math.Round((4 + (15 * Math.Pow(constant, 0.25)) + (constant / 5)) * 10), 3000) / 1000;
    }

    private static void OnAttached(object? sender, VisualTreeAttachmentEventArgs e)
    {
        if (sender is not Control control)
        {
            return;
        }

        var opacity = new ValueStream<double>(0);
        var transform = new MatrixTransform(Matrix.CreateScale(0.75, 0.5625));
        var holdOpacity = control.Bind(Visual.OpacityProperty, opacity, BindingPriority.Animation);
        var holdTransform = control.SetValue(Visual.RenderTransformProperty, transform, BindingPriority.Animation);
        var fixedLength = GetSeconds(control);
        double? fade = double.IsNaN(fixedLength) ? null : fixedLength;

        FrameDriver.Run(control, seconds =>
        {
            // The height is known only after the first layout.
            fade ??= control.Bounds.Height > 0 ? SecondsFor(control.Bounds.Height) : null;
            var length = fade ?? 0.25;
            if (seconds >= length)
            {
                holdOpacity.Dispose();
                holdTransform?.Dispose();
                return false;
            }

            opacity.Set(_curve.Ease(seconds / length));
            var grown = _curve.Ease(Math.Min(1, seconds / (length * 0.666)));
            transform.Matrix = Matrix.CreateScale(0.75 + (0.25 * grown), 0.5625 + (0.4375 * grown));
            return true;
        });
    }
}
