/**
 * Main theme configuration for Trading App
 * Dark mode with orange accent (Fintech/Crypto style)
 */

import {createTheme} from '@mui/material/styles';
import {glassStyles, gradients, palette, tradingColors} from './palette';
import {monoFontFamily, typography} from './typography';
import {glowEffects, shadows} from './shadows';
import {components} from './components';

export const animations = {
    fast: 150,
    normal: 250,
    slow: 400,
    spring: {stiffness: 400, damping: 30},
};

declare module "@mui/material/styles" {
    interface Theme {
        trading: {
            colors: typeof tradingColors;
            glass: typeof glassStyles;
            gradients: typeof gradients;
            glow: typeof glowEffects;
            mono: string;
            animations: typeof animations;
        };
    }

    interface ThemeOptions {
        trading?: {
            colors?: typeof tradingColors;
            glass?: typeof glassStyles;
            gradients?: typeof gradients;
            glow?: typeof glowEffects;
            mono?: string;
            animations?: typeof animations;
        };
    }
}

// Create the theme
export const theme = createTheme({
    palette,
    typography,
    shadows,
    components,
    shape: {
        borderRadius: 8,
    },
    trading: {
        colors: tradingColors,
        glass: glassStyles,
        gradients: gradients,
        glow: glowEffects,
        mono: monoFontFamily,
        animations: animations,
    },
});

// Export individual modules for direct use
export {palette, tradingColors, glassStyles, gradients} from './palette';
export {typography, monoFontFamily} from './typography';
export {shadows, glowEffects} from './shadows';
export {components} from './components';

export default theme;
