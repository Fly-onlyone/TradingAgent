using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Immutable;

namespace TradingAgent.App.Theme;

/// <summary>
/// Works out every colour, gradient, shadow and corner radius of a preset and puts them in one
/// resource dictionary. Views read them with <c>DynamicResource</c>, so replacing the dictionary
/// changes the look of the running app.
/// </summary>
/// <remarks>
/// The previous UI derived these values in code (its palette, shadow and component files), and so
/// does this class, formula for formula. Typing the results into four resource files would let them
/// drift apart; here one preset value changes everything that depends on it.
/// </remarks>
public static class ThemeBuilder
{
    private static readonly Color _white = Colors.White;
    private static readonly Color _black = Colors.Black;

    /// <summary>The 25 elevation shadows of the previous UI: Y offset, blur, spread and opacity of each layer.</summary>
    private static readonly (double Y, double Blur, double Spread, double Opacity)[][] _elevations =
    [
        [],
        [(1, 2, 0, 0.2)],
        [(1, 3, 0, 0.25), (1, 2, -1, 0.25)],
        [(4, 6, -1, 0.3), (2, 4, -2, 0.3)],
        [(10, 15, -3, 0.35), (4, 6, -4, 0.35)],
        [(20, 25, -5, 0.4), (8, 10, -6, 0.4)],
        [(25, 50, -12, 0.5)],
        [(28, 52, -12, 0.5)],
        [(30, 55, -14, 0.5)],
        [(32, 58, -14, 0.52)],
        [(34, 60, -14, 0.52)],
        [(36, 62, -16, 0.55)],
        [(38, 64, -16, 0.55)],
        [(40, 66, -16, 0.55)],
        [(42, 68, -18, 0.58)],
        [(44, 70, -18, 0.58)],
        [(46, 72, -18, 0.6)],
        [(48, 74, -20, 0.6)],
        [(50, 76, -20, 0.6)],
        [(52, 78, -20, 0.62)],
        [(54, 80, -22, 0.62)],
        [(56, 82, -22, 0.65)],
        [(58, 84, -22, 0.65)],
        [(60, 86, -24, 0.68)],
        [(64, 90, -24, 0.7)],
    ];

    public static ResourceDictionary Build(ThemePreset preset)
    {
        ArgumentNullException.ThrowIfNull(preset);
        var resources = new ResourceDictionary();
        var primary = preset.Primary.Main;
        var surface = preset.Surface;
        var glass = preset.Glass;
        var tint = Alpha(primary, preset.CardTintOpacity);
        var glow = Alpha(primary, preset.SectionGlowOpacity);

        // The preset itself, for what draws from its raw values: the moving background.
        resources["ThemePreset"] = preset;

        AddTone(resources, "Primary", preset.Primary);
        AddTone(resources, "Secondary", preset.Secondary);
        AddTone(resources, "Accent", preset.Accent);
        AddTone(resources, "Success", preset.Success);
        AddTone(resources, "Error", preset.Error);
        AddTone(resources, "Warning", preset.Warning);
        AddTone(resources, "Info", preset.Info);

        AddColor(resources, "Background", preset.Background);
        AddColor(resources, "Paper", preset.Paper);
        AddColor(resources, "TextPrimary", preset.TextPrimary);
        AddColor(resources, "TextSecondary", preset.TextSecondary);
        AddColor(resources, "TextDisabled", preset.TextDisabled);
        AddColor(resources, "Bullish", preset.Bullish);
        AddColor(resources, "Bearish", preset.Bearish);
        AddColor(resources, "Volume", preset.Volume);
        AddColor(resources, "Neutral", preset.Neutral);
        AddColor(resources, "StatusOnline", preset.StatusOnline);
        AddColor(resources, "StatusOffline", preset.StatusOffline);
        AddColor(resources, "StatusAway", preset.StatusAway);
        AddColor(resources, "StatusBusy", preset.StatusBusy);
        AddColor(resources, "ChartAnnotation", preset.ChartAnnotation);
        AddColor(resources, "ChartGridLine", preset.ChartGridLine);
        AddColor(resources, "ScrollbarThumb", preset.ScrollbarThumb);
        AddColor(resources, "ScrollbarThumbHover", preset.ScrollbarThumbHover);
        for (var index = 0; index < preset.ChartSeries.Count; index++)
        {
            AddColor(resources, $"ChartSeries{index + 1}", preset.ChartSeries[index]);
        }

        // The primary colour at the opacities the previous UI used for borders, hover and selection.
        foreach (var percent in (int[])[5, 8, 10, 12, 15, 16, 20, 24, 25, 30, 35, 40, 50, 60, 70])
        {
            AddColor(resources, $"Primary{percent:00}", Alpha(primary, percent / 100.0));
        }

        foreach (var (name, tone) in (ReadOnlySpan<(string, Tone)>)[("Secondary", preset.Secondary), ("Success", preset.Success), ("Error", preset.Error), ("Warning", preset.Warning), ("Info", preset.Info)])
        {
            foreach (var percent in (int[])[8, 10, 15, 30, 50, 70])
            {
                AddColor(resources, $"{name}{percent:00}", Alpha(tone.Main, percent / 100.0));
            }
        }

        AddColor(resources, "Bullish20", Alpha(preset.Bullish, 0.2));
        AddColor(resources, "Bearish20", Alpha(preset.Bearish, 0.2));
        AddColor(resources, "BorderSubtle", Alpha(primary, 0.08));
        AddColor(resources, "BorderMedium", Alpha(primary, 0.15));
        AddColor(resources, "BorderStrong", Alpha(primary, 0.35));
        AddColor(resources, "BorderWhite", Alpha(_white, 0.1));
        AddColor(resources, "Divider", Alpha(primary, 0.08));
        AddColor(resources, "Hover", Alpha(primary, 0.08));
        AddColor(resources, "Focus", Alpha(primary, 0.4));
        AddColor(resources, "Active", Alpha(primary, 0.15));
        AddColor(resources, "Selected", Alpha(primary, 0.12));
        AddColor(resources, "SelectedBorder", Alpha(primary, 0.5));

        // The neutral "action" colours of a dark Material palette.
        AddColor(resources, "ActionHover", Alpha(_white, 0.08));
        AddColor(resources, "ActionSelected", Alpha(_white, 0.16));
        AddColor(resources, "ActionDisabled", Alpha(_white, 0.3));
        AddColor(resources, "ActionDisabledBackground", Alpha(_white, 0.12));
        AddColor(resources, "White05", Alpha(_white, 0.05));
        AddColor(resources, "White10", Alpha(_white, 0.1));
        AddColor(resources, "White23", Alpha(_white, 0.23));
        AddColor(resources, "White38", Alpha(_white, 0.38));

        // Glass surfaces. A card is the tint laid over the glass colour; both are flat, so one colour is exact.
        AddColor(resources, "Card", Over(tint, Alpha(surface.Glass, glass.CardOpacity)));
        AddColor(resources, "CardHover", Over(tint, Alpha(surface.HoverCard, 0.75)));
        AddColor(resources, "GlassCard", Alpha(surface.Glass, glass.CardOpacity));
        AddColor(resources, "GlassElevated", Alpha(surface.Elevated, glass.ElevatedOpacity));
        AddColor(resources, "Sidebar", Alpha(surface.Elevated, glass.SidebarOpacity));
        AddColor(resources, "Header", Alpha(surface.Elevated, glass.HeaderOpacity));
        AddColor(resources, "PaperGlass", Over(tint, Alpha(surface.Glass, 0.7)));
        AddColor(resources, "Tooltip", Alpha(surface.Tooltip, 0.9));
        AddColor(resources, "TooltipBorder", Alpha(primary, 0.12));
        AddColor(resources, "Muted", surface.Muted);
        AddColor(resources, "Muted10", Alpha(surface.Muted, 0.1));
        AddColor(resources, "Muted20", Alpha(surface.Muted, 0.2));
        AddColor(resources, "Muted30", Alpha(surface.Muted, 0.3));
        AddColor(resources, "Muted50", Alpha(surface.Muted, 0.5));
        AddColor(resources, "TableHead", Alpha(surface.Sidebar, 0.4));
        AddColor(resources, "Scrim", Alpha(surface.Sidebar, 0.6));
        AddColor(resources, "InputDisabled", Alpha(surface.Sidebar, 0.5));

        // A switch that is on but disabled: the primary colour darkened by 55 %.
        AddColor(resources, "SwitchDisabledChecked", Color.FromRgb((byte)(primary.R * 0.45), (byte)(primary.G * 0.45), (byte)(primary.B * 0.45)));

        // Gradients.
        resources["GradientPrimaryBrush"] = Diagonal(preset.Primary.Main, preset.Primary.Light);
        resources["GradientSecondaryBrush"] = Diagonal(preset.Secondary.Main, preset.Secondary.Light);
        resources["GradientPrimarySecondaryBrush"] = Diagonal(preset.Primary.Main, preset.Secondary.Main);
        resources["GradientHeroBrush"] = Diagonal(Alpha(primary, 0.1), Alpha(primary, 0.02));
        resources["GradientThemeTileBrush"] = Diagonal(preset.Primary.Main, preset.Secondary.Main, preset.Accent.Main);
        resources["GradientAccentStops"] = AccentStops(preset);
        resources["GradientAccentBrush"] = new ImmutableLinearGradientBrush(
            AccentStops(preset),
            startPoint: new RelativePoint(0, 0.5, RelativeUnit.Relative),
            // Twice the width of the box: at rest only the first half of the gradient shows.
            endPoint: new RelativePoint(2, 0.5, RelativeUnit.Relative));
        resources["ButtonBrush"] = Diagonal(Alpha(primary, 0.7), Alpha(primary, 0.5));
        resources["ButtonHoverBrush"] = Diagonal(Alpha(primary, 0.85), Alpha(primary, 0.65));
        resources["ButtonPressedBrush"] = Diagonal(Alpha(primary, 0.6), Alpha(primary, 0.45));
        resources["ButtonDisabledBrush"] = Diagonal(Alpha(surface.Muted, 0.25), Alpha(surface.Muted, 0.15));
        foreach (var (name, tone) in (ReadOnlySpan<(string, Tone)>)[("Success", preset.Success), ("Error", preset.Error), ("Warning", preset.Warning), ("Info", preset.Info)])
        {
            resources[$"Alert{name}FilledBrush"] = Diagonal(Alpha(tone.Main, 0.55), Alpha(tone.Main, 0.35));
            resources[$"Alert{name}FilledShadow"] = Shadows(
                Drop(0, 4, 16, 0, Alpha(_black, 0.3)),
                Drop(0, 0, 12, 0, Alpha(tone.Main, 0.15)),
                Inset(0, 1, 0, 0, Alpha(_white, 0.12)));
        }

        // Shadows. Two states of one control always have the same number of layers, of the same
        // kind and in the same order, so a transition can move from one to the other.
        resources["NoShadow"] = Shadows();
        resources["CardShadow"] = Shadows(
            Drop(0, 4, 20, 0, Alpha(_black, 0.2)),
            Drop(0, 0, 20, 0, Alpha(primary, 0)),
            Inset(0, 1, 0, 0, Alpha(_white, 0.05)),
            Inset(0, 0, 30, 0, glow));
        resources["CardHoverShadow"] = Shadows(
            Drop(0, 8, 32, 0, Alpha(_black, 0.3)),
            Drop(0, 0, 20, 0, glow),
            Inset(0, 1, 0, 0, Alpha(_white, 0.08)),
            Inset(0, 0, 30, 0, Alpha(primary, 0)));
        resources["ButtonShadow"] = Shadows(
            Drop(0, 2, 8, 0, Alpha(primary, 0.25)),
            Drop(0, 0, 20, 0, Alpha(primary, 0)),
            Inset(0, 1, 0, 0, Alpha(_white, 0.15)));
        resources["ButtonHoverShadow"] = Shadows(
            Drop(0, 4, 16, 0, Alpha(primary, 0.4)),
            Drop(0, 0, 20, 0, Alpha(primary, 0.15)),
            Inset(0, 1, 0, 0, Alpha(_white, 0.2)));
        resources["ButtonPressedShadow"] = Shadows(
            Drop(0, 1, 4, 0, Alpha(primary, 0.3)),
            Drop(0, 0, 20, 0, Alpha(primary, 0)),
            Inset(0, 2, 4, 0, Alpha(_black, 0.2)));
        resources["ButtonNoShadow"] = Shadows(
            Drop(0, 0, 0, 0, Alpha(primary, 0)),
            Drop(0, 0, 20, 0, Alpha(primary, 0)),
            Inset(0, 0, 0, 0, Alpha(_white, 0)));
        resources["FocusRingShadow"] = Shadows(Drop(0, 0, 0, 2, Alpha(primary, 0.4)));
        resources["NoFocusRingShadow"] = Shadows(Drop(0, 0, 0, 2, Alpha(primary, 0)));
        resources["ChipHoverShadow"] = Shadows(Drop(0, 0, 8, 0, Alpha(primary, 0.2)));
        resources["ChipShadow"] = Shadows(Drop(0, 0, 8, 0, Alpha(primary, 0)));
        resources["PaperShadow"] = Shadows(Drop(0, 1, 3, 0, Alpha(_black, 0.2)));
        resources["DialogShadow"] = Shadows(
            Drop(0, 25, 50, 0, Alpha(_black, 0.5)),
            Drop(0, 0, 30, 0, Alpha(primary, 0.05)));
        resources["GlowPrimaryShadow"] = Shadows(Drop(0, 0, 20, 0, Alpha(primary, 0.4)));
        resources["NoGlowShadow"] = Shadows(Drop(0, 0, 20, 0, Alpha(primary, 0)));
        resources["GlowPrimaryIntenseShadow"] = Shadows(
            Drop(0, 0, 30, 0, Alpha(primary, 0.6)),
            Drop(0, 0, 60, 0, Alpha(primary, 0.3)));
        resources["GlowSecondaryShadow"] = Shadows(Drop(0, 0, 20, 0, Alpha(preset.Secondary.Main, 0.3)));
        resources["GlowSuccessShadow"] = Shadows(Drop(0, 0, 20, 0, Alpha(preset.Success.Main, 0.3)));
        resources["GlowErrorShadow"] = Shadows(Drop(0, 0, 20, 0, Alpha(preset.Error.Main, 0.3)));
        resources["ActiveTileShadow"] = Shadows(
            Drop(0, 0, 16, 0, Alpha(primary, 0.3)),
            Inset(0, 0, 12, 0, Alpha(primary, 0.08)));
        resources["NavBarShadow"] = Shadows(
            Drop(0, 0, 16, 0, Alpha(primary, 0.7)),
            Drop(0, 0, 6, 0, Alpha(primary, 0.5)),
            Drop(0, 0, 30, 0, Alpha(primary, 0.2)));
        for (var level = 0; level < _elevations.Length; level++)
        {
            resources[$"Elevation{level}Shadow"] = Shadows(
                [.. _elevations[level].Select(layer => Drop(0, layer.Y, layer.Blur, layer.Spread, Alpha(_black, layer.Opacity)))]);
        }

        // Corner radii. The base radius is the preset's; a number in the previous UI's layout code
        // meant that many times the base radius.
        var radius = glass.BorderRadius;
        var chip = Math.Max(radius - 2, 4);
        resources["RadiusBase"] = new CornerRadius(radius);
        resources["RadiusHalf"] = new CornerRadius(radius * 0.5);
        resources["RadiusOneAndHalf"] = new CornerRadius(radius * 1.5);
        resources["RadiusDouble"] = new CornerRadius(radius * 2);
        resources["RadiusCard"] = new CornerRadius(radius + 4);
        resources["RadiusCardTop"] = new CornerRadius(radius + 4, radius + 4, 0, 0);
        resources["RadiusChip"] = new CornerRadius(chip);
        resources["RadiusStripLeft"] = new CornerRadius(radius, 0, 0, radius);
        resources["RadiusBubbleUser"] = new CornerRadius(radius * 2, 4, radius * 2, radius * 2);
        resources["RadiusBubbleAssistant"] = new CornerRadius(4, radius * 2, radius * 2, radius * 2);
        resources["RadiusBaseValue"] = radius;
        resources["RadiusLeft"] = new CornerRadius(radius, 0, 0, radius);
        resources["RadiusRight"] = new CornerRadius(0, radius, radius, 0);
        resources["RadiusCardValue"] = radius + 4;
        resources["CardBlur"] = glass.CardBlur;
        resources["ElevatedBlur"] = Math.Round(glass.CardBlur * 0.75);
        resources["SidebarBlur"] = glass.SidebarBlur;

        return resources;
    }

    /// <summary>A colour at an opacity, as <c>rgba(r, g, b, a)</c> in the previous UI.</summary>
    public static Color Alpha(Color color, double opacity) =>
        Color.FromArgb((byte)Math.Round(Math.Clamp(opacity, 0, 1) * 255), color.R, color.G, color.B);

    /// <summary>The one colour that two flat translucent layers show together, the top one drawn over the bottom one.</summary>
    public static Color Over(Color top, Color bottom)
    {
        var topAlpha = top.A / 255.0;
        var bottomAlpha = bottom.A / 255.0;
        var alpha = topAlpha + (bottomAlpha * (1 - topAlpha));
        if (alpha <= 0)
        {
            return Colors.Transparent;
        }

        byte Channel(byte over, byte under) =>
            (byte)Math.Round(((over * topAlpha) + (under * bottomAlpha * (1 - topAlpha))) / alpha);

        return Color.FromArgb((byte)Math.Round(alpha * 255), Channel(top.R, bottom.R), Channel(top.G, bottom.G), Channel(top.B, bottom.B));
    }

    /// <summary>
    /// The blur Avalonia needs to draw a shadow as soft as a browser draws it for this CSS blur radius.
    /// </summary>
    /// <remarks>
    /// A browser blurs with a standard deviation of half the radius. Avalonia's Skia renderer turns
    /// its blur value into a standard deviation of 0.288675 × blur + 0.5. The shadow values of the
    /// previous UI are CSS values, so they are converted here and nowhere else.
    /// </remarks>
    public static double CssBlur(double cssBlur) =>
        cssBlur <= 0 ? 0 : Math.Max(0.01, ((cssBlur / 2) - 0.5) / 0.288675);

    public static BoxShadow Drop(double x, double y, double cssBlur, double spread, Color color) =>
        new() { OffsetX = x, OffsetY = y, Blur = CssBlur(cssBlur), Spread = spread, Color = color };

    public static BoxShadow Inset(double x, double y, double cssBlur, double spread, Color color) =>
        new() { OffsetX = x, OffsetY = y, Blur = CssBlur(cssBlur), Spread = spread, Color = color, IsInset = true };

    public static BoxShadows Shadows(params BoxShadow[] layers) => layers.Length switch
    {
        0 => default,
        1 => new BoxShadows(layers[0]),
        _ => new BoxShadows(layers[0], layers[1..]),
    };

    private static void AddTone(ResourceDictionary resources, string name, Tone tone)
    {
        AddColor(resources, name, tone.Main);
        AddColor(resources, name + "Light", tone.Light);
        AddColor(resources, name + "Dark", tone.Dark);
        AddColor(resources, name + "Contrast", tone.Contrast);
    }

    /// <summary>Adds a colour twice: as <c>NameColor</c> for gradient stops and shadows, and as <c>NameBrush</c>.</summary>
    private static void AddColor(ResourceDictionary resources, string name, Color color)
    {
        resources[name + "Color"] = color;
        resources[name + "Brush"] = new ImmutableSolidColorBrush(color);
    }

    /// <summary>
    /// A gradient from the top left corner to the bottom right one, for the previous UI's
    /// <c>linear-gradient(135deg, …)</c>.
    /// </summary>
    /// <remarks>
    /// On a box that is not square, CSS keeps the angle and this follows the diagonal. The gradients
    /// drawn this way are between two close shades, where the difference cannot be seen.
    /// </remarks>
    private static ImmutableLinearGradientBrush Diagonal(params Color[] colors) => new(
        [.. colors.Select((color, index) => new ImmutableGradientStop(colors.Length == 1 ? 0 : (double)index / (colors.Length - 1), color))],
        startPoint: new RelativePoint(0, 0, RelativeUnit.Relative),
        endPoint: new RelativePoint(1, 1, RelativeUnit.Relative));

    private static ImmutableGradientStop[] AccentStops(ThemePreset preset) =>
        [.. preset.GradientAccent.Select(stop => new ImmutableGradientStop(stop.Offset, stop.Color))];
}
