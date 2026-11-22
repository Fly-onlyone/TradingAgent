using System.Collections.ObjectModel;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Rendering.Composition;
using Avalonia.Threading;

namespace SpikeAvalonia;

public partial class MainWindow : Window
{
	private readonly Task<Fixtures> _loading;
	private readonly ObservableCollection<ChatMessage> _messages = new();
	private readonly DispatcherTimer _chatTimer = new() { Interval = TimeSpan.FromMilliseconds(50) };
	private readonly DispatcherTimer _tickTimer = new() { Interval = TimeSpan.FromMilliseconds(250) };
	private Fixtures? _fx;
	private bool _paused;
	private int _msgIdx;
	private int _charPos;
	private int _tickIdx;
	private int _ticksSinceCandle;
	private bool _markerWritten;

	public MainWindow()
	{
		InitializeComponent();
		ChatList.ItemsSource = _messages;
		// Fixtures are parsed on a worker thread; the window shows immediately.
		var dir = Options.Current.FixturesDir;
		_loading = Task.Run(() => Fixtures.Load(dir));
		_chatTimer.Tick += (_, _) => ChatStep();
		_tickTimer.Tick += (_, _) => TickStep();
		Opened += OnOpened;
	}

	private async void OnOpened(object? sender, EventArgs e)
	{
		try
		{
			_fx = await _loading;
		}
		catch (Exception ex)
		{
			Title = "Spike - Avalonia (fixture load failed: " + ex.Message + ")";
			return;
		}
		Chart.SetData(_fx.Candles);
		OrdersList.ItemsSource = _fx.Orders;
		if (!Options.Current.Idle)
		{
			_chatTimer.Start();
			_tickTimer.Start();
		}
		WriteMarkerAfterDataFrame();
	}

	/// <summary>
	/// Called after fixtures are bound to chart and table. Waits one animation frame (layout + render of the
	/// data), then the compositor commit being applied on the render thread, then one more frame; then writes.
	/// </summary>
	private async void WriteMarkerAfterDataFrame()
	{
		var path = Options.Current.MarkerFile;
		if (path is null || _markerWritten) return;
		// Frame 1 runs layout and render for the newly bound chart candles and table rows.
		await NextFrame();
		var compositor = ElementComposition.GetElementVisual(this)?.Compositor;
		if (compositor != null) await compositor.RequestCommitAsync();
		await NextFrame();
		if (_markerWritten) return;
		_markerWritten = true;
		File.WriteAllText(path, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
	}

	private Task NextFrame()
	{
		var tcs = new TaskCompletionSource();
		RequestAnimationFrame(_ => tcs.TrySetResult());
		return tcs.Task;
	}

	private void OnPauseClick(object? sender, RoutedEventArgs e)
	{
		_paused = !_paused;
		PauseButton.Content = _paused ? "Resume" : "Pause";
		if (_fx == null || Options.Current.Idle) return;
		if (_paused)
		{
			_chatTimer.Stop();
			_tickTimer.Stop();
		}
		else
		{
			_chatTimer.Start();
			_tickTimer.Start();
		}
	}

	private void ChatStep()
	{
		var msgs = _fx!.Messages;
		if (msgs.Length == 0) return;
		if (_msgIdx >= msgs.Length)
		{
			_messages.Clear();
			_msgIdx = 0;
			_charPos = 0;
		}
		var src = msgs[_msgIdx];
		if (_charPos == 0) _messages.Add(new ChatMessage());
		var n = Math.Min(12, src.Length - _charPos);
		_messages[^1].Text += src.Substring(_charPos, n);
		_charPos += n;
		if (_charPos >= src.Length)
		{
			_msgIdx++;
			_charPos = 0;
		}
		Dispatcher.UIThread.Post(ChatScroll.ScrollToEnd, DispatcherPriority.Loaded);
	}

	private void TickStep()
	{
		var fx = _fx!;
		var c = fx.Candles;
		if (c.Count == 0 || fx.Ticks.Length == 0) return;
		var price = fx.Ticks[_tickIdx++ % fx.Ticks.Length];
		var last = c[^1];
		last.C = price;
		if (price > last.H) last.H = price;
		if (price < last.L) last.L = price;
		c[^1] = last;

		if (++_ticksSinceCandle >= fx.CandleEvery)
		{
			_ticksSinceCandle = 0;
			var follow = Chart.IsFollowing;
			var next = new Candle { T = last.T + fx.IntervalSeconds, O = last.C, H = last.C, L = last.C, C = last.C };
			c.Add(next);
			var sum = 0.0;
			var from = Math.Max(0, c.Count - 20);
			for (var i = from; i < c.Count; i++) sum += c[i].C;
			next.Sma = sum / (c.Count - from);
			c[^1] = next;
			Chart.AppendedCandle(follow);
		}
		else
		{
			Chart.InvalidateVisual();
		}
	}
}
