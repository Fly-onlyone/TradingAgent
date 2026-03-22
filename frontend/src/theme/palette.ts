/**
 * Trading App Color Palette — factory functions driven by ThemePreset.
 */

import type { ThemePreset } from "./presets";

export function createPalette(preset: ThemePreset) {
	return {
		mode: "dark" as const,
		primary: preset.primary,
		secondary: preset.secondary,
		background: preset.background,
		text: preset.text,
		success: {
			...preset.semantics.success,
			contrastText: "#FFFFFF",
		},
		error: {
			...preset.semantics.error,
			contrastText: "#FFFFFF",
		},
		warning: {
			...preset.semantics.warning,
			contrastText: "#000000",
		},
		info: {
			...preset.semantics.info,
			contrastText: "#FFFFFF",
		},
		divider: preset.border.subtle,
	};
}

export function createTradingColors(preset: ThemePreset) {
	return {
		bullish: preset.trading.bullish,
		bullishRgb: preset.trading.bullishRgb,
		bearish: preset.trading.bearish,
		bearishRgb: preset.trading.bearishRgb,
		volume: preset.trading.volume,
		volumeRgb: preset.trading.volumeRgb,
		neutral: preset.trading.neutral,
		neutralRgb: preset.trading.neutralRgb,
		grid: `rgba(${preset.surface.muted}, 0.3)`,
		highlight: `rgba(${preset.primaryRgb}, 0.15)`,
		crosshair: preset.primary.main,
	};
}

export function createGlassStyles(preset: ThemePreset) {
	const { glass, surface, border } = preset;
	return {
		card: {
			background: `rgba(${surface.glass}, ${glass.cardOpacity})`,
			backdropFilter: `blur(${glass.cardBlur}px)`,
			WebkitBackdropFilter: `blur(${glass.cardBlur}px)`,
			border: `1px solid ${border.medium}`,
			borderRadius: `${glass.borderRadius + 4}px`,
		},
		elevated: {
			background: `rgba(${surface.elevated}, ${glass.elevatedOpacity})`,
			backdropFilter: `blur(${Math.round(glass.cardBlur * 0.75)}px)`,
			WebkitBackdropFilter: `blur(${Math.round(glass.cardBlur * 0.75)}px)`,
			border: `1px solid ${border.subtle}`,
			borderRadius: `${glass.borderRadius}px`,
		},
		sidebar: {
			background: `rgba(${surface.elevated}, ${glass.sidebarOpacity})`,
			backdropFilter: `blur(${glass.sidebarBlur}px)`,
			WebkitBackdropFilter: `blur(${glass.sidebarBlur}px)`,
			border: "none",
			borderRight: `1px solid ${border.subtle}`,
		},
		header: {
			background: `rgba(${surface.elevated}, ${glass.headerOpacity})`,
			backdropFilter: `blur(${glass.sidebarBlur}px)`,
			WebkitBackdropFilter: `blur(${glass.sidebarBlur}px)`,
			borderBottom: `1px solid ${border.subtle}`,
		},
	};
}

export function createGradients(preset: ThemePreset) {
	return {
		primary: `linear-gradient(135deg, ${preset.primary.main} 0%, ${preset.primary.light} 100%)`,
		secondary: `linear-gradient(135deg, ${preset.secondary.main} 0%, ${preset.secondary.light} 100%)`,
		success: `linear-gradient(135deg, ${preset.semantics.success.main} 0%, ${preset.semantics.success.light} 100%)`,
		error: `linear-gradient(135deg, ${preset.semantics.error.main} 0%, ${preset.semantics.error.light} 100%)`,
		dark: `linear-gradient(180deg, ${preset.background.default} 0%, ${preset.background.paper} 100%)`,
		primarySecondary: `linear-gradient(135deg, ${preset.primary.main} 0%, ${preset.secondary.main} 100%)`,
		cardShine:
			"linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 50%)",
		meshBg: `radial-gradient(at 20% 80%, rgba(${preset.primaryRgb},0.25) 0%, transparent 50%), radial-gradient(at 80% 20%, rgba(${preset.primaryRgb},0.15) 0%, transparent 50%), radial-gradient(at 50% 50%, rgba(${preset.secondaryRgb},0.10) 0%, transparent 60%)`,
	};
}
