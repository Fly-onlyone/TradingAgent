using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>
/// Three dots that hop one after the other: the agent has started a reply and no text has come yet.
/// </summary>
/// <remarks>
/// As in the previous UI: each dot rises 8 px and falls back in 0.6 s, the second and third starting
/// 0.15 s after the one before. They hop only while they can be seen.
/// </remarks>
public sealed class ThinkingDots : StackPanel
{
    public static readonly StyledProperty<IBrush?> FillProperty =
        AvaloniaProperty.Register<ThinkingDots, IBrush?>(nameof(Fill));

    private static readonly Easing _easeInOut = new SplineEasing(0.42, 0, 0.58, 1);

    private readonly List<IDisposable> _hops = [];
    private IDisposable? _visibility;

    public ThinkingDots()
    {
        Orientation = Orientation.Horizontal;
        Spacing = 4;
        for (var index = 0; index < 3; index++)
        {
            var dot = new Border { Width = 8, Height = 8, CornerRadius = new CornerRadius(4) };
            dot[!Border.BackgroundProperty] = this[!FillProperty];
            Children.Add(dot);
        }
    }

    public IBrush? Fill
    {
        get => GetValue(FillProperty);
        set => SetValue(FillProperty, value);
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        _visibility = VisibilityWatch.Subscribe(this, Restart);
        Restart();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _visibility?.Dispose();
        _visibility = null;
        Stop();
    }

    private void Stop()
    {
        foreach (var hop in _hops)
        {
            hop.Dispose();
        }

        _hops.Clear();
    }

    private void Restart()
    {
        Stop();
        if (!this.IsAttachedToVisualTree() || !IsEffectivelyVisible)
        {
            return;
        }

        for (var index = 0; index < Children.Count; index++)
        {
            _hops.Add(Endless.BobY(Children[index], TimeSpan.FromSeconds(0.6), _easeInOut, TimeSpan.FromSeconds(index * 0.15), 0, -8, 0));
        }
    }
}

/// <summary>
/// The caret after a reply that is still being written: a small bar that shows for half a second
/// and is gone for half a second.
/// </summary>
public sealed class BlinkCaret : Border
{
    private IDisposable? _blink;
    private IDisposable? _visibility;

    static BlinkCaret()
    {
        WidthProperty.OverrideDefaultValue<BlinkCaret>(6);
        HeightProperty.OverrideDefaultValue<BlinkCaret>(17);
        HorizontalAlignmentProperty.OverrideDefaultValue<BlinkCaret>(HorizontalAlignment.Left);
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        _visibility = VisibilityWatch.Subscribe(this, Restart);
        Restart();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _visibility?.Dispose();
        _visibility = null;
        _blink?.Dispose();
        _blink = null;
    }

    private void Restart()
    {
        _blink?.Dispose();
        _blink = null;
        Opacity = 1;
        if (this.IsAttachedToVisualTree() && IsEffectivelyVisible)
        {
            _blink = Endless.Every(seconds => Opacity = seconds % 1 < 0.5 ? 1 : 0);
        }
    }
}
