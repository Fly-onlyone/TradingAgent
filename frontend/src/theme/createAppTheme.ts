/**
 * Factory: assembles a full MUI Theme from a ThemePreset.
 */

import {createTheme} from "@mui/material/styles";
import {createComponents} from "./components";
import {createGlassStyles, createGradients, createPalette, createTradingColors,} from "./palette";
import type {ThemePreset} from "./presets";
import {createGlowEffects, shadows} from "./shadows";
import {monoFontFamily, typography} from "./typography";

export function createAppTheme(preset: ThemePreset) {
    const palette = createPalette(preset);
    const glassStyles = createGlassStyles(preset);
    const gradients = createGradients(preset);
    const tradingColors = createTradingColors(preset);
    const glowEffects = createGlowEffects(preset);

    return createTheme({
        palette,
        typography,
        shadows,
        components: createComponents(preset, glassStyles),
        shape: {
            borderRadius: preset.glass.borderRadius,
        },
        trading: {
            colors: tradingColors,
            glass: glassStyles,
            gradients,
            glow: glowEffects,
            mono: monoFontFamily,
            animations: preset.animations,
            primaryRgb: preset.primaryRgb,
            secondaryRgb: preset.secondaryRgb,
            accentRgb: preset.accentRgb,
            semanticRgb: preset.semanticRgb,
            border: preset.border,
            interactive: preset.interactive,
            chart: preset.chart,
            status: preset.status,
            cardTint: preset.cardTint,
            gradientAccent: preset.gradientAccent,
            sectionGlow: preset.sectionGlow,
            spacing: preset.spacing,
            elevation: preset.elevation,
        },
    });
}
