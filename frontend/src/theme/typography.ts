/**
 * Typography configuration for Trading App
 * Uses Inter for UI and JetBrains Mono for numbers/code
 */

import type { TypographyOptions } from "@mui/material/styles/createTypography";

export const typography: TypographyOptions = {
	fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
	h1: {
		fontSize: "2.25rem",
		fontWeight: 700,
		lineHeight: 1.2,
		letterSpacing: "-0.02em",
	},
	h2: {
		fontSize: "2rem",
		fontWeight: 700,
		lineHeight: 1.3,
		letterSpacing: "-0.01em",
	},
	h3: {
		fontSize: "1.5rem",
		fontWeight: 600,
		lineHeight: 1.4,
	},
	h4: {
		fontSize: "1.125rem",
		fontWeight: 600,
		lineHeight: 1.4,
	},
	h5: {
		fontSize: "1rem",
		fontWeight: 600,
		lineHeight: 1.5,
	},
	h6: {
		fontSize: "0.875rem",
		fontWeight: 600,
		lineHeight: 1.5,
	},
	subtitle1: {
		fontSize: "1rem",
		fontWeight: 500,
		lineHeight: 1.5,
	},
	subtitle2: {
		fontSize: "0.875rem",
		fontWeight: 500,
		lineHeight: 1.57,
	},
	body1: {
		fontSize: "1rem",
		fontWeight: 400,
		lineHeight: 1.5,
	},
	body2: {
		fontSize: "0.875rem",
		fontWeight: 400,
		lineHeight: 1.57,
	},
	button: {
		fontSize: "0.875rem",
		fontWeight: 600,
		lineHeight: 1.75,
		textTransform: "none",
	},
	caption: {
		fontSize: "0.75rem",
		fontWeight: 400,
		lineHeight: 1.66,
	},
	overline: {
		fontSize: "0.75rem",
		fontWeight: 500,
		lineHeight: 2.66,
		textTransform: "uppercase",
		letterSpacing: "0.1em",
	},
};

// Monospace font for numbers and code
export const monoFontFamily =
	'"JetBrains Mono", "Fira Code", "Consolas", monospace';
