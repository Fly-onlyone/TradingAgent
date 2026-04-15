/**
 * Animation hooks — reduced motion and page visibility.
 */

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/uiStore";

function getMediaReducedMotion(): boolean {
	return (
		globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
	);
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
