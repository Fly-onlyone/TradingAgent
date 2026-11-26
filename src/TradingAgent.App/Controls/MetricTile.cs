using System.Globalization;
using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using TradingAgent.App.Motion;
using TradingAgent.App.Theme;

namespace TradingAgent.App.Controls;

/// <summary>The colour a figure is shown in: the theme's own, or what the figure means.</summary>
public enum MetricTone
{
    Primary,
    Success,
    Warning,
    Error,
    Neutral,
}

/// <summary>How a tile lays out its figure.</summary>
public enum MetricKind
{
    /// <summary>One large figure, with a line under it when there is one.</summary>
    Kpi,

    /// <summary>A figure with what it changed by, and a small chart or a line under it.</summary>
    Delta,

    /// <summary>An icon in a tinted square beside the figure and a line under it.</summary>
    Trend,
}

/// <summary>
/// A tile with one figure of the account or the trades: a small label, the figure, and what goes
/// with it. The tile's left edge, its corner and its icon take the colour of <see cref="Tone"/>.
/// </summary>
/// <remarks>
/// A port of the metric tiles of the previous UI. When <see cref="Value"/> changes the tile flashes
/// once, so a figure that moved is seen. The colours are worked out here from the theme's, because
/// each tile needs its tone at six strengths and the theme does not carry them for every tone.
/// </remarks>
public sealed class MetricTile : TemplatedControl
{
    public static readonly StyledProperty<string?> LabelProperty =
        AvaloniaProperty.Register<MetricTile, string?>(nameof(Label), coerce: (_, value) => value?.ToUpperInvariant());

    public static readonly StyledProperty<string?> ValueProperty =
        AvaloniaProperty.Register<MetricTile, string?>(nameof(Value));

    public static readonly StyledProperty<string?> SubtitleProperty =
        AvaloniaProperty.Register<MetricTile, string?>(nameof(Subtitle));

    public static readonly StyledProperty<MetricTone> ToneProperty =
        AvaloniaProperty.Register<MetricTile, MetricTone>(nameof(Tone));

    public static readonly StyledProperty<MetricKind> KindProperty =
        AvaloniaProperty.Register<MetricTile, MetricKind>(nameof(Kind));

    public static readonly StyledProperty<Geometry?> IconProperty =
        AvaloniaProperty.Register<MetricTile, Geometry?>(nameof(Icon));

    /// <summary>What the figure changed by, in percent. Empty when that is not known.</summary>
    public static readonly StyledProperty<double?> ChangeProperty =
        AvaloniaProperty.Register<MetricTile, double?>(nameof(Change));

    public static readonly StyledProperty<IReadOnlyList<double>?> SparkProperty =
        AvaloniaProperty.Register<MetricTile, IReadOnlyList<double>?>(nameof(Spark));

    public static readonly StyledProperty<bool> IsLoadingProperty =
        AvaloniaProperty.Register<MetricTile, bool>(nameof(IsLoading));

    /// <summary>True when the digits of the figure roll into place.</summary>
    public static readonly StyledProperty<bool> IsRollingProperty =
        AvaloniaProperty.Register<MetricTile, bool>(nameof(IsRolling));

    public static readonly DirectProperty<MetricTile, IBrush?> ToneBrushProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, IBrush?>(nameof(ToneBrush), tile => tile.ToneBrush);

    public static readonly DirectProperty<MetricTile, IBrush?> ToneSoftBrushProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, IBrush?>(nameof(ToneSoftBrush), tile => tile.ToneSoftBrush);

    public static readonly DirectProperty<MetricTile, IBrush?> TonePillBrushProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, IBrush?>(nameof(TonePillBrush), tile => tile.TonePillBrush);

    public static readonly DirectProperty<MetricTile, IBrush?> ToneBorderBrushProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, IBrush?>(nameof(ToneBorderBrush), tile => tile.ToneBorderBrush);

    public static readonly DirectProperty<MetricTile, IBrush?> HoverBorderBrushProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, IBrush?>(nameof(HoverBorderBrush), tile => tile.HoverBorderBrush);

    public static readonly DirectProperty<MetricTile, IBrush?> StripBrushProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, IBrush?>(nameof(StripBrush), tile => tile.StripBrush);

    public static readonly DirectProperty<MetricTile, IBrush?> GlowBrushProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, IBrush?>(nameof(GlowBrush), tile => tile.GlowBrush);

    public static readonly DirectProperty<MetricTile, IBrush?> FlashBrushProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, IBrush?>(nameof(FlashBrush), tile => tile.FlashBrush);

    public static readonly DirectProperty<MetricTile, IBrush?> ValueBrushProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, IBrush?>(nameof(ValueBrush), tile => tile.ValueBrush);

    public static readonly DirectProperty<MetricTile, Color> ToneColorProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, Color>(nameof(ToneColor), tile => tile.ToneColor);

    public static readonly DirectProperty<MetricTile, BoxShadows> HoverShadowProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, BoxShadows>(nameof(HoverShadow), tile => tile.HoverShadow);

    public static readonly DirectProperty<MetricTile, string?> ChangeTextProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, string?>(nameof(ChangeText), tile => tile.ChangeText);

    public static readonly DirectProperty<MetricTile, bool> IsFallingProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, bool>(nameof(IsFalling), tile => tile.IsFalling);

    public static readonly DirectProperty<MetricTile, bool> HasSparkProperty =
        AvaloniaProperty.RegisterDirect<MetricTile, bool>(nameof(HasSpark), tile => tile.HasSpark);

    private static readonly Easing _easeInOut = new SplineEasing(0.42, 0, 0.58, 1);

    private IBrush? _toneBrush;
    private IBrush? _toneSoftBrush;
    private IBrush? _tonePillBrush;
    private IBrush? _toneBorderBrush;
    private IBrush? _hoverBorderBrush;
    private IBrush? _stripBrush;
    private IBrush? _glowBrush;
    private IBrush? _flashBrush;
    private IBrush? _valueBrush;
    private Color _toneColor;
    private BoxShadows _hoverShadow;
    private string? _changeText;
    private bool _isFalling;
    private bool _hasSpark;
    private Control? _flash;
    private IDisposable? _flashing;

    static MetricTile()
    {
        ToneProperty.Changed.AddClassHandler<MetricTile>((tile, _) => tile.Paint());
        ChangeProperty.Changed.AddClassHandler<MetricTile>((tile, _) => tile.Paint());
        KindProperty.Changed.AddClassHandler<MetricTile>((tile, _) => tile.Paint());
        SparkProperty.Changed.AddClassHandler<MetricTile>((tile, _) => tile.SetAndRaise(HasSparkProperty, ref tile._hasSpark, tile.Spark is { Count: >= 2 }));
        ValueProperty.Changed.AddClassHandler<MetricTile>((tile, change) =>
        {
            // The first figure is not a change, and neither is the one that ends the loading.
            if (change.OldValue is string { Length: > 0 } && !tile.IsLoading)
            {
                tile.Flash();
            }
        });
    }

    public string? Label
    {
        get => GetValue(LabelProperty);
        set => SetValue(LabelProperty, value);
    }

    public string? Value
    {
        get => GetValue(ValueProperty);
        set => SetValue(ValueProperty, value);
    }

    public string? Subtitle
    {
        get => GetValue(SubtitleProperty);
        set => SetValue(SubtitleProperty, value);
    }

    public MetricTone Tone
    {
        get => GetValue(ToneProperty);
        set => SetValue(ToneProperty, value);
    }

    public MetricKind Kind
    {
        get => GetValue(KindProperty);
        set => SetValue(KindProperty, value);
    }

    public Geometry? Icon
    {
        get => GetValue(IconProperty);
        set => SetValue(IconProperty, value);
    }

    public double? Change
    {
        get => GetValue(ChangeProperty);
        set => SetValue(ChangeProperty, value);
    }

    public IReadOnlyList<double>? Spark
    {
        get => GetValue(SparkProperty);
        set => SetValue(SparkProperty, value);
    }

    public bool IsLoading
    {
        get => GetValue(IsLoadingProperty);
        set => SetValue(IsLoadingProperty, value);
    }

    public bool IsRolling
    {
        get => GetValue(IsRollingProperty);
        set => SetValue(IsRollingProperty, value);
    }

    /// <summary>The tone at full strength: the icon, and the figure when it carries the tone.</summary>
    public IBrush? ToneBrush => _toneBrush;

    /// <summary>The tone at 14 %: behind an icon.</summary>
    public IBrush? ToneSoftBrush => _toneSoftBrush;

    /// <summary>The tone at 16 %: behind the change.</summary>
    public IBrush? TonePillBrush => _tonePillBrush;

    /// <summary>The tone at 30 %: around an icon.</summary>
    public IBrush? ToneBorderBrush => _toneBorderBrush;

    /// <summary>The tone at 35 %: around the tile under the pointer.</summary>
    public IBrush? HoverBorderBrush => _hoverBorderBrush;

    public IBrush? StripBrush => _stripBrush;

    public IBrush? GlowBrush => _glowBrush;

    public IBrush? FlashBrush => _flashBrush;

    /// <summary>The colour of the figure: the tone where the figure itself is good or bad news, else the text colour.</summary>
    public IBrush? ValueBrush => _valueBrush;

    public Color ToneColor => _toneColor;

    public BoxShadows HoverShadow => _hoverShadow;

    /// <summary>The change as "+1.25%".</summary>
    public string? ChangeText => _changeText;

    public bool IsFalling => _isFalling;

    public bool HasSpark => _hasSpark;

    protected override void OnApplyTemplate(TemplateAppliedEventArgs e)
    {
        base.OnApplyTemplate(e);
        _flash = e.NameScope.Find<Control>("PART_Flash");
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        ResourcesChanged += OnResourcesChanged;
        Paint();
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        ResourcesChanged -= OnResourcesChanged;
        _flashing?.Dispose();
        _flashing = null;
    }

    private void OnResourcesChanged(object? sender, ResourcesChangedEventArgs e) => Paint();

    private Color Find(string key, Color fallback) =>
        this.TryFindResource(key, out var found) && found is Color color ? color : fallback;

    /// <summary>Works out every colour of the tile from its tone and the theme in use.</summary>
    private void Paint()
    {
        var change = Change;
        // A tile that shows a change takes its tone from the change, as the previous UI did.
        var tone = Kind != MetricKind.Delta ? Tone
            : change is > 0 ? MetricTone.Success
            : change is < 0 ? MetricTone.Error
            : Tone;
        var main = tone switch
        {
            MetricTone.Success => Find("SuccessColor", Colors.Green),
            MetricTone.Warning => Find("WarningColor", Colors.Orange),
            MetricTone.Error => Find("ErrorColor", Colors.Red),
            MetricTone.Neutral => Find("TextSecondaryColor", Colors.Gray),
            _ => Find("PrimaryColor", Colors.Orange),
        };
        // Tints of "neutral" are made from the grey of the theme, not from the text colour.
        var tint = tone == MetricTone.Neutral ? Find("NeutralColor", main) : main;

        SetAndRaise(ToneColorProperty, ref _toneColor, main);
        SetAndRaise(ToneBrushProperty, ref _toneBrush, new ImmutableSolidColorBrush(main));
        SetAndRaise(ToneSoftBrushProperty, ref _toneSoftBrush, new ImmutableSolidColorBrush(ThemeBuilder.Alpha(tint, 0.14)));
        SetAndRaise(TonePillBrushProperty, ref _tonePillBrush, new ImmutableSolidColorBrush(ThemeBuilder.Alpha(tint, 0.16)));
        SetAndRaise(ToneBorderBrushProperty, ref _toneBorderBrush, new ImmutableSolidColorBrush(ThemeBuilder.Alpha(tint, 0.3)));
        SetAndRaise(HoverBorderBrushProperty, ref _hoverBorderBrush, new ImmutableSolidColorBrush(ThemeBuilder.Alpha(tint, 0.35)));
        SetAndRaise(StripBrushProperty, ref _stripBrush, new ImmutableLinearGradientBrush(
            [new ImmutableGradientStop(0, ThemeBuilder.Alpha(tint, 0.85)), new ImmutableGradientStop(1, ThemeBuilder.Alpha(tint, 0.1))],
            startPoint: new RelativePoint(0, 0, RelativeUnit.Relative),
            endPoint: new RelativePoint(0, 1, RelativeUnit.Relative)));
        // The glow of the previous UI was a disc that fades out at 65 % of its radius, blurred by
        // 10 px. The blur only softens where the fade ends, so the fade is drawn a little longer.
        SetAndRaise(GlowBrushProperty, ref _glowBrush, new ImmutableRadialGradientBrush(
            [new ImmutableGradientStop(0, ThemeBuilder.Alpha(tint, 0.2)), new ImmutableGradientStop(0.72, ThemeBuilder.Alpha(tint, 0))],
            radiusX: new RelativeScalar(0.5, RelativeUnit.Relative),
            radiusY: new RelativeScalar(0.5, RelativeUnit.Relative)));

        var flash = Kind != MetricKind.Delta || change is null or 0 ? tint
            : change > 0 ? Find("BullishColor", tint)
            : Find("BearishColor", tint);
        SetAndRaise(FlashBrushProperty, ref _flashBrush, new ImmutableSolidColorBrush(ThemeBuilder.Alpha(flash, 0.12)));

        var toned = Kind == MetricKind.Trend || (Kind == MetricKind.Delta && change is not (null or 0));
        SetAndRaise(ValueBrushProperty, ref _valueBrush, toned ? _toneBrush : new ImmutableSolidColorBrush(Find("TextPrimaryColor", Colors.White)));

        // The same number of layers, in the same order, as the shadow of a card at rest: a
        // transition between two shadows needs that.
        SetAndRaise(HoverShadowProperty, ref _hoverShadow, ThemeBuilder.Shadows(
            ThemeBuilder.Drop(0, 12, 32, 0, ThemeBuilder.Alpha(Colors.Black, 0.35)),
            ThemeBuilder.Drop(0, 0, 24, 0, ThemeBuilder.Alpha(tint, 0.18)),
            ThemeBuilder.Inset(0, 1, 0, 0, ThemeBuilder.Alpha(Colors.White, 0)),
            ThemeBuilder.Inset(0, 0, 30, 0, ThemeBuilder.Alpha(tint, 0))));

        SetAndRaise(IsFallingProperty, ref _isFalling, change is < 0);
        SetAndRaise(ChangeTextProperty, ref _changeText, change is { } value
            ? string.Create(CultureInfo.CurrentCulture, $"{(value >= 0 ? "+" : string.Empty)}{value:0.00}%")
            : null);
    }

    /// <summary>Lights the tile for 0.6 s: the figure changed.</summary>
    private void Flash()
    {
        if (_flash is not { } flash)
        {
            return;
        }

        _flashing?.Dispose();
        _flashing = FrameDriver.Run(flash, seconds =>
        {
            if (seconds >= 0.6)
            {
                flash.Opacity = 0;
                return false;
            }

            // Up in the first half, down in the second, each with an ease in and out.
            var half = seconds / 0.3;
            flash.Opacity = half <= 1 ? _easeInOut.Ease(half) : 1 - _easeInOut.Ease(half - 1);
            return true;
        });
    }
}
