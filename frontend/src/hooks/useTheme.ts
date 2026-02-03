/**
 * Theme Hook
 */

import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useUIStore } from '@/store/uiStore';

export function useTheme() {
  const theme = useMuiTheme();
  const { reducedMotion, setReducedMotion } = useUIStore();

  // Access trading-specific theme properties
  const tradingColors = theme.trading.colors;
  const glassStyles = theme.trading.glass;
  const gradients = theme.trading.gradients;
  const glowEffects = theme.trading.glow;
  const monoFont = theme.trading.mono;

  // Color helpers
  const getBullishColor = () => tradingColors.bullish;
  const getBearishColor = () => tradingColors.bearish;
  const getPriceChangeColor = (change: number) =>
    change >= 0 ? tradingColors.bullish : tradingColors.bearish;

  // Animation helpers
  const getTransitionDuration = (type: 'fast' | 'normal' | 'slow' = 'normal') => {
    if (reducedMotion) return 0;
    const durations = { fast: 150, normal: 200, slow: 300 };
    return durations[type];
  };

  return {
    theme,
    reducedMotion,
    setReducedMotion,
    
    // Trading colors
    tradingColors,
    glassStyles,
    gradients,
    glowEffects,
    monoFont,
    
    // Helpers
    getBullishColor,
    getBearishColor,
    getPriceChangeColor,
    getTransitionDuration,
  };
}

export default useTheme;
