using System.ComponentModel;
using System.Globalization;
using System.Text.Json;
using Avalonia.Media;
using Avalonia.Media.Immutable;

namespace SpikeAvalonia;

public struct Candle
{
	public long T;
	public double O, H, L, C, V, Sma;
}

public sealed class OrderRow
{
	private static readonly IBrush Buy = new ImmutableSolidColorBrush(Color.Parse("#10B981"));
	private static readonly IBrush Sell = new ImmutableSolidColorBrush(Color.Parse("#EF4444"));
	private static readonly DateTime Epoch = new(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

	public string Id { get; init; } = "";
	public long Time { get; init; }
	public string Symbol { get; init; } = "";
	public string Side { get; init; } = "";
	public string Type { get; init; } = "";
	public double Price { get; init; }
	public double Size { get; init; }
	public double Filled { get; init; }
	public string Status { get; init; } = "";

	public string TimeText => Epoch.AddSeconds(Time).ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
	public string PriceText => Price.ToString("F2", CultureInfo.InvariantCulture);
	public string SizeText => Size.ToString("F4", CultureInfo.InvariantCulture);
	public string FilledText => Filled.ToString("F4", CultureInfo.InvariantCulture);
	public IBrush SideBrush => Side == "buy" ? Buy : Sell;
}

public sealed class ChatMessage : INotifyPropertyChanged
{
	private string _text = "";

	public string Text
	{
		get => _text;
		set
		{
			if (_text == value) return;
			_text = value;
			PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Text)));
		}
	}

	public event PropertyChangedEventHandler? PropertyChanged;
}

public sealed class Fixtures
{
	public List<Candle> Candles { get; private set; } = new();
	public double[] Ticks { get; private set; } = Array.Empty<double>();
	public int CandleEvery { get; private set; } = 20;
	public int IntervalSeconds { get; private set; } = 60;
	public List<OrderRow> Orders { get; private set; } = new();
	public string[] Messages { get; private set; } = Array.Empty<string>();

	public static Fixtures Load(string dir)
	{
		var f = new Fixtures();

		using (var doc = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(dir, "candles.json"))))
		{
			f.IntervalSeconds = doc.RootElement.GetProperty("interval_s").GetInt32();
			var rows = doc.RootElement.GetProperty("rows");
			var list = new List<Candle>(rows.GetArrayLength() + 4096);
			foreach (var r in rows.EnumerateArray())
			{
				list.Add(new Candle
				{
					T = r[0].GetInt64(), O = r[1].GetDouble(), H = r[2].GetDouble(), L = r[3].GetDouble(),
					C = r[4].GetDouble(), V = r[5].GetDouble(), Sma = r[6].GetDouble(),
				});
			}
			f.Candles = list;
		}

		using (var doc = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(dir, "ticks.json"))))
		{
			f.CandleEvery = doc.RootElement.GetProperty("candle_every").GetInt32();
			var p = doc.RootElement.GetProperty("prices");
			var arr = new double[p.GetArrayLength()];
			var i = 0;
			foreach (var e in p.EnumerateArray()) arr[i++] = e.GetDouble();
			f.Ticks = arr;
		}

		using (var doc = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(dir, "orders.json"))))
		{
			var rows = doc.RootElement.GetProperty("rows");
			var list = new List<OrderRow>(rows.GetArrayLength());
			foreach (var r in rows.EnumerateArray())
			{
				list.Add(new OrderRow
				{
					Id = r[0].GetString() ?? "", Time = r[1].GetInt64(), Symbol = r[2].GetString() ?? "",
					Side = r[3].GetString() ?? "", Type = r[4].GetString() ?? "", Price = r[5].GetDouble(),
					Size = r[6].GetDouble(), Filled = r[7].GetDouble(), Status = r[8].GetString() ?? "",
				});
			}
			f.Orders = list;
		}

		var md = File.ReadAllText(Path.Combine(dir, "transcript.md")).Replace("\r\n", "\n");
		var parts = md.Split("<<<MSG>>>", StringSplitOptions.None);
		f.Messages = parts.Select(s => s.Trim('\n')).Where(s => s.Length > 0).ToArray();
		return f;
	}
}
