import { useMemo } from "react";
import { useUIStore } from "@/store/uiStore";
import { createAppTheme } from "@/theme/createAppTheme";
import { getPreset } from "@/theme/presets";

export function useAppTheme() {
	const themeId = useUIStore((s) => s.themeId);
	return useMemo(() => createAppTheme(getPreset(themeId)), [themeId]);
}
