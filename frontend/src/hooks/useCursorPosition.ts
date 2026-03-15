/**
 * Shared cursor position hook using MotionValues (no React re-renders).
 */

import { useMotionValue } from "framer-motion";
import { useEffect } from "react";

const globalX = { current: 0 };
const globalY = { current: 0 };
let listenerCount = 0;

function onMouseMove(e: MouseEvent) {
	globalX.current = e.clientX;
	globalY.current = e.clientY;
}

export function useCursorPosition() {
	const x = useMotionValue(0);
	const y = useMotionValue(0);

	useEffect(() => {
		function update(e: MouseEvent) {
			x.set(e.clientX);
			y.set(e.clientY);
		}

		listenerCount++;
		if (listenerCount === 1) {
			document.addEventListener("mousemove", onMouseMove, { passive: true });
		}
		document.addEventListener("mousemove", update, { passive: true });

		return () => {
			document.removeEventListener("mousemove", update);
			listenerCount--;
			if (listenerCount === 0) {
				document.removeEventListener("mousemove", onMouseMove);
			}
		};
	}, [x, y]);

	return { x, y };
}
