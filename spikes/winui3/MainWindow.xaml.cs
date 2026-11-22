using System.Runtime.InteropServices;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Windows.Graphics;
using WinRT.Interop;

namespace SpikeWinUI3;

public sealed partial class MainWindow : Window
{
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hwnd);

    private readonly string _fixtures = Path.GetFullPath("../fixtures");
    private readonly string? _marker;
    private readonly bool _idle;
    private bool _markerArmed = true, _paused, _dataBound;

    private Fixtures? _data;
    private int _charPos, _tickIdx, _tickCount;
    private string _transcript = "";
    private StackPanel? _curPanel;
    private readonly System.Text.StringBuilder _curText = new();
    private DispatcherTimer? _chatTimer, _chartTimer;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Spike - WinUI 3";

        var args = Environment.GetCommandLineArgs();
        for (var i = 1; i < args.Length; i++)
        {
            if (args[i] == "--fixtures" && i + 1 < args.Length) _fixtures = Path.GetFullPath(args[++i]);
            else if (args[i] == "--marker" && i + 1 < args.Length) _marker = args[++i];
            else if (args[i] == "--idle") _idle = true;
        }

        var hwnd = WindowNative.GetWindowHandle(this);
        var scale = GetDpiForWindow(hwnd) / 96.0;
        AppWindow.Resize(new SizeInt32((int)(1400 * scale), (int)(900 * scale)));

        Activated += OnFirstActivated;
        _ = LoadSafeAsync();
    }

    // CompositionTarget.Rendered fires after XAML has committed a frame to the compositor, so the first
    // callback after activation approximates first presentation.
    private void OnFirstActivated(object sender, WindowActivatedEventArgs e)
    {
        Activated -= OnFirstActivated;
        CompositionTarget.Rendered += OnRendered;
    }

    private void OnRendered(object? sender, RenderedEventArgs e)
    {
        // Wait for a frame that shows data: fixtures bound, Win2D chart drawn, first table row realized.
        if (!_markerArmed || !_dataBound || !Chart.HasDrawn || OrdersList.ContainerFromIndex(0) is null) return;
        _markerArmed = false;
        CompositionTarget.Rendered -= OnRendered;
        if (_marker is null) return;
        File.WriteAllText(_marker, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
    }

    private async Task LoadSafeAsync()
    {
        try { await LoadAsync(); }
        catch (Exception ex) { File.WriteAllText(Path.Combine(Path.GetTempPath(), "spike-winui3-error.txt"), ex.ToString()); }
    }

    private async Task LoadAsync()
    {
        _data = await Task.Run(() => Fixtures.Load(_fixtures));
        Chart.SetData(_data.T, _data.O, _data.H, _data.L, _data.C, _data.Sma);
        OrdersList.ItemsSource = new OrderList(_data.Orders);
        _transcript = string.Join("<<<MSG>>>", _data.Messages);
        _dataBound = true;

        // Show the transcript fully in --idle, otherwise start streaming.
        if (_idle)
        {
            foreach (var m in _data.Messages)
            {
                var p = NewCard();
                Markdown.Render(m, p);
            }
            return;
        }

        StartNewMessage();
        _chatTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };
        _chatTimer.Tick += ChatTick;
        _chatTimer.Start();
        _chartTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
        _chartTimer.Tick += ChartTick;
        _chartTimer.Start();
    }

    private StackPanel NewCard()
    {
        var panel = new StackPanel();
        ChatPanel.Children.Add(new Border
        {
            Background = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 0x21, 0x1B, 0x14)),
            BorderBrush = new SolidColorBrush(Windows.UI.Color.FromArgb(0x26, 0xF9, 0x73, 0x16)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(12, 10, 12, 4),
            Margin = new Thickness(0, 0, 0, 8),
            Child = panel,
        });
        return panel;
    }

    private void StartNewMessage()
    {
        _curPanel = NewCard();
        _curText.Clear();
    }

    private void ChatTick(object? sender, object e)
    {
        if (_paused || _data is null) return;
        if (_charPos >= _transcript.Length)
        {
            ChatPanel.Children.Clear();
            _charPos = 0;
            StartNewMessage();
            return;
        }

        var n = Math.Min(12, _transcript.Length - _charPos);
        var chunk = _transcript.AsSpan(_charPos, n);
        _charPos += n;

        // Split the chunk on the message separator, which may straddle chunk boundaries.
        _curText.Append(chunk);
        var s = _curText.ToString();
        var sep = s.IndexOf("<<<MSG>>>", StringComparison.Ordinal);
        if (sep >= 0)
        {
            Markdown.Render(s[..sep].Trim('\n'), _curPanel!);
            StartNewMessage();
            _curText.Append(s[(sep + 9)..]);
            s = _curText.ToString();
        }
        else if (s.EndsWith("<<<MSG>") || s.EndsWith("<<<MSG") || s.EndsWith("<<<MS") || s.EndsWith("<<<M") || s.EndsWith("<<<") || s.EndsWith("<<") || s.EndsWith("<"))
        {
            // partial separator: wait for next chunk
            s = s[..s.LastIndexOf('<')];
        }
        Markdown.Render(s.TrimStart('\n'), _curPanel!);
    }

    private void ChartTick(object? sender, object e)
    {
        if (_paused || _data is null) return;
        Chart.SetLastClose(_data.Ticks[_tickIdx++ % _data.Ticks.Length]);
        if (++_tickCount % 20 == 0) Chart.AppendCandle();
    }

    private void Pin(object sender, SizeChangedEventArgs e) =>
        ChatScroll.ChangeView(null, ChatScroll.ExtentHeight, null, true);

    // Pause button hover animation (150 ms) on background and border colors.
    private void Animate(bool hover)
    {
        var sb = new Storyboard();
        AddColor(sb, PauseBg, hover ? Windows.UI.Color.FromArgb(255, 0xF9, 0x73, 0x16) : Windows.UI.Color.FromArgb(0x26, 0xF9, 0x73, 0x16));
        AddColor(sb, PauseBorder, hover ? Windows.UI.Color.FromArgb(255, 0xF9, 0x73, 0x16) : Windows.UI.Color.FromArgb(0x26, 0xF9, 0x73, 0x16));
        sb.Begin();
    }

    private static void AddColor(Storyboard sb, SolidColorBrush brush, Windows.UI.Color to)
    {
        var a = new ColorAnimation { To = to, Duration = new Duration(TimeSpan.FromMilliseconds(150)) };
        Storyboard.SetTarget(a, brush);
        Storyboard.SetTargetProperty(a, "Color");
        sb.Children.Add(a);
    }

    private void PauseBtn_PointerEntered(object sender, PointerRoutedEventArgs e) => Animate(true);
    private void PauseBtn_PointerExited(object sender, PointerRoutedEventArgs e) => Animate(false);

    private void PauseBtn_Tapped(object sender, TappedRoutedEventArgs e)
    {
        _paused = !_paused;
        PauseText.Text = _paused ? "Resume" : "Pause";
    }
}
