import { useMemo } from "react";
import { useUIStore } from "@/store/uiStore";
import { getPreset, type ThemeId, type ThemePreset } from "@/theme/presets";

/**
 * Sets the active theme by updating the data-theme attribute on <html>.
 * This triggers CSS variable changes for the entire app.
 */
export function setTheme(id: ThemeId) {
	document.documentElement.dataset.theme = id;
}

/**
 * Hook that returns the raw ThemePreset object for JS-side access.
 * Use this for values that can't be accessed via CSS variables:
 * chart series arrays, animation spring configs, mesh blob params, etc.
 */
export function useThemePreset(): ThemePreset {
	const themeId = useUIStore((s) => s.themeId);
	return useMemo(() => getPreset(themeId), [themeId]);
}
