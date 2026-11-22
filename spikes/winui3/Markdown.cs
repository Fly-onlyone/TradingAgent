using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Documents;
using Microsoft.UI.Xaml.Media;

namespace SpikeWinUI3;

/// <summary>
/// Minimal Markdown to XAML renderer covering only the constructs in transcript.md:
/// headings, bold, italic, inline code, ordered/unordered lists, tables, fenced code, block quotes.
/// Tolerates truncated input (streaming) by treating unclosed markers as literal text.
/// </summary>
public static class Markdown
{
    private static SolidColorBrush Brush(byte r, byte g, byte b, byte a = 255) => new(Windows.UI.Color.FromArgb(a, r, g, b));

    private static readonly SolidColorBrush Text = Brush(0xF8, 0xFA, 0xFC);
    private static readonly SolidColorBrush Accent = Brush(0xF9, 0x73, 0x16);
    private static readonly SolidColorBrush CodeBg = Brush(0x21, 0x1B, 0x14);
    private static readonly SolidColorBrush Border = Brush(0xF9, 0x73, 0x16, 0x26);
    private static readonly FontFamily Mono = new("Cascadia Mono, Consolas");

    public static void Render(string md, Panel target)
    {
        target.Children.Clear();
        var lines = md.Split('\n');
        var i = 0;
        while (i < lines.Length)
        {
            var line = lines[i];
            var t = line.TrimStart();
            if (t.Length == 0) { i++; continue; }

            if (t.StartsWith("```"))
            {
                var code = new List<string>();
                i++;
                while (i < lines.Length && !lines[i].TrimStart().StartsWith("```")) code.Add(lines[i++]);
                i++;
                target.Children.Add(CodeBlock(string.Join("\n", code)));
            }
            else if (t.StartsWith('#'))
            {
                var level = 0;
                while (level < t.Length && t[level] == '#') level++;
                var tb = NewText(level == 2 ? 20 : 16, FontWeights.SemiBold);
                tb.Margin = new Thickness(0, 4, 0, 8);
                AddInlines(tb, t[level..].Trim());
                target.Children.Add(tb);
                i++;
            }
            else if (t.StartsWith('>'))
            {
                var parts = new List<string>();
                while (i < lines.Length && lines[i].TrimStart().StartsWith('>')) parts.Add(lines[i++].TrimStart()[1..].Trim());
                var tb = NewText(14);
                AddInlines(tb, string.Join(" ", parts));
                target.Children.Add(new Border
                {
                    BorderBrush = Accent,
                    BorderThickness = new Thickness(3, 0, 0, 0),
                    Padding = new Thickness(10, 2, 0, 2),
                    Margin = new Thickness(0, 4, 0, 8),
                    Child = tb,
                });
            }
            else if (t.StartsWith('|'))
            {
                var rows = new List<string[]>();
                while (i < lines.Length && lines[i].TrimStart().StartsWith('|'))
                {
                    var cells = lines[i].Trim().Trim('|').Split('|').Select(c => c.Trim()).ToArray();
                    i++;
                    if (cells.All(c => c.Length > 0 && c.All(ch => ch is '-' or ':'))) continue;
                    rows.Add(cells);
                }
                target.Children.Add(Table(rows));
            }
            else if (IsOrdered(t) || IsBullet(t))
            {
                var ordered = IsOrdered(t);
                var n = 1;
                var list = new StackPanel { Margin = new Thickness(0, 0, 0, 8) };
                while (i < lines.Length && (ordered ? IsOrdered(lines[i].TrimStart()) : IsBullet(lines[i].TrimStart())))
                {
                    var item = lines[i++].TrimStart();
                    var body = ordered ? item[(item.IndexOf(". ", StringComparison.Ordinal) + 2)..] : item[2..];
                    var row = new Grid { Margin = new Thickness(0, 1, 0, 1) };
                    row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(24) });
                    row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                    var marker = NewText(14);
                    marker.Text = ordered ? n++ + "." : "•";
                    marker.Foreground = Accent;
                    var tb = NewText(14);
                    AddInlines(tb, body);
                    Grid.SetColumn(tb, 1);
                    row.Children.Add(marker);
                    row.Children.Add(tb);
                    list.Children.Add(row);
                }
                target.Children.Add(list);
            }
            else
            {
                var parts = new List<string>();
                while (i < lines.Length && lines[i].Trim().Length > 0 && !IsBlockStart(lines[i].TrimStart())) parts.Add(lines[i++].Trim());
                var tb = NewText(14);
                tb.Margin = new Thickness(0, 0, 0, 8);
                AddInlines(tb, string.Join(" ", parts));
                target.Children.Add(tb);
            }
        }
    }

    private static bool IsOrdered(string t)
    {
        var d = 0;
        while (d < t.Length && char.IsAsciiDigit(t[d])) d++;
        return d > 0 && d + 1 < t.Length && t[d] == '.' && t[d + 1] == ' ';
    }

    private static bool IsBullet(string t) => t.Length > 1 && t[0] is '-' or '*' && t[1] == ' ';

    private static bool IsBlockStart(string t) =>
        t.StartsWith("```") || t.StartsWith('#') || t.StartsWith('>') || t.StartsWith('|') || IsOrdered(t) || IsBullet(t);

    private static TextBlock NewText(double size, Windows.UI.Text.FontWeight? weight = null) => new()
    {
        FontSize = size,
        Foreground = Text,
        TextWrapping = TextWrapping.Wrap,
        FontWeight = weight ?? FontWeights.Normal,
        IsTextSelectionEnabled = false,
    };

    private static UIElement CodeBlock(string code)
    {
        var tb = new TextBlock { Text = code, FontFamily = Mono, FontSize = 12.5, Foreground = Text, TextWrapping = TextWrapping.Wrap };
        return new Border
        {
            Background = CodeBg,
            BorderBrush = Border,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(10),
            Margin = new Thickness(0, 4, 0, 8),
            Child = tb,
        };
    }

    private static UIElement Table(List<string[]> rows)
    {
        var grid = new Grid { Margin = new Thickness(0, 4, 0, 8) };
        var cols = rows.Count == 0 ? 0 : rows.Max(r => r.Length);
        for (var c = 0; c < cols; c++) grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        for (var r = 0; r < rows.Count; r++)
        {
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            for (var c = 0; c < rows[r].Length; c++)
            {
                var tb = NewText(13, r == 0 ? FontWeights.SemiBold : null);
                AddInlines(tb, rows[r][c]);
                var cell = new Border
                {
                    BorderBrush = Border,
                    BorderThickness = new Thickness(1),
                    Padding = new Thickness(6, 3, 6, 3),
                    Background = r == 0 ? CodeBg : null,
                    Child = tb,
                };
                Grid.SetRow(cell, r);
                Grid.SetColumn(cell, c);
                grid.Children.Add(cell);
            }
        }
        return grid;
    }

    private static void AddInlines(TextBlock tb, string s)
    {
        var buf = new System.Text.StringBuilder();
        void Flush(Windows.UI.Text.FontWeight? w = null, bool italic = false, bool code = false)
        {
            if (buf.Length == 0) return;
            var run = new Run { Text = buf.ToString() };
            if (w is { } fw) run.FontWeight = fw;
            if (italic) run.FontStyle = Windows.UI.Text.FontStyle.Italic;
            if (code) { run.FontFamily = Mono; run.Foreground = Accent; }
            tb.Inlines.Add(run);
            buf.Clear();
        }

        var i = 0;
        while (i < s.Length)
        {
            if (s[i] == '`')
            {
                var end = s.IndexOf('`', i + 1);
                if (end > 0) { Flush(); buf.Append(s, i + 1, end - i - 1); Flush(code: true); i = end + 1; continue; }
            }
            else if (s[i] == '*' && i + 1 < s.Length && s[i + 1] == '*')
            {
                var end = s.IndexOf("**", i + 2, StringComparison.Ordinal);
                if (end > 0) { Flush(); buf.Append(s, i + 2, end - i - 2); Flush(FontWeights.Bold); i = end + 2; continue; }
            }
            else if (s[i] == '*')
            {
                var end = s.IndexOf('*', i + 1);
                if (end > 0) { Flush(); buf.Append(s, i + 1, end - i - 1); Flush(italic: true); i = end + 1; continue; }
            }
            buf.Append(s[i++]);
        }
        Flush();
    }
}
