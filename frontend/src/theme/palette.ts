/**
 * Trading App Color Palette
 * Orange Theme - Fintech/Crypto Dark Mode
 */

export const palette = {
	mode: "dark" as const,
	primary: {
		main: "#F97316", // Orange 500 - primary actions
		light: "#FB923C", // Orange 400 - hover states
		dark: "#EA580C", // Orange 600 - pressed states
		contrastText: "#FFFFFF",
	},
	secondary: {
		main: "#8B5CF6", // Purple - accent/CTA
		light: "#A78BFA",
		dark: "#7C3AED",
		contrastText: "#FFFFFF",
	},
	background: {
		default: "#0a0e17", // Deep dark - main bg
		paper: "#111827", // Cards/surfaces
	},
	text: {
		primary: "#F8FAFC",
		secondary: "#94A3B8",
		disabled: "#64748B",
	},
	success: {
		main: "#10B981", // Green - profit/bullish
		light: "#34D399",
		dark: "#059669",
		contrastText: "#FFFFFF",
	},
	error: {
		main: "#EF4444", // Red - loss/bearish
		light: "#F87171",
		dark: "#DC2626",
		contrastText: "#FFFFFF",
	},
	warning: {
		main: "#FBBF24", // Yellow/Amber - warnings
		light: "#FCD34D",
		dark: "#F59E0B",
		contrastText: "#000000",
	},
	info: {
		main: "#3B82F6",
		light: "#60A5FA",
		dark: "#2563EB",
		contrastText: "#FFFFFF",
	},
	divider: "rgba(255, 255, 255, 0.06)",
};

// Trading-specific colors
export const tradingColors = {
	bullish: "#10B981",
	bearish: "#EF4444",
	volume: "#3B82F6",
	grid: "rgba(51, 65, 85, 0.3)",
	highlight: "rgba(249, 115, 22, 0.1)",
};

// Glassmorphism styles
export const glassStyles = {
	card: {
		background: "rgba(30, 41, 59, 0.55)",
		backdropFilter: "blur(16px)",
		WebkitBackdropFilter: "blur(16px)",
		border: "1px solid rgba(255, 255, 255, 0.08)",
		borderRadius: "12px",
	},
	elevated: {
		background: "rgba(51, 65, 85, 0.45)",
		backdropFilter: "blur(12px)",
		WebkitBackdropFilter: "blur(12px)",
		border: "1px solid rgba(255, 255, 255, 0.08)",
		borderRadius: "8px",
	},
	sidebar: {
		background: "rgba(15, 23, 42, 0.7)",
		backdropFilter: "blur(24px)",
		WebkitBackdropFilter: "blur(24px)",
		border: "none",
		borderRight: "1px solid rgba(255, 255, 255, 0.06)",
	},
	header: {
		background: "rgba(15, 23, 42, 0.6)",
		backdropFilter: "blur(24px)",
		WebkitBackdropFilter: "blur(24px)",
		borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
	},
};

// Gradient definitions
export const gradients = {
	primary: "linear-gradient(135deg, #F97316 0%, #FB923C 100%)",
	secondary: "linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)",
	success: "linear-gradient(135deg, #10B981 0%, #34D399 100%)",
	error: "linear-gradient(135deg, #EF4444 0%, #F87171 100%)",
	dark: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)",
	orangePurple: "linear-gradient(135deg, #F97316 0%, #8B5CF6 100%)",
	cardShine:
		"linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 50%)",
	meshBg:
		"radial-gradient(at 20% 80%, rgba(249,115,22,0.12) 0%, transparent 50%), radial-gradient(at 80% 20%, rgba(139,92,246,0.10) 0%, transparent 50%), radial-gradient(at 50% 50%, rgba(59,130,246,0.06) 0%, transparent 60%)",
};
