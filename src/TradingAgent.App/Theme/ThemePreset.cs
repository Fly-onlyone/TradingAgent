using Avalonia.Media;

namespace TradingAgent.App.Theme;

/// <summary>A colour in its main, lighter and darker form, with the colour of text drawn on it.</summary>
public sealed record Tone(Color Main, Color Light, Color Dark, Color Contrast)
{
    public static Tone Of(string main, string light, string dark, string contrast = "#FFFFFF") =>
        new(Color.Parse(main), Color.Parse(light), Color.Parse(dark), Color.Parse(contrast));
}

/// <summary>The colours of the translucent surfaces, before their opacity is applied.</summary>
public sealed record SurfaceColors(Color Glass, Color Elevated, Color Sidebar, Color Tooltip, Color Muted, Color HoverCard);

/// <summary>Corner radius, blur and opacity of the glass surfaces.</summary>
public sealed record GlassShape(
    double BorderRadius,
    double CardBlur,
    double SidebarBlur,
    double CardOpacity,
    double ElevatedOpacity,
    double SidebarOpacity,
    double HeaderOpacity);

/// <summary>How many colour blobs drift behind the window and how long one round takes, in seconds.</summary>
public sealed record BlobMotion(int Count, double CycleMin, double CycleMax);

/// <summary>One colour stop of a gradient; the offset runs from 0 to 1.</summary>
public readonly record struct ColorStop(Color Color, double Offset);

/// <summary>
/// One look of the app: colours, corner radius, glass strength and background motion. The four presets
/// are the theme presets of the previous UI, value for value.
/// </summary>
/// <remarks>
/// Only what the previous UI really used is here. Its presets also held page spacing, elevation
/// shadows and per-theme animation timings that nothing read; they are left out so nobody tunes a
/// value that changes nothing.
/// </remarks>
public sealed record ThemePreset
{
    public const string DefaultId = "solar";

    public required string Id { get; init; }

    public required string Label { get; init; }

    public required Tone Primary { get; init; }

    public required Tone Secondary { get; init; }

    public required Tone Accent { get; init; }

    public required Color Background { get; init; }

    public required Color Paper { get; init; }

    public required Color TextPrimary { get; init; }

    public required Color TextSecondary { get; init; }

    public required Color TextDisabled { get; init; }

    public required SurfaceColors Surface { get; init; }

    public required Color ScrollbarThumb { get; init; }

    public required Color ScrollbarThumbHover { get; init; }

    public required Tone Success { get; init; }

    public required Tone Error { get; init; }

    public required Tone Warning { get; init; }

    public required Tone Info { get; init; }

    public required Color Bullish { get; init; }

    public required Color Bearish { get; init; }

    public required Color Volume { get; init; }

    public Color Neutral { get; init; } = Color.Parse("#94A3B8");

    public required IReadOnlyList<Color> ChartSeries { get; init; }

    public required Color ChartAnnotation { get; init; }

    public required Color ChartGridLine { get; init; }

    public required Color StatusOnline { get; init; }

    public Color StatusOffline { get; init; } = Color.Parse("#6B7280");

    public required Color StatusAway { get; init; }

    public required Color StatusBusy { get; init; }

    /// <summary>Opacity of the primary colour laid over every card.</summary>
    public required double CardTintOpacity { get; init; }

    /// <summary>Opacity of the primary colour glowing inside a card.</summary>
    public required double SectionGlowOpacity { get; init; }

    /// <summary>The left-to-right gradient of accent lines. It is drawn twice as wide as its box so it can flow.</summary>
    public required IReadOnlyList<ColorStop> GradientAccent { get; init; }

    public required GlassShape Glass { get; init; }

    public required BlobMotion Blobs { get; init; }

    public static ThemePreset Solar { get; } = new()
    {
        Id = "solar",
        Label = "Solar",
        Primary = Tone.Of("#F97316", "#FB923C", "#EA580C"),
        Secondary = Tone.Of("#8B5CF6", "#A78BFA", "#7C3AED"),
        Accent = Tone.Of("#FBBF24", "#FCD34D", "#F59E0B", "#000000"),
        Background = Color.Parse("#211B14"),
        Paper = Color.Parse("#332818"),
        TextPrimary = Color.Parse("#F8FAFC"),
        TextSecondary = Color.Parse("#B8A894"),
        TextDisabled = Color.Parse("#7B6B5B"),
        Surface = new SurfaceColors(
            Glass: Color.FromRgb(62, 47, 26),
            Elevated: Color.FromRgb(78, 60, 35),
            Sidebar: Color.FromRgb(52, 40, 24),
            Tooltip: Color.FromRgb(78, 60, 35),
            Muted: Color.FromRgb(88, 68, 36),
            HoverCard: Color.FromRgb(72, 55, 30)),
        ScrollbarThumb = Color.Parse("#7A5533"),
        ScrollbarThumbHover = Color.Parse("#9A7044"),
        Success = Tone.Of("#10B981", "#34D399", "#059669"),
        Error = Tone.Of("#EF4444", "#F87171", "#DC2626"),
        Warning = Tone.Of("#FBBF24", "#FCD34D", "#F59E0B", "#000000"),
        Info = Tone.Of("#3B82F6", "#60A5FA", "#2563EB"),
        Bullish = Color.Parse("#10B981"),
        Bearish = Color.Parse("#EF4444"),
        Volume = Color.Parse("#3B82F6"),
        ChartSeries = Colors("#F97316", "#FBBF24", "#EF4444", "#8B5CF6", "#10B981", "#F43F5E", "#3B82F6", "#EC4899"),
        ChartAnnotation = Color.Parse("#FBBF24"),
        ChartGridLine = Color.FromArgb(77, 80, 60, 30),
        StatusOnline = Color.Parse("#10B981"),
        StatusAway = Color.Parse("#FBBF24"),
        StatusBusy = Color.Parse("#EF4444"),
        CardTintOpacity = 0.08,
        SectionGlowOpacity = 0.18,
        GradientAccent = Stops(("#DC2626", 0), ("#F97316", 0.25), ("#FBBF24", 0.5), ("#F97316", 0.75), ("#DC2626", 1)),
        Glass = new GlassShape(8, 16, 28, 0.65, 0.55, 0.85, 0.82),
        Blobs = new BlobMotion(4, 18, 25),
    };

    public static ThemePreset Glacier { get; } = new()
    {
        Id = "glacier",
        Label = "Glacier",
        Primary = Tone.Of("#00BCD4", "#26C6DA", "#0097A7"),
        Secondary = Tone.Of("#0EA5E9", "#38BDF8", "#0284C7"),
        Accent = Tone.Of("#818CF8", "#A5B4FC", "#6366F1"),
        Background = Color.Parse("#111A2E"),
        Paper = Color.Parse("#1A2538"),
        TextPrimary = Color.Parse("#F0F6FF"),
        TextSecondary = Color.Parse("#94A8B8"),
        TextDisabled = Color.Parse("#5B6B7B"),
        Surface = new SurfaceColors(
            Glass: Color.FromRgb(26, 37, 58),
            Elevated: Color.FromRgb(35, 48, 72),
            Sidebar: Color.FromRgb(28, 38, 60),
            Tooltip: Color.FromRgb(35, 48, 72),
            Muted: Color.FromRgb(38, 58, 88),
            HoverCard: Color.FromRgb(32, 45, 68)),
        ScrollbarThumb = Color.Parse("#2D4A6A"),
        ScrollbarThumbHover = Color.Parse("#3D5A7A"),
        Success = Tone.Of("#10B981", "#34D399", "#059669"),
        Error = Tone.Of("#F43F5E", "#FB7185", "#E11D48"),
        Warning = Tone.Of("#F59E0B", "#FBBF24", "#D97706", "#000000"),
        Info = Tone.Of("#06B6D4", "#22D3EE", "#0891B2"),
        Bullish = Color.Parse("#34D399"),
        Bearish = Color.Parse("#F43F5E"),
        Volume = Color.Parse("#38BDF8"),
        ChartSeries = Colors("#00BCD4", "#38BDF8", "#818CF8", "#06B6D4", "#34D399", "#F43F5E", "#0EA5E9", "#A78BFA"),
        ChartAnnotation = Color.Parse("#38BDF8"),
        ChartGridLine = Color.FromArgb(77, 30, 50, 80),
        StatusOnline = Color.Parse("#34D399"),
        StatusAway = Color.Parse("#F59E0B"),
        StatusBusy = Color.Parse("#F43F5E"),
        CardTintOpacity = 0.07,
        SectionGlowOpacity = 0.18,
        GradientAccent = Stops(("#0891B2", 0), ("#06B6D4", 0.2), ("#38BDF8", 0.5), ("#818CF8", 0.8), ("#0891B2", 1)),
        Glass = new GlassShape(6, 20, 32, 0.55, 0.45, 0.82, 0.78),
        Blobs = new BlobMotion(3, 25, 35),
    };

    public static ThemePreset Jade { get; } = new()
    {
        Id = "jade",
        Label = "Jade",
        Primary = Tone.Of("#10B981", "#34D399", "#059669"),
        Secondary = Tone.Of("#14B8A6", "#2DD4BF", "#0D9488"),
        Accent = Tone.Of("#F59E0B", "#FBBF24", "#D97706", "#000000"),
        Background = Color.Parse("#101D19"),
        Paper = Color.Parse("#1A2822"),
        TextPrimary = Color.Parse("#F0FFF8"),
        TextSecondary = Color.Parse("#94B8A8"),
        TextDisabled = Color.Parse("#5B7B6B"),
        Surface = new SurfaceColors(
            Glass: Color.FromRgb(24, 48, 38),
            Elevated: Color.FromRgb(32, 62, 50),
            Sidebar: Color.FromRgb(26, 40, 34),
            Tooltip: Color.FromRgb(32, 62, 50),
            Muted: Color.FromRgb(38, 68, 56),
            HoverCard: Color.FromRgb(28, 55, 44)),
        ScrollbarThumb = Color.Parse("#2D6A4A"),
        ScrollbarThumbHover = Color.Parse("#3D7A5A"),
        Success = Tone.Of("#22C55E", "#4ADE80", "#16A34A"),
        Error = Tone.Of("#EF4444", "#F87171", "#DC2626"),
        Warning = Tone.Of("#EAB308", "#FACC15", "#CA8A04", "#000000"),
        Info = Tone.Of("#06B6D4", "#22D3EE", "#0891B2"),
        Bullish = Color.Parse("#22C55E"),
        Bearish = Color.Parse("#EF4444"),
        Volume = Color.Parse("#3B82F6"),
        ChartSeries = Colors("#10B981", "#22C55E", "#14B8A6", "#F59E0B", "#3B82F6", "#EF4444", "#06B6D4", "#8B5CF6"),
        ChartAnnotation = Color.Parse("#F59E0B"),
        ChartGridLine = Color.FromArgb(77, 30, 60, 50),
        StatusOnline = Color.Parse("#22C55E"),
        StatusAway = Color.Parse("#EAB308"),
        StatusBusy = Color.Parse("#EF4444"),
        CardTintOpacity = 0.07,
        SectionGlowOpacity = 0.18,
        GradientAccent = Stops(("#047857", 0), ("#10B981", 0.25), ("#34D399", 0.5), ("#2DD4BF", 0.75), ("#047857", 1)),
        Glass = new GlassShape(10, 14, 26, 0.6, 0.5, 0.84, 0.8),
        Blobs = new BlobMotion(5, 20, 28),
    };

    public static ThemePreset Eclipse { get; } = new()
    {
        Id = "eclipse",
        Label = "Eclipse",
        Primary = Tone.Of("#8B5CF6", "#A78BFA", "#7C3AED"),
        Secondary = Tone.Of("#EC4899", "#F472B6", "#DB2777"),
        Accent = Tone.Of("#06B6D4", "#22D3EE", "#0891B2"),
        Background = Color.Parse("#161024"),
        Paper = Color.Parse("#231D32"),
        TextPrimary = Color.Parse("#F5F0FF"),
        TextSecondary = Color.Parse("#A894B8"),
        TextDisabled = Color.Parse("#6B5B7B"),
        Surface = new SurfaceColors(
            Glass: Color.FromRgb(36, 28, 58),
            Elevated: Color.FromRgb(48, 36, 74),
            Sidebar: Color.FromRgb(34, 26, 52),
            Tooltip: Color.FromRgb(48, 36, 74),
            Muted: Color.FromRgb(56, 46, 78),
            HoverCard: Color.FromRgb(44, 34, 65)),
        ScrollbarThumb = Color.Parse("#5A3D7A"),
        ScrollbarThumbHover = Color.Parse("#6A4D8A"),
        Success = Tone.Of("#10B981", "#34D399", "#059669"),
        Error = Tone.Of("#F43F5E", "#FB7185", "#E11D48"),
        Warning = Tone.Of("#F59E0B", "#FBBF24", "#D97706", "#000000"),
        Info = Tone.Of("#6366F1", "#818CF8", "#4F46E5"),
        Bullish = Color.Parse("#10B981"),
        Bearish = Color.Parse("#F43F5E"),
        Volume = Color.Parse("#A78BFA"),
        ChartSeries = Colors("#8B5CF6", "#EC4899", "#06B6D4", "#A78BFA", "#10B981", "#F43F5E", "#6366F1", "#F472B6"),
        ChartAnnotation = Color.Parse("#06B6D4"),
        ChartGridLine = Color.FromArgb(77, 50, 40, 70),
        StatusOnline = Color.Parse("#10B981"),
        StatusAway = Color.Parse("#F59E0B"),
        StatusBusy = Color.Parse("#F43F5E"),
        CardTintOpacity = 0.08,
        SectionGlowOpacity = 0.20,
        GradientAccent = Stops(("#6D28D9", 0), ("#8B5CF6", 0.2), ("#EC4899", 0.5), ("#F472B6", 0.8), ("#6D28D9", 1)),
        Glass = new GlassShape(14, 20, 34, 0.5, 0.4, 0.8, 0.76),
        Blobs = new BlobMotion(4, 22, 30),
    };

    /// <summary>The presets in the order the theme selector shows them.</summary>
    public static IReadOnlyList<ThemePreset> All { get; } = [Solar, Glacier, Jade, Eclipse];

    /// <summary>The preset with this id; Solar for an id that is unknown, such as one from a newer version.</summary>
    public static ThemePreset ById(string? id) =>
        All.FirstOrDefault(preset => string.Equals(preset.Id, id, StringComparison.OrdinalIgnoreCase)) ?? Solar;

    private static Color[] Colors(params string[] hex) => [.. hex.Select(Color.Parse)];

    private static ColorStop[] Stops(params (string Hex, double Offset)[] stops) =>
        [.. stops.Select(stop => new ColorStop(Color.Parse(stop.Hex), stop.Offset))];
}
