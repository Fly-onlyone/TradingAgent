using System.Text.Json;
using Microsoft.UI;
using Microsoft.UI.Xaml.Media;

namespace SpikeWinUI3;

/// <summary>Order table row; strings are pre-formatted so realized rows only bind.</summary>
[global::WinRT.GeneratedBindableCustomProperty]
public sealed partial class OrderRow
{
    private static readonly SolidColorBrush Buy = new(Windows.UI.Color.FromArgb(255, 0x10, 0xB9, 0x81));
    private static readonly SolidColorBrush Sell = new(Windows.UI.Color.FromArgb(255, 0xEF, 0x44, 0x44));

    public string Id { get; init; } = "";
    public string Time { get; init; } = "";
    public string Symbol { get; init; } = "";
    public string Side { get; init; } = "";
    public string Type { get; init; } = "";
    public string Price { get; init; } = "";
    public string Size { get; init; } = "";
    public string Filled { get; init; } = "";
    public string Status { get; init; } = "";
    public Brush SideBrush => Side == "buy" ? Buy : Sell;
}

public sealed class Fixtures
{
    public List<double> T = new(), O = new(), H = new(), L = new(), C = new(), Sma = new();
    public double[] Ticks = [];
    public List<OrderRow> Orders = new();
    public List<string> Messages = new();

    public static Fixtures Load(string dir)
    {
        var f = new Fixtures();

        using (var doc = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(dir, "candles.json"))))
        {
            foreach (var r in doc.RootElement.GetProperty("rows").EnumerateArray())
            {
                f.T.Add(r[0].GetDouble());
                f.O.Add(r[1].GetDouble());
                f.H.Add(r[2].GetDouble());
                f.L.Add(r[3].GetDouble());
                f.C.Add(r[4].GetDouble());
                f.Sma.Add(r[6].GetDouble());
            }
        }

        using (var doc = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(dir, "ticks.json"))))
        {
            f.Ticks = doc.RootElement.GetProperty("prices").EnumerateArray().Select(p => p.GetDouble()).ToArray();
        }

        using (var doc = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(dir, "orders.json"))))
        {
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            foreach (var r in doc.RootElement.GetProperty("rows").EnumerateArray())
            {
                f.Orders.Add(new OrderRow
                {
                    Id = r[0].GetString() ?? "",
                    Time = DateTimeOffset.FromUnixTimeSeconds(r[1].GetInt64()).UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss", inv),
                    Symbol = r[2].GetString() ?? "",
                    Side = r[3].GetString() ?? "",
                    Type = r[4].GetString() ?? "",
                    Price = r[5].GetDouble().ToString("0.00", inv),
                    Size = r[6].GetDouble().ToString("0.0000", inv),
                    Filled = r[7].GetDouble().ToString("0.0000", inv),
                    Status = r[8].GetString() ?? "",
                });
            }
        }

        var text = File.ReadAllText(Path.Combine(dir, "transcript.md")).Replace("\r\n", "\n");
        f.Messages.AddRange(text.Split("<<<MSG>>>").Select(s => s.Trim('\n')));
        return f;
    }
}

/// <summary>
/// Non-generic read-only IList so CsWinRT can marshal it as IBindableVector under Native AOT
/// (a generic List of a non-WinRT element type fails with ArgumentException at ItemsSource).
/// </summary>
[global::WinRT.GeneratedBindableCustomProperty]
public sealed partial class OrderList : System.Collections.IList, System.Collections.Specialized.INotifyCollectionChanged
{
    private readonly List<OrderRow> _items;
    public OrderList(List<OrderRow> items) => _items = items;

    public event System.Collections.Specialized.NotifyCollectionChangedEventHandler? CollectionChanged { add { } remove { } }

    public object? this[int index] { get => _items[index]; set => throw new NotSupportedException(); }
    public bool IsFixedSize => true;
    public bool IsReadOnly => true;
    public int Count => _items.Count;
    public bool IsSynchronized => false;
    public object SyncRoot => this;
    public int Add(object? value) => throw new NotSupportedException();
    public void Clear() => throw new NotSupportedException();
    public bool Contains(object? value) => value is OrderRow r && _items.Contains(r);
    public void CopyTo(Array array, int index) => ((System.Collections.IList)_items).CopyTo(array, index);
    public System.Collections.IEnumerator GetEnumerator() => _items.GetEnumerator();
    public int IndexOf(object? value) => value is OrderRow r ? _items.IndexOf(r) : -1;
    public void Insert(int index, object? value) => throw new NotSupportedException();
    public void Remove(object? value) => throw new NotSupportedException();
    public void RemoveAt(int index) => throw new NotSupportedException();
}
