using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Immutable;

namespace SpikeAvalonia;

/// <summary>
/// Hand-drawn candlestick chart on Avalonia's DrawingContext (Skia). Wheel zooms around the cursor,
/// left-drag pans, and the view follows the newest candle while it sits at the right edge.
/// </summary>
public sealed class CandleChart : Control
{
	private static readonly Color BullC = Color.Parse("#10B981");
	private static readonly Color BearC = Color.Parse("#EF4444");
	private static readonly IBrush BullBrush = new ImmutableSolidColorBrush(BullC);
	private static readonly IBrush BearBrush = new ImmutableSolidColorBrush(BearC);
	private static readonly IBrush TextBrush = new ImmutableSolidColorBrush(Color.Parse("#B8A894"));
	private static readonly IPen BullPen = new Pen(BullBrush, 1);
	private static readonly IPen BearPen = new Pen(BearBrush, 1);
	private static readonly IPen GridPen =
		new Pen(new ImmutableSolidColorBrush(Color.FromArgb(77, 88, 68, 36)), 1);
	private static readonly IPen SmaPen =
		new Pen(new ImmutableSolidColorBrush(Color.Parse("#F97316")), 1.5);
	private static readonly IPen AxisPen =
		new Pen(new ImmutableSolidColorBrush(Color.Parse("#26F97316")), 1);
	private static readonly DateTime Epoch = new(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

	private const double PriceAxisW = 72;
	private const double TimeAxisH = 24;
	private const double Pad = 8;

	private List<Candle> _c = new();
	private double _viewStart;
	private double _visible = 200;
	private bool _dragging;
	private double _dragX;

	public void SetData(List<Candle> candles)
	{
		_c = candles;
		_visible = 200;
		_viewStart = _c.Count - _visible + 3;
		InvalidateVisual();
	}

	private bool Following => _viewStart + _visible >= _c.Count - 0.5;

	/// <summary>Call before the list grows so the view can keep following the right edge.</summary>
	public void AppendedCandle(bool wasFollowing)
	{
		if (wasFollowing) _viewStart += 1;
		InvalidateVisual();
	}

	public bool IsFollowing => Following;

	private double PlotW => Math.Max(10, Bounds.Width - PriceAxisW - Pad);
	private double PlotH => Math.Max(10, Bounds.Height - TimeAxisH - Pad);

	protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
	{
		if (_c.Count == 0) return;
		var x = e.GetPosition(this).X - Pad;
		var frac = Math.Clamp(x / PlotW, 0, 1);
		var anchor = _viewStart + frac * _visible;
		var factor = e.Delta.Y > 0 ? 0.85 : 1 / 0.85;
		_visible = Math.Clamp(_visible * factor, 10, Math.Max(50, _c.Count * 1.2));
		_viewStart = anchor - frac * _visible;
		ClampView();
		InvalidateVisual();
		e.Handled = true;
	}

	protected override void OnPointerPressed(PointerPressedEventArgs e)
	{
		if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
		{
			_dragging = true;
			_dragX = e.GetPosition(this).X;
			e.Pointer.Capture(this);
		}
	}

	protected override void OnPointerMoved(PointerEventArgs e)
	{
		if (!_dragging) return;
		var x = e.GetPosition(this).X;
		var barW = PlotW / _visible;
		_viewStart -= (x - _dragX) / barW;
		_dragX = x;
		ClampView();
		InvalidateVisual();
	}

	protected override void OnPointerReleased(PointerReleasedEventArgs e)
	{
		if (_dragging)
		{
			_dragging = false;
			e.Pointer.Capture(null);
		}
	}

	private void ClampView()
	{
		_viewStart = Math.Clamp(_viewStart, -(_visible - 5), _c.Count - 5);
	}

	private static FormattedText Label(string s) =>
		new(s, CultureInfo.InvariantCulture, FlowDirection.LeftToRight, Typeface.Default, 11, TextBrush);

	public override void Render(DrawingContext ctx)
	{
		var w = Bounds.Width;
		var h = Bounds.Height;
		ctx.DrawRectangle(Brushes.Transparent, null, new Rect(0, 0, w, h)); // hit-test surface
		if (_c.Count == 0 || w < 100 || h < 80) return;

		var plotW = PlotW;
		var plotH = PlotH;
		var barW = plotW / _visible;
		var i0 = Math.Max(0, (int)Math.Floor(_viewStart));
		var i1 = Math.Min(_c.Count - 1, (int)Math.Ceiling(_viewStart + _visible));
		if (i1 < i0) return;

		var lo = double.MaxValue;
		var hi = double.MinValue;
		for (var i = i0; i <= i1; i++)
		{
			var c = _c[i];
			if (c.L < lo) lo = c.L;
			if (c.H > hi) hi = c.H;
		}
		var span = Math.Max(hi - lo, 1e-9);
		lo -= span * 0.06;
		hi += span * 0.06;
		var range = hi - lo;

		double Y(double p) => Pad + (hi - p) / range * plotH;
		double X(double i) => Pad + (i - _viewStart + 0.5) * barW;

		// price grid and labels (right axis)
		var raw = range / Math.Max(2, plotH / 56);
		var mag = Math.Pow(10, Math.Floor(Math.Log10(raw)));
		var step = mag;
		foreach (var m in new[] { 1.0, 2.0, 5.0, 10.0 })
		{
			step = mag * m;
			if (step >= raw) break;
		}
		for (var p = Math.Ceiling(lo / step) * step; p <= hi; p += step)
		{
			var y = Y(p);
			ctx.DrawLine(GridPen, new Point(Pad, y), new Point(Pad + plotW, y));
			var ft = Label(p.ToString("F2", CultureInfo.InvariantCulture));
			ctx.DrawText(ft, new Point(Pad + plotW + 6, y - ft.Height / 2));
		}

		// time grid and labels (bottom axis)
		var stepBars = 1;
		foreach (var sb in new[] { 1, 2, 5, 10, 15, 30, 60, 120, 240, 480, 720, 1440 })
		{
			stepBars = sb;
			if (sb * barW >= 96) break;
		}
		var first = (int)(Math.Ceiling(Math.Max(0, _viewStart) / stepBars) * stepBars);
		for (var i = first; i <= i1; i += stepBars)
		{
			var x = X(i);
			ctx.DrawLine(GridPen, new Point(x, Pad), new Point(x, Pad + plotH));
			var t = Epoch.AddSeconds(_c[i].T);
			var ft = Label(t.ToString(stepBars >= 60 ? "MM-dd HH:mm" : "HH:mm", CultureInfo.InvariantCulture));
			ctx.DrawText(ft, new Point(x - ft.Width / 2, Pad + plotH + 5));
		}
		ctx.DrawLine(AxisPen, new Point(Pad, Pad + plotH), new Point(Pad + plotW, Pad + plotH));
		ctx.DrawLine(AxisPen, new Point(Pad + plotW, Pad), new Point(Pad + plotW, Pad + plotH));

		using (ctx.PushClip(new Rect(Pad, Pad, plotW, plotH)))
		{
			var bodyW = Math.Max(1, barW * 0.7);
			for (var i = i0; i <= i1; i++)
			{
				var c = _c[i];
				var bull = c.C >= c.O;
				var x = X(i);
				ctx.DrawLine(bull ? BullPen : BearPen, new Point(x, Y(c.H)), new Point(x, Y(c.L)));
				var yo = Y(c.O);
				var yc = Y(c.C);
				var top = Math.Min(yo, yc);
				ctx.DrawRectangle(bull ? BullBrush : BearBrush, null,
					new Rect(x - bodyW / 2, top, bodyW, Math.Max(1, Math.Abs(yo - yc))));
			}

			var geo = new StreamGeometry();
			using (var g = geo.Open())
			{
				for (var i = i0; i <= i1; i++)
				{
					var pt = new Point(X(i), Y(_c[i].Sma));
					if (i == i0) g.BeginFigure(pt, false);
					else g.LineTo(pt);
				}
				g.EndFigure(false);
			}
			ctx.DrawGeometry(null, SmaPen, geo);
		}
	}
}
