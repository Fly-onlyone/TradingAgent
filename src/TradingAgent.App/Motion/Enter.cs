using Avalonia;
using Avalonia.Controls;
using Avalonia.Data;
using Avalonia.Media;
using Avalonia.VisualTree;

namespace TradingAgent.App.Motion;

/// <summary>
/// Makes a control come in when it enters a window: <c>Enter.Kind</c> on the control itself, or
/// <c>Enter.Children</c> on a panel to bring its children in one after the other.
/// </summary>
/// <remarks>
/// <para>
/// The animation holds the control's opacity and transform at animation priority and lets go at the
/// end, so the values a view or a style set are back untouched. A control never stays hidden: with
/// animations off, or outside a window, it is in place at once.
/// </para>
/// <para>
/// Not for the items of a long list: a list reuses its rows while scrolling, and each reuse would play
/// the animation again.
/// </para>
/// </remarks>
public sealed class Enter : AvaloniaObject
{
    public static readonly AttachedProperty<EnterKind> KindProperty =
        AvaloniaProperty.RegisterAttached<Enter, Control, EnterKind>("Kind");

    /// <summary>Seconds to wait before the control starts to come in.</summary>
    public static readonly AttachedProperty<double> DelayProperty =
        AvaloniaProperty.RegisterAttached<Enter, Control, double>("Delay");

    public static readonly AttachedProperty<EnterKind> ChildrenProperty =
        AvaloniaProperty.RegisterAttached<Enter, Panel, EnterKind>("Children");

    /// <summary>Seconds between two children; the default is that of the kind.</summary>
    public static readonly AttachedProperty<double> StaggerProperty =
        AvaloniaProperty.RegisterAttached<Enter, Panel, double>("Stagger", double.NaN);

    private static readonly AttachedProperty<IDisposable?> _runningProperty =
        AvaloniaProperty.RegisterAttached<Enter, Control, IDisposable?>("Running");

    static Enter()
    {
        KindProperty.Changed.AddClassHandler<Control>((control, change) =>
        {
            control.AttachedToVisualTree -= OnControlAttached;
            if (change.GetNewValue<EnterKind>() != EnterKind.None)
            {
                control.AttachedToVisualTree += OnControlAttached;
                if (control.IsAttachedToVisualTree())
                {
                    PlayOwn(control);
                }
            }
        });
        ChildrenProperty.Changed.AddClassHandler<Panel>((panel, change) =>
        {
            panel.AttachedToVisualTree -= OnPanelAttached;
            if (change.GetNewValue<EnterKind>() != EnterKind.None)
            {
                panel.AttachedToVisualTree += OnPanelAttached;
                if (panel.IsAttachedToVisualTree())
                {
                    PlayChildren(panel);
                }
            }
        });
    }

    public static EnterKind GetKind(Control control) => control.GetValue(KindProperty);

    public static void SetKind(Control control, EnterKind value) => control.SetValue(KindProperty, value);

    public static double GetDelay(Control control) => control.GetValue(DelayProperty);

    public static void SetDelay(Control control, double value) => control.SetValue(DelayProperty, value);

    public static EnterKind GetChildren(Panel panel) => panel.GetValue(ChildrenProperty);

    public static void SetChildren(Panel panel, EnterKind value) => panel.SetValue(ChildrenProperty, value);

    public static double GetStagger(Panel panel) => panel.GetValue(StaggerProperty);

    public static void SetStagger(Panel panel, double value) => panel.SetValue(StaggerProperty, value);

    /// <summary>Brings <paramref name="control"/> in now, after <paramref name="delaySeconds"/>.</summary>
    public static void Play(Control control, EnterMotion motion, double delaySeconds = 0)
    {
        ArgumentNullException.ThrowIfNull(control);
        ArgumentNullException.ThrowIfNull(motion);
        control.GetValue(_runningProperty)?.Dispose();

        var opacity = new ValueStream<double>(0);
        var transform = new MatrixTransform(Offset(motion, 0));
        var holdOpacity = control.Bind(Visual.OpacityProperty, opacity, BindingPriority.Animation);
        var holdTransform = control.SetValue(Visual.RenderTransformProperty, transform, BindingPriority.Animation);

        void Release()
        {
            holdOpacity.Dispose();
            holdTransform?.Dispose();
        }

        var frames = FrameDriver.Run(control, seconds =>
        {
            var (progress, done) = motion.At(seconds - delaySeconds);
            if (done)
            {
                Release();
                return false;
            }

            if (seconds >= delaySeconds)
            {
                opacity.Set(Math.Clamp(progress, 0, 1));
                transform.Matrix = Offset(motion, progress);
            }

            return true;
        });
        control.SetValue(_runningProperty, new Handle(frames, Release));
    }

    private static Matrix Offset(EnterMotion motion, double progress)
    {
        var scale = motion.Scale + ((1 - motion.Scale) * progress);
        return Matrix.CreateScale(scale, scale) * Matrix.CreateTranslation(motion.X * (1 - progress), motion.Y * (1 - progress));
    }

    private static void OnControlAttached(object? sender, VisualTreeAttachmentEventArgs e)
    {
        if (sender is Control control)
        {
            PlayOwn(control);
        }
    }

    private static void OnPanelAttached(object? sender, VisualTreeAttachmentEventArgs e)
    {
        if (sender is Panel panel)
        {
            PlayChildren(panel);
        }
    }

    private static void PlayOwn(Control control)
    {
        if (EnterMotion.Of(GetKind(control)) is { } motion)
        {
            Play(control, motion, GetDelay(control));
        }
    }

    private static void PlayChildren(Panel panel)
    {
        var kind = GetChildren(panel);
        if (EnterMotion.Of(kind) is not { } motion)
        {
            return;
        }

        var stagger = GetStagger(panel);
        if (double.IsNaN(stagger))
        {
            stagger = EnterMotion.StaggerOf(kind);
        }

        var delay = GetDelay(panel);
        var index = 0;
        foreach (var child in panel.Children)
        {
            // A child the page hides takes no turn, so the visible ones follow each other evenly.
            if (child.IsVisible)
            {
                Play(child, motion, delay + (index++ * stagger));
            }
        }
    }

    private sealed class Handle(IDisposable frames, Action release) : IDisposable
    {
        public void Dispose()
        {
            frames.Dispose();
            release();
        }
    }
}
