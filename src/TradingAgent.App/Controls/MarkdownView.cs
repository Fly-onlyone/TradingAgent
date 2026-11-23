using System.Text;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Immutable;

namespace TradingAgent.App.Controls;

/// <summary>
/// Shows the Markdown a model writes: headings, bold, italic, inline code, lists, tables, fenced code
/// and block quotes. Everything else is shown as plain text.
/// </summary>
/// <remarks>
/// Hand-written and small on purpose: a Markdown package would have to pass the Native AOT build, and
/// a chat needs only this much. The children are built again whenever <see cref="Text"/> changes, so a
/// caller that streams text should not set it for every few characters; the chat screen sets it a few
/// times a second.
/// </remarks>
public sealed class MarkdownView : StackPanel
{
    public static readonly StyledProperty<string?> TextProperty =
        AvaloniaProperty.Register<MarkdownView, string?>(nameof(Text));

    private static readonly IBrush _primary = new ImmutableSolidColorBrush(Color.Parse("#F8FAFC"));
    private static readonly IBrush _secondary = new ImmutableSolidColorBrush(Color.Parse("#B8A894"));
    private static readonly IBrush _accent = new ImmutableSolidColorBrush(Color.Parse("#F97316"));
    private static readonly IBrush _codeBackground = new ImmutableSolidColorBrush(Color.Parse("#211B14"));
    private static readonly IBrush _border = new ImmutableSolidColorBrush(Color.Parse("#26F97316"));
    private static readonly FontFamily _mono = new("Consolas, Cascadia Mono, monospace");

    static MarkdownView()
    {
        TextProperty.Changed.AddClassHandler<MarkdownView>((view, _) => view.Rebuild());
    }

    public MarkdownView()
    {
        Spacing = 6;
    }

    public string? Text
    {
        get => GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    private static bool StartsBlock(string line) =>
        line.StartsWith("```", StringComparison.Ordinal)
        || line.StartsWith('#')
        || line.StartsWith('|')
        || line.StartsWith('>')
        || IsBullet(line)
        || IsOrdered(line, out _);

    private static bool IsBullet(string line) =>
        line.StartsWith("- ", StringComparison.Ordinal) || line.StartsWith("* ", StringComparison.Ordinal);

    private static bool IsOrdered(string line, out int dot)
    {
        dot = 0;
        while (dot < line.Length && char.IsDigit(line[dot]))
        {
            dot++;
        }

        return dot > 0 && dot + 1 < line.Length && line[dot] == '.' && line[dot + 1] == ' ';
    }

    private static SelectableTextBlock NewText() => new()
    {
        TextWrapping = TextWrapping.Wrap,
        Foreground = _primary,
        FontSize = 14,
        Inlines = [],
    };

    private static Border CodeBlock(string code) => new()
    {
        Background = _codeBackground,
        BorderBrush = _border,
        BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(8),
        Padding = new Thickness(10, 8),
        Child = new SelectableTextBlock
        {
            Text = code,
            FontFamily = _mono,
            FontSize = 13,
            Foreground = _primary,
            TextWrapping = TextWrapping.Wrap,
        },
    };

    private static Border Table(List<string[]> rows)
    {
        var columns = rows.Count == 0 ? 0 : rows.Max(row => row.Length);
        var grid = new Grid();
        for (var column = 0; column < columns; column++)
        {
            grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Star));
        }

        for (var row = 0; row < rows.Count; row++)
        {
            grid.RowDefinitions.Add(new RowDefinition(GridLength.Auto));
            for (var column = 0; column < rows[row].Length; column++)
            {
                var text = NewText();
                if (row == 0)
                {
                    text.FontWeight = FontWeight.SemiBold;
                }

                AddInlines(text.Inlines!, rows[row][column]);
                var cell = new Border
                {
                    BorderBrush = _border,
                    BorderThickness = new Thickness(0, 0, 0, 1),
                    Padding = new Thickness(6, 4),
                    Child = text,
                };
                Grid.SetRow(cell, row);
                Grid.SetColumn(cell, column);
                grid.Children.Add(cell);
            }
        }

        return new Border
        {
            BorderBrush = _border,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            ClipToBounds = true,
            Child = grid,
        };
    }

    /// <summary>Reads <c>`code`</c>, <c>**bold**</c> and <c>*italic*</c>; a marker without its end is shown as it is.</summary>
    private static void AddInlines(InlineCollection inlines, string text)
    {
        var plain = new StringBuilder();
        void Flush()
        {
            if (plain.Length > 0)
            {
                inlines.Add(new Run(plain.ToString()));
                plain.Clear();
            }
        }

        var index = 0;
        while (index < text.Length)
        {
            if (text[index] == '`')
            {
                var end = text.IndexOf('`', index + 1);
                if (end > index)
                {
                    Flush();
                    inlines.Add(new Run(text.Substring(index + 1, end - index - 1))
                    {
                        FontFamily = _mono,
                        FontSize = 13,
                        Foreground = _accent,
                        Background = _codeBackground,
                    });
                    index = end + 1;
                    continue;
                }
            }
            else if (text[index] == '*' && index + 1 < text.Length && text[index + 1] == '*')
            {
                var end = text.IndexOf("**", index + 2, StringComparison.Ordinal);
                if (end > index)
                {
                    Flush();
                    inlines.Add(new Run(text.Substring(index + 2, end - index - 2)) { FontWeight = FontWeight.Bold });
                    index = end + 2;
                    continue;
                }
            }
            else if (text[index] == '*')
            {
                var end = text.IndexOf('*', index + 1);
                if (end > index + 1)
                {
                    Flush();
                    inlines.Add(new Run(text.Substring(index + 1, end - index - 1)) { FontStyle = FontStyle.Italic });
                    index = end + 1;
                    continue;
                }
            }

            plain.Append(text[index++]);
        }

        Flush();
    }

    private void Rebuild()
    {
        Children.Clear();
        var text = Text;
        if (string.IsNullOrEmpty(text))
        {
            return;
        }

        var lines = text.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var index = 0;
        while (index < lines.Length)
        {
            var line = lines[index];
            if (string.IsNullOrWhiteSpace(line))
            {
                index++;
                continue;
            }

            if (line.StartsWith("```", StringComparison.Ordinal))
            {
                var code = new List<string>();
                index++;
                while (index < lines.Length && !lines[index].StartsWith("```", StringComparison.Ordinal))
                {
                    code.Add(lines[index++]);
                }

                // The closing fence, or the end of text that is still being written.
                index++;
                Children.Add(CodeBlock(string.Join('\n', code)));
                continue;
            }

            if (line.StartsWith('#'))
            {
                var level = 0;
                while (level < line.Length && line[level] == '#')
                {
                    level++;
                }

                var heading = NewText();
                heading.FontSize = level <= 2 ? 20 : 16;
                heading.FontWeight = FontWeight.SemiBold;
                heading.Margin = new Thickness(0, 4, 0, 0);
                AddInlines(heading.Inlines!, line[level..].TrimStart());
                Children.Add(heading);
                index++;
                continue;
            }

            if (line.StartsWith('|'))
            {
                var rows = new List<string[]>();
                while (index < lines.Length && lines[index].StartsWith('|'))
                {
                    var cells = lines[index].Trim().Trim('|').Split('|').Select(cell => cell.Trim()).ToArray();
                    // The row of dashes under the header is layout, not content.
                    if (!cells.All(cell => cell.Length > 0 && cell.All(character => character is '-' or ':')))
                    {
                        rows.Add(cells);
                    }

                    index++;
                }

                Children.Add(Table(rows));
                continue;
            }

            if (line.StartsWith('>'))
            {
                var parts = new List<string>();
                while (index < lines.Length && lines[index].StartsWith('>'))
                {
                    parts.Add(lines[index++].TrimStart('>').Trim());
                }

                var quote = NewText();
                quote.Foreground = _secondary;
                AddInlines(quote.Inlines!, string.Join(' ', parts));
                Children.Add(new Border
                {
                    BorderBrush = _accent,
                    BorderThickness = new Thickness(3, 0, 0, 0),
                    Padding = new Thickness(10, 2, 0, 2),
                    Child = quote,
                });
                continue;
            }

            if (IsOrdered(line, out _) || IsBullet(line))
            {
                var list = new StackPanel { Spacing = 2, Margin = new Thickness(4, 0, 0, 0) };
                while (index < lines.Length)
                {
                    var item = lines[index];
                    string marker;
                    string body;
                    if (IsOrdered(item, out var dot))
                    {
                        marker = item[..(dot + 1)];
                        body = item[(dot + 1)..].Trim();
                    }
                    else if (IsBullet(item))
                    {
                        marker = "•";
                        body = item[2..].Trim();
                    }
                    else
                    {
                        break;
                    }

                    var row = new Grid { ColumnDefinitions = new ColumnDefinitions("26,*") };
                    var markerText = NewText();
                    markerText.Text = marker;
                    markerText.Foreground = _accent;
                    var bodyText = NewText();
                    AddInlines(bodyText.Inlines!, body);
                    Grid.SetColumn(bodyText, 1);
                    row.Children.Add(markerText);
                    row.Children.Add(bodyText);
                    list.Children.Add(row);
                    index++;
                }

                Children.Add(list);
                continue;
            }

            var paragraph = new List<string>();
            while (index < lines.Length && !string.IsNullOrWhiteSpace(lines[index]) && !StartsBlock(lines[index]))
            {
                paragraph.Add(lines[index++]);
            }

            if (paragraph.Count == 0)
            {
                paragraph.Add(lines[index++]);
            }

            var block = NewText();
            AddInlines(block.Inlines!, string.Join(' ', paragraph));
            Children.Add(block);
        }
    }
}
