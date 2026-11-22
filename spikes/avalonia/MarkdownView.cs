using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Immutable;

namespace SpikeAvalonia;

/// <summary>
/// Minimal Markdown-to-controls renderer covering exactly the constructs in transcript.md:
/// headings, bold, italic, inline code, ordered/unordered lists, tables, fenced code, block quotes.
/// Rebuilds its child tree whenever <see cref="Text"/> changes (the streaming "re-render").
/// </summary>
public sealed class MarkdownView : StackPanel
{
	public static readonly StyledProperty<string?> TextProperty =
		AvaloniaProperty.Register<MarkdownView, string?>(nameof(Text));

	private static readonly IBrush Primary = new ImmutableSolidColorBrush(Color.Parse("#F8FAFC"));
	private static readonly IBrush Secondary = new ImmutableSolidColorBrush(Color.Parse("#B8A894"));
	private static readonly IBrush Accent = new ImmutableSolidColorBrush(Color.Parse("#F97316"));
	private static readonly IBrush WindowBg = new ImmutableSolidColorBrush(Color.Parse("#211b14"));
	private static readonly IBrush CodeBg = new ImmutableSolidColorBrush(Color.Parse("#211b14"));
	private static readonly IBrush Border1 = new ImmutableSolidColorBrush(Color.Parse("#26F97316"));
	private static readonly FontFamily Mono = new("Consolas, Cascadia Mono, monospace");

	static MarkdownView()
	{
		TextProperty.Changed.AddClassHandler<MarkdownView>((v, _) => v.Rebuild());
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

	private void Rebuild()
	{
		Children.Clear();
		var text = Text;
		if (string.IsNullOrEmpty(text)) return;
		var lines = text.Split('\n');
		var i = 0;
		while (i < lines.Length)
		{
			var line = lines[i];
			if (string.IsNullOrWhiteSpace(line)) { i++; continue; }

			if (line.StartsWith("```"))
			{
				var sb = new List<string>();
				i++;
				while (i < lines.Length && !lines[i].StartsWith("```")) sb.Add(lines[i++]);
				i++; // closing fence (or end of partial text)
				Children.Add(CodeBlock(string.Join('\n', sb)));
				continue;
			}

			if (line.StartsWith('#'))
			{
				var level = 0;
				while (level < line.Length && line[level] == '#') level++;
				var content = line[level..].TrimStart();
				var tb = NewText();
				tb.FontSize = level <= 2 ? 20 : 16;
				tb.FontWeight = FontWeight.SemiBold;
				tb.Margin = new Thickness(0, 4, 0, 0);
				AddInlines(tb.Inlines!, content);
				Children.Add(tb);
				i++;
				continue;
			}

			if (line.StartsWith('|'))
			{
				var rows = new List<string[]>();
				while (i < lines.Length && lines[i].StartsWith('|'))
				{
					var cells = lines[i].Trim().Trim('|').Split('|').Select(c => c.Trim()).ToArray();
					if (!cells.All(c => c.Length > 0 && c.All(ch => ch is '-' or ':'))) rows.Add(cells);
					i++;
				}
				Children.Add(Table(rows));
				continue;
			}

			if (line.StartsWith('>'))
			{
				var parts = new List<string>();
				while (i < lines.Length && lines[i].StartsWith('>')) parts.Add(lines[i++].TrimStart('>').Trim());
				var tb = NewText();
				tb.Foreground = Secondary;
				AddInlines(tb.Inlines!, string.Join(' ', parts));
				Children.Add(new Border
				{
					BorderBrush = Accent,
					BorderThickness = new Thickness(3, 0, 0, 0),
					Padding = new Thickness(10, 2, 0, 2),
					Child = tb,
				});
				continue;
			}

			if (IsOrdered(line, out _) || line.StartsWith("- "))
			{
				var list = new StackPanel { Spacing = 2, Margin = new Thickness(4, 0, 0, 0) };
				while (i < lines.Length)
				{
					var l = lines[i];
					string marker, body;
					if (IsOrdered(l, out var dot)) { marker = l[..(dot + 1)]; body = l[(dot + 1)..].Trim(); }
					else if (l.StartsWith("- ")) { marker = "•"; body = l[2..].Trim(); }
					else break;
					var g = new Grid { ColumnDefinitions = new ColumnDefinitions("22,*") };
					var m = NewText();
					m.Text = marker;
					m.Foreground = Accent;
					var t = NewText();
					AddInlines(t.Inlines!, body);
					Grid.SetColumn(t, 1);
					g.Children.Add(m);
					g.Children.Add(t);
					list.Children.Add(g);
					i++;
				}
				Children.Add(list);
				continue;
			}

			var para = new List<string>();
			while (i < lines.Length && !string.IsNullOrWhiteSpace(lines[i]) && !StartsBlock(lines[i])) para.Add(lines[i++]);
			if (para.Count == 0) { para.Add(lines[i++]); }
			var p = NewText();
			AddInlines(p.Inlines!, string.Join(' ', para));
			Children.Add(p);
		}
	}

	private static bool StartsBlock(string l) =>
		l.StartsWith("```") || l.StartsWith('#') || l.StartsWith('|') || l.StartsWith('>') || l.StartsWith("- ") ||
		IsOrdered(l, out _);

	private static bool IsOrdered(string l, out int dot)
	{
		dot = 0;
		while (dot < l.Length && char.IsDigit(l[dot])) dot++;
		return dot > 0 && dot + 1 < l.Length && l[dot] == '.' && l[dot + 1] == ' ';
	}

	private static TextBlock NewText() => new()
	{
		TextWrapping = TextWrapping.Wrap,
		Foreground = Primary,
		FontSize = 14,
		Inlines = new InlineCollection(),
	};

	private static Control CodeBlock(string code) => new Border
	{
		Background = CodeBg,
		BorderBrush = Border1,
		BorderThickness = new Thickness(1),
		CornerRadius = new CornerRadius(8),
		Padding = new Thickness(10, 8),
		Child = new TextBlock
		{
			Text = code,
			FontFamily = Mono,
			FontSize = 13,
			Foreground = Primary,
			TextWrapping = TextWrapping.Wrap,
		},
	};

	private static Control Table(List<string[]> rows)
	{
		var cols = rows.Count == 0 ? 0 : rows.Max(r => r.Length);
		var grid = new Grid();
		for (var c = 0; c < cols; c++) grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Star));
		for (var r = 0; r < rows.Count; r++)
		{
			grid.RowDefinitions.Add(new RowDefinition(GridLength.Auto));
			for (var c = 0; c < rows[r].Length; c++)
			{
				var tb = NewText();
				if (r == 0) tb.FontWeight = FontWeight.SemiBold;
				AddInlines(tb.Inlines!, rows[r][c]);
				var cell = new Border
				{
					BorderBrush = Border1,
					BorderThickness = new Thickness(0, 0, 0, 1),
					Padding = new Thickness(6, 4),
					Child = tb,
				};
				Grid.SetRow(cell, r);
				Grid.SetColumn(cell, c);
				grid.Children.Add(cell);
			}
		}
		return new Border
		{
			BorderBrush = Border1,
			BorderThickness = new Thickness(1),
			CornerRadius = new CornerRadius(8),
			ClipToBounds = true,
			Child = grid,
		};
	}

	/// <summary>Parses `code`, **bold** and *italic*; an unterminated marker is rendered literally.</summary>
	private static void AddInlines(InlineCollection inlines, string s)
	{
		var buf = new System.Text.StringBuilder();
		void Flush()
		{
			if (buf.Length == 0) return;
			inlines.Add(new Run(buf.ToString()));
			buf.Clear();
		}

		var i = 0;
		while (i < s.Length)
		{
			if (s[i] == '`')
			{
				var end = s.IndexOf('`', i + 1);
				if (end > i)
				{
					Flush();
					inlines.Add(new Run(s.Substring(i + 1, end - i - 1))
					{
						FontFamily = Mono, FontSize = 13, Foreground = Accent, Background = WindowBg,
					});
					i = end + 1;
					continue;
				}
			}
			else if (s[i] == '*' && i + 1 < s.Length && s[i + 1] == '*')
			{
				var end = s.IndexOf("**", i + 2, StringComparison.Ordinal);
				if (end > i)
				{
					Flush();
					inlines.Add(new Run(s.Substring(i + 2, end - i - 2)) { FontWeight = FontWeight.Bold });
					i = end + 2;
					continue;
				}
			}
			else if (s[i] == '*')
			{
				var end = s.IndexOf('*', i + 1);
				if (end > i)
				{
					Flush();
					inlines.Add(new Run(s.Substring(i + 1, end - i - 1)) { FontStyle = FontStyle.Italic });
					i = end + 1;
					continue;
				}
			}
			buf.Append(s[i++]);
		}
		Flush();
	}
}
