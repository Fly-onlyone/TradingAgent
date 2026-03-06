/**
 * Main theme configuration for Trading App
 * Dark mode with orange accent (Fintech/Crypto style)
 */

import { createTheme } from "@mui/material/styles";
import { components } from "./components";
import { glassStyles, gradients, palette, tradingColors } from "./palette";
import { glowEffects, shadows } from "./shadows";
import { monoFontFamily, typography } from "./typography";

export const animations = {
	fast: 150,
	normal: 250,
	slow: 400,
	spring: {
		snappy: { stiffness: 400, damping: 30 },
		bouncy: { stiffness: 300, damping: 20 },
		gentle: { stiffness: 200, damping: 25 },
	},
	easing: {
		easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
		easeInOutBack: "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
	},
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

export { components } from "./components";
// Export individual modules for direct use
export { glassStyles, gradients, palette, tradingColors } from "./palette";
export { glowEffects, shadows } from "./shadows";
export { monoFontFamily, typography } from "./typography";

export default theme;
