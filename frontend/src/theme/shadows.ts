/**
 * Custom shadows for Trading App
 * Designed for dark mode with subtle depth
 */

import type { Shadows } from "@mui/material/styles";
import type { ThemePreset } from "./presets";

const shadowColor = "0, 0, 0";

export const shadows: Shadows = [
	"none",
	`0 1px 2px 0 rgba(${shadowColor}, 0.2)`,
	`0 1px 3px 0 rgba(${shadowColor}, 0.25), 0 1px 2px -1px rgba(${shadowColor}, 0.25)`,
	`0 4px 6px -1px rgba(${shadowColor}, 0.3), 0 2px 4px -2px rgba(${shadowColor}, 0.3)`,
	`0 10px 15px -3px rgba(${shadowColor}, 0.35), 0 4px 6px -4px rgba(${shadowColor}, 0.35)`,
	`0 20px 25px -5px rgba(${shadowColor}, 0.4), 0 8px 10px -6px rgba(${shadowColor}, 0.4)`,
	`0 25px 50px -12px rgba(${shadowColor}, 0.5)`,
	`0 28px 52px -12px rgba(${shadowColor}, 0.5)`,
	`0 30px 55px -14px rgba(${shadowColor}, 0.5)`,
	`0 32px 58px -14px rgba(${shadowColor}, 0.52)`,
	`0 34px 60px -14px rgba(${shadowColor}, 0.52)`,
	`0 36px 62px -16px rgba(${shadowColor}, 0.55)`,
	`0 38px 64px -16px rgba(${shadowColor}, 0.55)`,
	`0 40px 66px -16px rgba(${shadowColor}, 0.55)`,
	`0 42px 68px -18px rgba(${shadowColor}, 0.58)`,
	`0 44px 70px -18px rgba(${shadowColor}, 0.58)`,
	`0 46px 72px -18px rgba(${shadowColor}, 0.6)`,
	`0 48px 74px -20px rgba(${shadowColor}, 0.6)`,
	`0 50px 76px -20px rgba(${shadowColor}, 0.6)`,
	`0 52px 78px -20px rgba(${shadowColor}, 0.62)`,
	`0 54px 80px -22px rgba(${shadowColor}, 0.62)`,
	`0 56px 82px -22px rgba(${shadowColor}, 0.65)`,
	`0 58px 84px -22px rgba(${shadowColor}, 0.65)`,
	`0 60px 86px -24px rgba(${shadowColor}, 0.68)`,
	`0 64px 90px -24px rgba(${shadowColor}, 0.7)`,
];

export function createGlowEffects(preset: ThemePreset) {
	const { primaryRgb, secondaryRgb, semanticRgb } = preset;
	return {
		primary: `0 0 20px rgba(${primaryRgb}, 0.4)`,
		primaryIntense: `0 0 30px rgba(${primaryRgb}, 0.6), 0 0 60px rgba(${primaryRgb}, 0.3)`,
		secondary: `0 0 20px rgba(${secondaryRgb}, 0.3)`,
		secondaryIntense: `0 0 30px rgba(${secondaryRgb}, 0.5), 0 0 60px rgba(${secondaryRgb}, 0.2)`,
		success: `0 0 20px rgba(${semanticRgb.success}, 0.3)`,
		successPulse: `0 0 20px rgba(${semanticRgb.success}, 0.4), 0 0 40px rgba(${semanticRgb.success}, 0.15)`,
		error: `0 0 20px rgba(${semanticRgb.error}, 0.3)`,
		errorPulse: `0 0 20px rgba(${semanticRgb.error}, 0.4), 0 0 40px rgba(${semanticRgb.error}, 0.15)`,
		info: `0 0 20px rgba(${semanticRgb.info}, 0.3)`,
		warning: `0 0 20px rgba(${semanticRgb.warning}, 0.3)`,
		cardHover: `0 20px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(${primaryRgb}, 0.25)`,
		cardActive: `0 0 24px rgba(${primaryRgb}, 0.3), 0 12px 40px rgba(0, 0, 0, 0.3)`,
	};
}

export const glowTransition = "box-shadow 0.3s ease";
