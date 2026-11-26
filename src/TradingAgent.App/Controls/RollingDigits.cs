using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Media;
using Avalonia.VisualTree;
using TradingAgent.App.Motion;

namespace TradingAgent.App.Controls;

/// <summary>
/// A figure whose digits roll into place like the wheels of a counter. Everything that is not a
/// digit stands still.
/// </summary>
/// <remarks>
/// As in the previous UI: each digit is a column of 0 to 9 that a spring moves to the right row, the
/// columns starting 30 ms one after the other from the left. A column that is already moving goes on
/// from where it is, at the speed it has.
/// </remarks>
public sealed class RollingDigits : Control
{
    public static readonly StyledProperty<string?> ValueProperty =
        AvaloniaProperty.Register<RollingDigits, string?>(nameof(Value));

    public static readonly StyledProperty<FontFamily> FontFamilyProperty =
        TextElement.FontFamilyProperty.AddOwner<RollingDigits>();

    public static readonly StyledProperty<double> FontSizeProperty =
        TextElement.FontSizeProperty.AddOwner<RollingDigits>();

    public static readonly StyledProperty<FontWeight> FontWeightProperty =
        TextElement.FontWeightProperty.AddOwner<RollingDigits>();

    public static readonly StyledProperty<IBrush?> ForegroundProperty =
        TextElement.ForegroundProperty.AddOwner<RollingDigits>();

    /// <summary>The height of a row of digits, in font sizes.</summary>
    private const double RowHeight = 1.2;

    private static readonly Spring _spring = new(200, 25, 0.8);

    private readonly List<Column> _columns = [];
    private IDisposable? _rolling;

    static RollingDigits()
    {
        AffectsMeasure<RollingDigits>(ValueProperty, FontFamilyProperty, FontSizeProperty, FontWeightProperty);
        AffectsRender<RollingDigits>(ForegroundProperty);
        ValueProperty.Changed.AddClassHandler<RollingDigits>((digits, _) => digits.Roll());
        ClipToBoundsProperty.OverrideDefaultValue<RollingDigits>(true);
    }

    public string? Value
    {
        get => GetValue(ValueProperty);
        set => SetValue(ValueProperty, value);
    }

    public FontFamily FontFamily
    {
        get => GetValue(FontFamilyProperty);
        set => SetValue(FontFamilyProperty, value);
    }

    public double FontSize
    {
        get => GetValue(FontSizeProperty);
        set => SetValue(FontSizeProperty, value);
    }

    public FontWeight FontWeight
    {
        get => GetValue(FontWeightProperty);
        set => SetValue(FontWeightProperty, value);
    }

    public IBrush? Foreground
    {
        get => GetValue(ForegroundProperty);
        set => SetValue(ForegroundProperty, value);
    }

    public override void Render(DrawingContext context)
    {
        var value = Value;
        if (string.IsNullOrEmpty(value))
        {
            return;
        }

        var row = FontSize * RowHeight;
        var x = 0.0;
        for (var index = 0; index < value.Length; index++)
        {
            var character = value[index];
            if (!char.IsAsciiDigit(character))
            {
                var still = Text(character.ToString());
                context.DrawText(still, new Point(x, (row - still.Height) / 2));
                x += still.WidthIncludingTrailingWhitespace;
                continue;
            }

            var position = index < _columns.Count ? _columns[index].Position : character - '0';
            // The two rows of the column that show in the window: the one leaving and the one coming.
            var upper = (int)Math.Floor(position);
            var shift = position - upper;
            var width = 0.0;
            for (var digit = upper; digit <= upper + 1; digit++)
            {
                // A spring overshoots a little: past 9 the column shows nothing, as did the old one.
                if (digit is < 0 or > 9 || (digit == upper + 1 && shift <= 0))
                {
                    continue;
                }

                var text = Text(((char)('0' + digit)).ToString());
                context.DrawText(text, new Point(x, ((digit - position) * row) + ((row - text.Height) / 2)));
                width = Math.Max(width, text.WidthIncludingTrailingWhitespace);
            }

            x += width > 0 ? width : Text("0").WidthIncludingTrailingWhitespace;
        }
    }

    protected override Size MeasureOverride(Size availableSize)
    {
        var value = Value;
        return string.IsNullOrEmpty(value)
            ? new Size(0, FontSize * RowHeight)
            : new Size(Text(value).WidthIncludingTrailingWhitespace, FontSize * RowHeight);
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Roll();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _rolling?.Dispose();
        _rolling = null;
        // Shown again, the figure rolls in again from zero.
        _columns.Clear();
    }

    private FormattedText Text(string text) => new(
        text,
        CultureInfo.CurrentCulture,
        FlowDirection.LeftToRight,
        new Typeface(FontFamily, FontStyle.Normal, FontWeight),
        FontSize,
        Foreground);

    /// <summary>Sends every digit column to the digit it must show now.</summary>
    private void Roll()
    {
        _rolling?.Dispose();
        _rolling = null;
        var value = Value ?? string.Empty;
        while (_columns.Count < value.Length)
        {
            _columns.Add(new Column());
        }

        _columns.RemoveRange(value.Length, _columns.Count - value.Length);
        for (var index = 0; index < value.Length; index++)
        {
            var column = _columns[index];
            column.From = column.Position;
            // A column that is still moving goes on at the speed it has.
            column.StartVelocity = column.Velocity;
            column.To = char.IsAsciiDigit(value[index]) ? value[index] - '0' : 0;
            column.Delay = index * 0.03;
        }

        if (!this.IsAttachedToVisualTree())
        {
            return;
        }

        _rolling = FrameDriver.Run(this, seconds =>
        {
            var moving = false;
            foreach (var column in _columns)
            {
                var (position, velocity) = _spring.At(seconds - column.Delay, column.From, column.To, column.StartVelocity);
                column.Position = position;
                column.Velocity = velocity;
                moving |= seconds < column.Delay || !Spring.IsAtRest(position, velocity, column.To, 1);
            }

            if (!moving)
            {
                foreach (var column in _columns)
                {
                    column.Position = column.To;
                    column.Velocity = 0;
                }
            }

            InvalidateVisual();
            return moving;
        });
    }

    private sealed class Column
    {
        public double Position { get; set; }

        public double Velocity { get; set; }

        public double From { get; set; }

        public double To { get; set; }

        public double Delay { get; set; }

        public double StartVelocity { get; set; }
    }
}
