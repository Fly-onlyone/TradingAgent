using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;

namespace TradingAgent.App.Motion;

/// <summary>
/// Makes a control lean toward the pointer while the pointer is over it, and spring back when it
/// leaves: the pull of the main button of a page.
/// </summary>
/// <remarks>
/// As in the previous UI: the control moves by three tenths of the pointer's distance from its
/// centre, while the pointer is nearer than 100 px, on a spring of stiffness 200 and damping 20.
/// Set it on a holder around the button, not on the button, whose own transform shows a press.
/// </remarks>
public sealed class Magnet : AvaloniaObject
{
    public static readonly AttachedProperty<bool> OnProperty =
        AvaloniaProperty.RegisterAttached<Magnet, Control, bool>("On");

    private const double Strength = 0.3;
    private const double Reach = 100;

    private static readonly AttachedProperty<Pull?> _pullProperty =
        AvaloniaProperty.RegisterAttached<Magnet, Control, Pull?>("Pull");

    static Magnet()
    {
        OnProperty.Changed.AddClassHandler<Control>((control, change) =>
        {
            control.PointerMoved -= OnPointerMoved;
            control.PointerExited -= OnPointerExited;
            control.DetachedFromVisualTree -= OnDetached;
            if (change.NewValue is true)
            {
                control.PointerMoved += OnPointerMoved;
                control.PointerExited += OnPointerExited;
                control.DetachedFromVisualTree += OnDetached;
            }
        });
    }

    private Magnet()
    {
    }

    public static bool GetOn(Control control) => control.GetValue(OnProperty);

    public static void SetOn(Control control, bool value) => control.SetValue(OnProperty, value);

    private static void OnPointerMoved(object? sender, PointerEventArgs e)
    {
        if (sender is not Control control || FrameDriver.IsInstant)
        {
            return;
        }

        // Measured in the control's own space, which moves with it, as the old one measured the
        // place the element had on the screen.
        var point = e.GetPosition(control);
        var x = point.X - (control.Bounds.Width / 2);
        var y = point.Y - (control.Bounds.Height / 2);
        if (Math.Sqrt((x * x) + (y * y)) < Reach)
        {
            PullOf(control).Aim(x * Strength, y * Strength);
        }
    }

    private static void OnPointerExited(object? sender, PointerEventArgs e)
    {
        if (sender is Control control && control.GetValue(_pullProperty) is { } pull)
        {
            pull.Aim(0, 0);
        }
    }

    private static void OnDetached(object? sender, VisualTreeAttachmentEventArgs e)
    {
        if (sender is Control control && control.GetValue(_pullProperty) is { } pull)
        {
            pull.Stop();
        }
    }

    private static Pull PullOf(Control control)
    {
        if (control.GetValue(_pullProperty) is not { } pull)
        {
            pull = new Pull(control);
            control.SetValue(_pullProperty, pull);
        }

        return pull;
    }

    /// <summary>Where a control is on its way to, and how fast it moves.</summary>
    private sealed class Pull(Control control)
    {
        private readonly TranslateTransform _shift = new();
        private double _speedX;
        private double _speedY;
        private IDisposable? _moving;

        public void Aim(double toX, double toY)
        {
            _moving?.Dispose();
            control.RenderTransform = _shift;
            var fromX = _shift.X;
            var fromY = _shift.Y;
            var startX = _speedX;
            var startY = _speedY;
            _moving = FrameDriver.Run(control, seconds =>
            {
                (_shift.X, _speedX) = Spring.Soft.At(seconds, fromX, toX, startX);
                (_shift.Y, _speedY) = Spring.Soft.At(seconds, fromY, toY, startY);
                return !(Spring.IsAtRest(_shift.X, _speedX, toX, 10) && Spring.IsAtRest(_shift.Y, _speedY, toY, 10));
            });
        }

        public void Stop()
        {
            _moving?.Dispose();
            _moving = null;
            _shift.X = 0;
            _shift.Y = 0;
            _speedX = 0;
            _speedY = 0;
        }
    }
}
