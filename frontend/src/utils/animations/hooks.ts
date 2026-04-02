/**
 * Animation hooks — reduced motion, adaptive motion tier, and page visibility.
 */

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/uiStore";

export type MotionTier = "full" | "reduced" | "minimal";

type AdaptiveMotionOptions = {
	heavyRoute?: boolean;
};

type NavigatorWithMemory = Navigator & {
	deviceMemory?: number;
};

function getMediaReducedMotion(): boolean {
	return (
		globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
	);
}

function isLowPowerDevice(): boolean {
	if (typeof navigator === "undefined") {
		return false;
	}

	const nav = navigator as NavigatorWithMemory;
	const deviceMemory = nav.deviceMemory ?? 8;
	const hardwareConcurrency = navigator.hardwareConcurrency ?? 8;

	return deviceMemory <= 4 || hardwareConcurrency <= 4;
}

/**
 * Reads `useUIStore.reducedMotion` AND browser `prefers-reduced-motion`.
 * When true every animation should use duration:0.
 */
export function useReducedMotion(): boolean {
	const storeReduced = useUIStore((s) => s.reducedMotion);
	return storeReduced || getMediaReducedMotion();
}

/**
 * Choose an adaptive motion tier based on user preference, device capability,
 * and whether the current route is known to be render-heavy.
 */
export function useMotionTier({
	heavyRoute = false,
}: AdaptiveMotionOptions = {}): MotionTier {
	const storeReduced = useUIStore((s) => s.reducedMotion);
	const effectsEnabled = useUIStore((s) => s.effectsEnabled);
	const mediaReduced = getMediaReducedMotion();
	const lowPowerDevice = isLowPowerDevice();

	if (storeReduced || mediaReduced) {
		return "minimal";
	}

	if (!effectsEnabled) {
		return "reduced";
	}

	if (heavyRoute && lowPowerDevice) {
		return "minimal";
	}

	if (heavyRoute || lowPowerDevice) {
		return "reduced";
	}

	return "full";
}

/**
 * Track document visibility so polling can pause when a page is hidden.
 */
export function usePageVisibility(): boolean {
	const [isVisible, setIsVisible] = useState(
		typeof document === "undefined" ? true : !document.hidden,
	);

	useEffect(() => {
		if (typeof document === "undefined") {
			return undefined;
		}

		const handleVisibilityChange = () => {
			setIsVisible(!document.hidden);
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);

	return isVisible;
}
