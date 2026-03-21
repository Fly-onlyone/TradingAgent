/**
 * Ctrl+Wheel UI zoom — applies CSS zoom to <html> and exposes
 * a debounced visibility flag for the transient indicator.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "@/store/uiStore";

const MIN_SCALE = 0.75;
const MAX_SCALE = 1.5;
const STEP = 0.05;
const HIDE_DELAY = 800;

export function useUIScaleZoom() {
	const uiScale = useUIStore((s) => s.uiScale);
	const setUIScale = useUIStore((s) => s.setUIScale);
	const [visible, setVisible] = useState(false);
	const hideTimer = useRef<ReturnType<typeof setTimeout>>();
	const scaleRef = useRef(uiScale);
	scaleRef.current = uiScale;

	// Apply CSS zoom reactively
	useEffect(() => {
		document.documentElement.style.setProperty("zoom", String(uiScale));
		return () => {
			document.documentElement.style.removeProperty("zoom");
		};
	}, [uiScale]);

	const showIndicator = useCallback(() => {
		setVisible(true);
		clearTimeout(hideTimer.current);
		hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY);
	}, []);

	// Ctrl+Wheel listener
	useEffect(() => {
		const handleWheel = (e: WheelEvent) => {
			if (!e.ctrlKey) return;
			e.preventDefault();

			const direction = e.deltaY > 0 ? -1 : 1;
			const next =
				Math.round(
					Math.max(
						MIN_SCALE,
						Math.min(MAX_SCALE, scaleRef.current + direction * STEP),
					) * 100,
				) / 100;

			setUIScale(next);
			showIndicator();
		};

		window.addEventListener("wheel", handleWheel, { passive: false });
		return () => {
			window.removeEventListener("wheel", handleWheel);
			clearTimeout(hideTimer.current);
		};
	}, [setUIScale, showIndicator]);

	return { uiScale, visible };
}
