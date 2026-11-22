using Microsoft.Graphics.Canvas;
using Microsoft.Graphics.Canvas.Text;
using Microsoft.Graphics.Canvas.UI.Xaml;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Windows.Foundation;
using Windows.UI;

namespace SpikeWinUI3;

/// <summary>Hand-drawn candlestick chart on a Win2D CanvasControl. Wheel zooms, drag pans.</summary>
public sealed partial class CandleChart : Grid
{
    private static readonly Color Bull = Color.FromArgb(255, 0x10, 0xB9, 0x81);
    private static readonly Color Bear = Color.FromArgb(255, 0xEF, 0x44, 0x44);
    private static readonly Color Accent = Color.FromArgb(255, 0xF9, 0x73, 0x16);
    private static readonly Color GridLine = Color.FromArgb(0x4D, 88, 68, 36);
    private static readonly Color Muted = Color.FromArgb(255, 0xB8, 0xA8, 0x94);

    private const float AxisW = 70, AxisH = 24, Pad = 10;

    private readonly CanvasControl _canvas = new();
    private readonly CanvasTextFormat _right = new() { FontSize = 12, HorizontalAlignment = CanvasHorizontalAlignment.Right, VerticalAlignment = CanvasVerticalAlignment.Center };
    private readonly CanvasTextFormat _center = new() { FontSize = 12, HorizontalAlignment = CanvasHorizontalAlignment.Center };

    private List<double> _t = new(), _o = new(), _h = new(), _l = new(), _c = new(), _s = new();
    private double _start, _count = 200;
    private bool _dragging;
    private double _dragX;

    public CandleChart()
    {
        Children.Add(_canvas);
        _canvas.Draw += OnDraw;
        _canvas.PointerWheelChanged += OnWheel;
        _canvas.PointerPressed += (s, e) => { _dragging = true; _dragX = e.GetCurrentPoint(_canvas).Position.X; _canvas.CapturePointer(e.Pointer); };
        _canvas.PointerReleased += (s, e) => { _dragging = false; _canvas.ReleasePointerCapture(e.Pointer); };
        _canvas.PointerMoved += OnMove;
        _canvas.SizeChanged += (s, e) => _canvas.Invalidate();
    }

    private int N => _t.Count;

    /// <summary>True once the Win2D Draw handler has painted candles at least once.</summary>
    public bool HasDrawn { get; private set; }

    public void SetData(List<double> t, List<double> o, List<double> h, List<double> l, List<double> c, List<double> s)
    {
        _t = t; _o = o; _h = h; _l = l; _c = c; _s = s;
        _count = Math.Min(200, N);
        _start = N - _count;
        _canvas.Invalidate();
    }

    public void SetLastClose(double price)
    {
        var i = N - 1;
        _c[i] = price;
        if (price > _h[i]) _h[i] = price;
        if (price < _l[i]) _l[i] = price;
        _canvas.Invalidate();
    }

    public void AppendCandle()
    {
        var i = N - 1;
        var follow = _start + _count >= N - 0.01;
        var open = _c[i];
        _t.Add(_t[i] + 60); _o.Add(open); _h.Add(open); _l.Add(open); _c.Add(open);
        double sum = 0;
        var from = Math.Max(0, N - 20);
        for (var k = from; k < N; k++) sum += _c[k];
        _s.Add(sum / (N - from));
        if (follow) _start = N - _count;
        _canvas.Invalidate();
    }

    private void OnWheel(object sender, PointerRoutedEventArgs e)
    {
        var delta = e.GetCurrentPoint(_canvas).Properties.MouseWheelDelta;
        var x = e.GetCurrentPoint(_canvas).Position.X;
        var plotW = Math.Max(1, _canvas.ActualWidth - AxisW - Pad);
        var frac = Math.Clamp((x - Pad) / plotW, 0, 1);
        var anchor = _start + frac * _count;
        _count = Math.Clamp(_count * (delta > 0 ? 0.85 : 1 / 0.85), Math.Min(20, N), N);
        _start = anchor - frac * _count;
        Clamp();
        _canvas.Invalidate();
        e.Handled = true;
    }

    private void OnMove(object sender, PointerRoutedEventArgs e)
    {
        if (!_dragging) return;
        var x = e.GetCurrentPoint(_canvas).Position.X;
        var plotW = Math.Max(1, _canvas.ActualWidth - AxisW - Pad);
        _start -= (x - _dragX) / plotW * _count;
        _dragX = x;
        Clamp();
        _canvas.Invalidate();
    }

    private void Clamp() => _start = Math.Clamp(_start, 0, Math.Max(0, N - _count));

    private void OnDraw(CanvasControl sender, CanvasDrawEventArgs args)
    {
        var ds = args.DrawingSession;
        if (N == 0) return;
        HasDrawn = true;
        float w = (float)sender.ActualWidth, h = (float)sender.ActualHeight;
        float pl = Pad, pt = Pad, pw = w - AxisW - Pad, ph = h - AxisH - Pad;
        if (pw < 10 || ph < 10) return;

        int i0 = Math.Max(0, (int)Math.Floor(_start)), i1 = Math.Min(N - 1, (int)Math.Ceiling(_start + _count));
        double lo = double.MaxValue, hi = double.MinValue;
        for (var i = i0; i <= i1; i++)
        {
            if (_l[i] < lo) lo = _l[i];
            if (_h[i] > hi) hi = _h[i];
        }
        var pad = (hi - lo) * 0.06 + 1e-9;
        lo -= pad; hi += pad;

        float X(double idx) => pl + (float)((idx + 0.5 - _start) / _count) * pw;
        float Y(double p) => pt + (float)((hi - p) / (hi - lo)) * ph;

        // horizontal grid + price labels
        for (var g = 0; g <= 6; g++)
        {
            var p = lo + (hi - lo) * g / 6;
            var y = Y(p);
            ds.DrawLine(pl, y, pl + pw, y, GridLine, 1);
            ds.DrawText(p.ToString("0.00"), new Rect(pl + pw + 2, y - 8, AxisW - 6, 16), Muted, _right);
        }

        // vertical grid + time labels
        var step = Math.Max(1, (int)Math.Round(_count / Math.Max(1, pw / 110)));
        for (var i = (i0 / step) * step; i <= i1; i += step)
        {
            var x = X(i);
            if (x < pl || x > pl + pw) continue;
            ds.DrawLine(x, pt, x, pt + ph, GridLine, 1);
            var tm = DateTimeOffset.FromUnixTimeSeconds((long)_t[i]).UtcDateTime;
            ds.DrawText(tm.ToString("MM-dd HH:mm"), new Rect(x - 40, pt + ph + 4, 80, 16), Muted, _center);
        }

        var cw = Math.Max(1f, pw / (float)_count * 0.7f);
        using (ds.CreateLayer(1f, new Rect(pl, pt, pw, ph)))
        {
            for (var i = i0; i <= i1; i++)
            {
                var col = _c[i] >= _o[i] ? Bull : Bear;
                var x = X(i);
                ds.DrawLine(x, Y(_h[i]), x, Y(_l[i]), col, 1);
                var yo = Y(_o[i]); var yc = Y(_c[i]);
                var top = Math.Min(yo, yc);
                ds.FillRectangle(x - cw / 2, top, cw, Math.Max(1f, Math.Abs(yo - yc)), col);
            }

            for (var i = Math.Max(i0, 1); i <= i1; i++)
                ds.DrawLine(X(i - 1), Y(_s[i - 1]), X(i), Y(_s[i]), Accent, 1.5f);
        }

        // last price marker
        var ly = Y(_c[N - 1]);
        if (ly >= pt && ly <= pt + ph)
            ds.DrawText(_c[N - 1].ToString("0.00"), new Rect(pl + pw + 2, ly - 8, AxisW - 6, 16), _c[N - 1] >= _o[N - 1] ? Bull : Bear, _right);
    }
}
