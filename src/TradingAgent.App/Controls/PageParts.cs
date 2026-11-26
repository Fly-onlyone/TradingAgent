using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Media;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>
/// The head of a page: its title, a line under it, and on the right what the page offers to do
/// (the content).
/// </summary>
public sealed class SectionHeader : ContentControl
{
    public static readonly StyledProperty<string?> TitleProperty =
        AvaloniaProperty.Register<SectionHeader, string?>(nameof(Title));

    public static readonly StyledProperty<string?> SubtitleProperty =
        AvaloniaProperty.Register<SectionHeader, string?>(nameof(Subtitle));

    public string? Title
    {
        get => GetValue(TitleProperty);
        set => SetValue(TitleProperty, value);
    }

    public string? Subtitle
    {
        get => GetValue(SubtitleProperty);
        set => SetValue(SubtitleProperty, value);
    }
}

/// <summary>
/// What a list or a chart shows while it has nothing: an icon that floats a little, a title, a line
/// of explanation, and below them the content, if any (a button to do something about it).
/// </summary>
public sealed class EmptyState : ContentControl
{
    public static readonly StyledProperty<Geometry?> IconProperty =
        AvaloniaProperty.Register<EmptyState, Geometry?>(nameof(Icon));

    public static readonly StyledProperty<string?> TitleProperty =
        AvaloniaProperty.Register<EmptyState, string?>(nameof(Title));

    public static readonly StyledProperty<string?> DescriptionProperty =
        AvaloniaProperty.Register<EmptyState, string?>(nameof(Description));

    private static readonly Easing _easeInOut = new SplineEasing(0.42, 0, 0.58, 1);

    private Control? _icon;
    private IDisposable? _floating;
    private IDisposable? _visibility;

    public Geometry? Icon
    {
        get => GetValue(IconProperty);
        set => SetValue(IconProperty, value);
    }

    public string? Title
    {
        get => GetValue(TitleProperty);
        set => SetValue(TitleProperty, value);
    }

    public string? Description
    {
        get => GetValue(DescriptionProperty);
        set => SetValue(DescriptionProperty, value);
    }

    protected override void OnApplyTemplate(TemplateAppliedEventArgs e)
    {
        base.OnApplyTemplate(e);
        _icon = e.NameScope.Find<Control>("PART_Icon");
        Float();
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        _visibility = VisibilityWatch.Subscribe(this, Float);
        Float();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _visibility?.Dispose();
        _visibility = null;
        _floating?.Dispose();
        _floating = null;
    }

    /// <summary>The icon rises 8 px and comes back every 3 s, while it can be seen.</summary>
    private void Float()
    {
        _floating?.Dispose();
        _floating = null;
        if (_icon is { } icon && this.IsAttachedToVisualTree() && IsEffectivelyVisible)
        {
            _floating = Endless.BobY(icon, TimeSpan.FromSeconds(3), _easeInOut, TimeSpan.Zero, 0, -8, 0);
        }
    }
}

/// <summary>A line of a summary card: what it is on the left, its value (the content) on the right, a rule under it.</summary>
/// <remarks>The last line of a card takes the class "last" and has no rule.</remarks>
public sealed class MetricRow : ContentControl
{
    public static readonly StyledProperty<string?> LabelProperty =
        AvaloniaProperty.Register<MetricRow, string?>(nameof(Label));

    public string? Label
    {
        get => GetValue(LabelProperty);
        set => SetValue(LabelProperty, value);
    }
}
