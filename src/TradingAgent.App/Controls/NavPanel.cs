using Avalonia;
using Avalonia.Controls;

namespace TradingAgent.App.Controls;

/// <summary>
/// Lays the rows of the sidebar out from the top, and the rows marked with
/// <see cref="AtBottomProperty"/> from the bottom, so Settings stays at the foot of the window.
/// </summary>
/// <remarks>
/// When the window is too low for all rows they simply follow each other and the list scrolls, as
/// the drawer of the previous UI did.
/// </remarks>
public sealed class NavPanel : Panel
{
    /// <summary>True on a row that belongs at the bottom. A row here is the container of a list item.</summary>
    public static readonly AttachedProperty<bool> AtBottomProperty =
        AvaloniaProperty.RegisterAttached<NavPanel, Control, bool>("AtBottom");

    static NavPanel()
    {
        AffectsParentArrange<NavPanel>(AtBottomProperty);
    }

    public static bool GetAtBottom(Control control) => control.GetValue(AtBottomProperty);

    public static void SetAtBottom(Control control, bool value) => control.SetValue(AtBottomProperty, value);

    protected override Size MeasureOverride(Size availableSize)
    {
        var width = 0d;
        var height = 0d;
        foreach (var child in Children)
        {
            child.Measure(new Size(availableSize.Width, double.PositiveInfinity));
            width = Math.Max(width, child.DesiredSize.Width);
            height += child.DesiredSize.Height;
        }

        return new Size(double.IsInfinity(availableSize.Width) ? width : availableSize.Width, height);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        var top = 0d;
        var bottomHeight = Children.Where(GetAtBottom).Sum(child => child.DesiredSize.Height);
        var bottom = Math.Max(finalSize.Height - bottomHeight, Children.Where(child => !GetAtBottom(child)).Sum(child => child.DesiredSize.Height));
        foreach (var child in Children)
        {
            var height = child.DesiredSize.Height;
            if (GetAtBottom(child))
            {
                child.Arrange(new Rect(0, bottom, finalSize.Width, height));
                bottom += height;
            }
            else
            {
                child.Arrange(new Rect(0, top, finalSize.Width, height));
                top += height;
            }
        }

        return finalSize;
    }
}
