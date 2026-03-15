/**
 * Magnetic hover effect — element gently attracts toward cursor.
 */

import type { MotionStyle } from "framer-motion";
import { useMotionValue, useSpring } from "framer-motion";
import type { RefObject } from "react";
import { useCallback } from "react";

interface MagneticConfig {
	strength?: number;
	radius?: number;
}

export function useMagneticHover(
	ref: RefObject<HTMLElement | null>,
	{ strength = 0.3, radius = 100 }: MagneticConfig = {},
) {
	const x = useMotionValue(0);
	const y = useMotionValue(0);
	const springConfig = { stiffness: 200, damping: 20 };
	const sx = useSpring(x, springConfig);
	const sy = useSpring(y, springConfig);

	const onMouseMove = useCallback(
		(e: React.MouseEvent) => {
			const el = ref.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			const dx = e.clientX - cx;
			const dy = e.clientY - cy;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < radius) {
				x.set(dx * strength);
				y.set(dy * strength);
			}
		},
		[ref, x, y, strength, radius],
	);

	const onMouseLeave = useCallback(() => {
		x.set(0);
		y.set(0);
	}, [x, y]);

	const style: MotionStyle = {
		x: sx,
		y: sy,
	};

	return { style, onMouseMove, onMouseLeave };
}
