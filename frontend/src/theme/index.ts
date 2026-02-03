/**
 * Main theme configuration for Trading App
 * Dark mode with orange accent (Fintech/Crypto style)
 */

import { createTheme } from '@mui/material/styles';
import { palette, tradingColors, glassStyles, gradients } from './palette';
import { typography, monoFontFamily } from './typography';
import { shadows, glowEffects } from './shadows';
import { components } from './components';

// Extend the theme with custom properties
declare module '@mui/material/styles' {
  interface Theme {
    trading: {
      colors: typeof tradingColors;
      glass: typeof glassStyles;
      gradients: typeof gradients;
      glow: typeof glowEffects;
      mono: string;
    };
  }
  interface ThemeOptions {
    trading?: {
      colors?: typeof tradingColors;
      glass?: typeof glassStyles;
      gradients?: typeof gradients;
      glow?: typeof glowEffects;
      mono?: string;
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
  },
});

// Export individual modules for direct use
export { palette, tradingColors, glassStyles, gradients } from './palette';
export { typography, monoFontFamily } from './typography';
export { shadows, glowEffects } from './shadows';
export { components } from './components';

export default theme;
