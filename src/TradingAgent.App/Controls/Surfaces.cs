using Avalonia;
using Avalonia.Controls;

namespace TradingAgent.App.Controls;

/// <summary>
/// A glass card: the surface every panel of a page sits on. It has the accent line along its top,
/// which starts to flow while the pointer is over the card, and it glows a little then.
/// </summary>
/// <remarks>The look is in its theme (Theme/Controls/Card.axaml). Padding is none unless a view sets it.</remarks>
public sealed class Card : ContentControl
{
}

/// <summary>A small rounded label: a status, a tag, a count. Classes choose variant, colour and size.</summary>
/// <remarks>
/// Filled is the default and is always tinted with the primary colour, as in the previous UI, whose
/// theme painted over the colour of a filled chip. The class "outlined" takes the colour classes
/// "primary", "secondary", "success", "error", "warning" and "info"; "small" gives the 24 px chip.
/// </remarks>
public sealed class Chip : ContentControl
{
    /// <summary>What stands before the label: an icon or a small spinner.</summary>
    public static readonly StyledProperty<object?> IconProperty =
        AvaloniaProperty.Register<Chip, object?>(nameof(Icon));

    public object? Icon
    {
        get => GetValue(IconProperty);
        set => SetValue(IconProperty, value);
    }
}

/// <summary>What kind of message an <see cref="Alert"/> carries; it decides colour and icon.</summary>
public enum AlertSeverity
{
    Info,
    Success,
    Warning,
    Error,
}

/// <summary>
/// A message in a tinted box with an icon: a notice on a page, or, with the class "filled", a
/// notification that floats over it.
/// </summary>
public sealed class Alert : ContentControl
{
    public static readonly StyledProperty<AlertSeverity> SeverityProperty =
        AvaloniaProperty.Register<Alert, AlertSeverity>(nameof(Severity));

    /// <summary>What stands at the right end: a button to close the message or to act on it.</summary>
    public static readonly StyledProperty<object?> ActionProperty =
        AvaloniaProperty.Register<Alert, object?>(nameof(Action));

    public AlertSeverity Severity
    {
        get => GetValue(SeverityProperty);
        set => SetValue(SeverityProperty, value);
    }

    public object? Action
    {
        get => GetValue(ActionProperty);
        set => SetValue(ActionProperty, value);
    }
}
