/**
 * Shared types and tone-to-color helpers for the metric variant family.
 */

import type { Theme } from "@mui/material/styles";

export type MetricTone =
	| "primary"
	| "success"
	| "warning"
	| "error"
	| "neutral";

export type MetricDensity = "default" | "compact";

export interface ToneTokens {
	main: string;
	rgb: string;
}

/**
 * Resolve a tone to concrete color tokens from the active theme.
 * Returns both a CSS color string and the raw RGB triplet for rgba() composition.
 */
export function getToneTokens(theme: Theme, tone: MetricTone): ToneTokens {
	switch (tone) {
		case "success":
			return {
				main: theme.palette.success.main,
				rgb: theme.trading.semanticRgb.success,
			};
		case "warning":
			return {
				main: theme.palette.warning.main,
				rgb: theme.trading.semanticRgb.warning,
			};
		case "error":
			return {
				main: theme.palette.error.main,
				rgb: theme.trading.semanticRgb.error,
			};
		case "neutral":
			return {
				main: theme.palette.text.secondary,
				rgb: theme.trading.colors.neutralRgb,
			};
		default:
			return {
				main: theme.palette.primary.main,
				rgb: theme.trading.primaryRgb,
			};
	}
}
