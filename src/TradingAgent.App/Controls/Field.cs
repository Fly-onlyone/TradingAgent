using Avalonia;
using Avalonia.Controls;

namespace TradingAgent.App.Controls;

/// <summary>
/// The label of an outlined input. It rests inside the empty field and floats up into the outline
/// when the field has the focus or a value, as a Material text field does.
/// </summary>
/// <remarks>
/// Set <c>Field.Label</c> on a text box, a combo box or a number box. The label is not the
/// placeholder: a placeholder shows only while the label is up.
/// </remarks>
public sealed class Field : AvaloniaObject
{
    public static readonly AttachedProperty<string?> LabelProperty =
        AvaloniaProperty.RegisterAttached<Field, Control, string?>("Label");

    /// <summary>True when the control has a label. Set with the label; themes select on it.</summary>
    public static readonly AttachedProperty<bool> HasLabelProperty =
        AvaloniaProperty.RegisterAttached<Field, Control, bool>("HasLabel");

    static Field()
    {
        LabelProperty.Changed.AddClassHandler<Control>((control, change) =>
            control.SetValue(HasLabelProperty, !string.IsNullOrEmpty(change.GetNewValue<string?>())));
    }

    public static string? GetLabel(Control control) => control.GetValue(LabelProperty);

    public static void SetLabel(Control control, string? value) => control.SetValue(LabelProperty, value);

    public static bool GetHasLabel(Control control) => control.GetValue(HasLabelProperty);

    public static void SetHasLabel(Control control, bool value) => control.SetValue(HasLabelProperty, value);
}
