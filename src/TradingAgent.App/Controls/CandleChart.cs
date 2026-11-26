using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.App.Controls;

/// <summary>
/// A candlestick chart with a 20-bar average, drawn by hand. The wheel zooms around the cursor, a
/// drag with the left button moves through time.
/// </summary>
/// <remarks>
/// Drawn directly instead of with a chart package: a package would have to pass the Native AOT build,
/// and this is all a price chart needs. Setting <see cref="Candles"/> again with newer bars of the
/// same history keeps the place the user looks at.
/// </remarks>
public sealed class CandleChart : Control
{
    public static readonly StyledProperty<IReadOnlyList<Candle>?> CandlesProperty =
        AvaloniaProperty.Register<CandleChart, IReadOnlyList<Candle>?>(nameof(Candles));

    private const double PriceAxisWidth = 84;
    private const double TimeAxisHeight = 24;
    private const double Padding = 8;
    private const int AveragePeriod = 20;

    // The colours of the theme in use; read again when the theme changes.
    private IBrush _bullBrush = Brushes.Green;
    private IBrush _bearBrush = Brushes.Red;
    private IBrush _textBrush = Brushes.Gray;
    private IPen _bullPen = new Pen(Brushes.Green, 1);
    private IPen _bearPen = new Pen(Brushes.Red, 1);
    private IPen _gridPen = new Pen(Brushes.Gray, 1);
    private IPen _averagePen = new Pen(Brushes.Orange, 1.5);
    private IPen _axisPen = new Pen(Brushes.Gray, 1);
    private Typeface _typeface = Typeface.Default;

    private Bar[] _bars = [];
    private double _viewStart;
    private double _visible = 150;
    private bool _dragging;
    private double _dragX;

    static CandleChart()
    {
        CandlesProperty.Changed.AddClassHandler<CandleChart>((chart, _) => chart.Load());
        AffectsRender<CandleChart>(CandlesProperty);
    }

    public IReadOnlyList<Candle>? Candles
    {
        get => GetValue(CandlesProperty);
        set => SetValue(CandlesProperty, value);
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        ResourcesChanged += OnResourcesChanged;
        ReadTheme();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        ResourcesChanged -= OnResourcesChanged;
    }

    private double PlotWidth => Math.Max(10, Bounds.Width - PriceAxisWidth - Padding);

    private double PlotHeight => Math.Max(10, Bounds.Height - TimeAxisHeight - Padding);

    public override void Render(DrawingContext context)
    {
        // The whole surface takes the pointer, also where nothing is drawn.
        context.DrawRectangle(Brushes.Transparent, null, new Rect(Bounds.Size));
        if (_bars.Length == 0 || Bounds.Width < 120 || Bounds.Height < 80)
        {
            return;
        }

        var plotWidth = PlotWidth;
        var plotHeight = PlotHeight;
        var barWidth = plotWidth / _visible;
        var first = Math.Max(0, (int)Math.Floor(_viewStart));
        var last = Math.Min(_bars.Length - 1, (int)Math.Ceiling(_viewStart + _visible));
        if (last < first)
        {
            return;
        }

        var low = double.MaxValue;
        var high = double.MinValue;
        for (var index = first; index <= last; index++)
        {
            low = Math.Min(low, _bars[index].Low);
            high = Math.Max(high, _bars[index].High);
        }

        var span = Math.Max(high - low, high * 1e-6);
        low -= span * 0.06;
        high += span * 0.06;
        var range = high - low;

        double Y(double price) => Padding + ((high - price) / range * plotHeight);
        double X(double index) => Padding + ((index - _viewStart + 0.5) * barWidth);

        // Price lines, at round steps.
        var rough = range / Math.Max(2, plotHeight / 56);
        var magnitude = Math.Pow(10, Math.Floor(Math.Log10(rough)));
        var step = magnitude;
        foreach (var multiple in (double[])[1, 2, 5, 10])
        {
            step = magnitude * multiple;
            if (step >= rough)
            {
                break;
            }
        }

        var decimals = Math.Clamp((int)Math.Ceiling(-Math.Log10(step)), 0, 8);
        for (var price = Math.Ceiling(low / step) * step; price <= high; price += step)
        {
            var y = Y(price);
            context.DrawLine(_gridPen, new Point(Padding, y), new Point(Padding + plotWidth, y));
            var label = Label(price.ToString("F" + decimals, CultureInfo.InvariantCulture));
            context.DrawText(label, new Point(Padding + plotWidth + 6, y - (label.Height / 2)));
        }

        // Time lines, far enough apart for their labels.
        var everyBars = 1;
        foreach (var candidate in (int[])[1, 2, 5, 10, 20, 50, 100, 200])
        {
            everyBars = candidate;
            if (candidate * barWidth >= 110)
            {
                break;
            }
        }

        var spanMs = _bars.Length > 1 ? _bars[1].Time - _bars[0].Time : 0;
        for (var index = (int)(Math.Ceiling(Math.Max(0, _viewStart) / everyBars) * everyBars); index <= last; index += everyBars)
        {
            var x = X(index);
            context.DrawLine(_gridPen, new Point(x, Padding), new Point(x, Padding + plotHeight));
            var time = DateTimeOffset.FromUnixTimeMilliseconds(_bars[index].Time).ToLocalTime();
            var label = Label(time.ToString(spanMs >= 86_400_000 ? "yyyy-MM-dd" : "MM-dd HH:mm", CultureInfo.InvariantCulture));
            context.DrawText(label, new Point(x - (label.Width / 2), Padding + plotHeight + 5));
        }

        context.DrawLine(_axisPen, new Point(Padding, Padding + plotHeight), new Point(Padding + plotWidth, Padding + plotHeight));
        context.DrawLine(_axisPen, new Point(Padding + plotWidth, Padding), new Point(Padding + plotWidth, Padding + plotHeight));

        using (context.PushClip(new Rect(Padding, Padding, plotWidth, plotHeight)))
        {
            var bodyWidth = Math.Max(1, barWidth * 0.7);
            for (var index = first; index <= last; index++)
            {
                var bar = _bars[index];
                var rising = bar.Close >= bar.Open;
                var x = X(index);
                context.DrawLine(rising ? _bullPen : _bearPen, new Point(x, Y(bar.High)), new Point(x, Y(bar.Low)));
                var open = Y(bar.Open);
                var close = Y(bar.Close);
                context.DrawRectangle(
                    rising ? _bullBrush : _bearBrush,
                    null,
                    new Rect(x - (bodyWidth / 2), Math.Min(open, close), bodyWidth, Math.Max(1, Math.Abs(open - close))));
            }

            var average = new StreamGeometry();
            using (var path = average.Open())
            {
                var started = false;
                for (var index = Math.Max(first, AveragePeriod - 1); index <= last; index++)
                {
                    var point = new Point(X(index), Y(_bars[index].Average));
                    if (!started)
                    {
                        path.BeginFigure(point, false);
                        started = true;
                    }
                    else
                    {
                        path.LineTo(point);
                    }
                }

                if (started)
                {
                    path.EndFigure(false);
                }
            }

            context.DrawGeometry(null, _averagePen, average);
        }
    }

    protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
    {
        base.OnPointerWheelChanged(e);
        if (_bars.Length == 0)
        {
            return;
        }

        var fraction = Math.Clamp((e.GetPosition(this).X - Padding) / PlotWidth, 0, 1);
        var anchor = _viewStart + (fraction * _visible);
        _visible = Math.Clamp(_visible * (e.Delta.Y > 0 ? 0.85 : 1 / 0.85), 10, Math.Max(50, _bars.Length * 1.2));
        _viewStart = anchor - (fraction * _visible);
        ClampView();
        InvalidateVisual();
        e.Handled = true;
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
        {
            _dragging = true;
            _dragX = e.GetPosition(this).X;
            e.Pointer.Capture(this);
        }
    }

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        if (!_dragging)
        {
            return;
        }

        var x = e.GetPosition(this).X;
        _viewStart -= (x - _dragX) / (PlotWidth / _visible);
        _dragX = x;
        ClampView();
        InvalidateVisual();
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        base.OnPointerReleased(e);
        if (_dragging)
        {
            _dragging = false;
            e.Pointer.Capture(null);
        }
    }

    private FormattedText Label(string text) =>
        new(text, CultureInfo.InvariantCulture, FlowDirection.LeftToRight, _typeface, 11, _textBrush);

    private void OnResourcesChanged(object? sender, ResourcesChangedEventArgs e)
    {
        ReadTheme();
        InvalidateVisual();
    }

    private void ReadTheme()
    {
        Color Find(string key, Color fallback) => this.TryFindResource(key, out var found) && found is Color color ? color : fallback;

        var primary = Find("PrimaryColor", Colors.Orange);
        _bullBrush = new ImmutableSolidColorBrush(Find("BullishColor", Colors.Green));
        _bearBrush = new ImmutableSolidColorBrush(Find("BearishColor", Colors.Red));
        _textBrush = new ImmutableSolidColorBrush(Find("TextSecondaryColor", Colors.Gray));
        _bullPen = new ImmutablePen(new ImmutableSolidColorBrush(Find("BullishColor", Colors.Green)), 1);
        _bearPen = new ImmutablePen(new ImmutableSolidColorBrush(Find("BearishColor", Colors.Red)), 1);
        _gridPen = new ImmutablePen(new ImmutableSolidColorBrush(Colors.White, 0.06), 1);
        _averagePen = new ImmutablePen(new ImmutableSolidColorBrush(primary), 1.5);
        _axisPen = new ImmutablePen(new ImmutableSolidColorBrush(primary, 0.15), 1);
        _typeface = this.TryFindResource("FontSans", out var font) && font is FontFamily family ? new Typeface(family) : Typeface.Default;
    }

    private void Load()
    {
        var candles = Candles ?? [];
        // Newer bars of the history already shown: keep the place the user looks at.
        var sameHistory = _bars.Length > 1 && candles.Count > 1
            && candles[0].OpenTime == _bars[0].Time && candles[1].OpenTime == _bars[1].Time;
        var following = _viewStart + _visible >= _bars.Length - 0.5;
        var grown = candles.Count - _bars.Length;

        var bars = new Bar[candles.Count];
        double sum = 0;
        for (var index = 0; index < candles.Count; index++)
        {
            var close = (double)candles[index].Close;
            sum += close;
            if (index >= AveragePeriod)
            {
                sum -= (double)candles[index - AveragePeriod].Close;
            }

            bars[index] = new Bar(
                candles[index].OpenTime,
                (double)candles[index].Open,
                (double)candles[index].High,
                (double)candles[index].Low,
                close,
                sum / Math.Min(index + 1, AveragePeriod));
        }

        _bars = bars;
        if (!sameHistory)
        {
            _visible = Math.Min(150, Math.Max(20, bars.Length));
            _viewStart = bars.Length - _visible + 3;
        }
        else if (following && grown > 0)
        {
            _viewStart += grown;
        }

        ClampView();
    }

    private void ClampView() => _viewStart = Math.Clamp(_viewStart, -(_visible - 5), Math.Max(0, _bars.Length - 5));

    private readonly record struct Bar(long Time, double Open, double High, double Low, double Close, double Average);
}
