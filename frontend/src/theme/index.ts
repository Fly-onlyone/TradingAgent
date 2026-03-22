/**
 * Main theme configuration for Trading App
 * Multi-theme support via presets
 */

import {createAppTheme} from "./createAppTheme";
import type {ThemePreset} from "./presets";
import {getPreset} from "./presets";

// Type augmentation for the trading namespace
declare module "@mui/material/styles" {
    interface Theme {
        trading: {
            colors: ReturnType<
                typeof import("./palette").createTradingColors
            >;
            glass: ReturnType<
                typeof import("./palette").createGlassStyles
            >;
            gradients: ReturnType<
                typeof import("./palette").createGradients
            >;
            glow: ReturnType<
                typeof import("./shadows").createGlowEffects
            >;
            mono: string;
            animations: ThemePreset["animations"];
            primaryRgb: string;
            secondaryRgb: string;
            accentRgb: string;
            semanticRgb: ThemePreset["semanticRgb"];
            border: ThemePreset["border"];
            interactive: ThemePreset["interactive"];
            chart: ThemePreset["chart"];
            status: ThemePreset["status"];
            cardTint: string;
            gradientAccent: string;
            sectionGlow: string;
            spacing: ThemePreset["spacing"];
            elevation: ThemePreset["elevation"];
        };
    }

    interface ThemeOptions {
        trading?: {
            colors?: ReturnType<
                typeof import("./palette").createTradingColors
            >;
            glass?: ReturnType<
                typeof import("./palette").createGlassStyles
            >;
            gradients?: ReturnType<
                typeof import("./palette").createGradients
            >;
            glow?: ReturnType<
                typeof import("./shadows").createGlowEffects
            >;
            mono?: string;
            animations?: ThemePreset["animations"];
            primaryRgb?: string;
            secondaryRgb?: string;
            accentRgb?: string;
            semanticRgb?: ThemePreset["semanticRgb"];
            border?: ThemePreset["border"];
            interactive?: ThemePreset["interactive"];
            chart?: ThemePreset["chart"];
            status?: ThemePreset["status"];
            cardTint?: string;
            gradientAccent?: string;
            sectionGlow?: string;
            spacing?: ThemePreset["spacing"];
            elevation?: ThemePreset["elevation"];
        };
    }
}

// Default theme (backward compat)
export const theme = createAppTheme(getPreset("solar"));

export {createAppTheme} from "./createAppTheme";
export {getPreset, themeList, themePresets} from "./presets";
export type {ThemeId, ThemePreset} from "./presets";
export {shadows} from "./shadows";
export {monoFontFamily, typography} from "./typography";

export default theme;
