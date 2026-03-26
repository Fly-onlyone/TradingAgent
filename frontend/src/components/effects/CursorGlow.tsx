/**
 * Mouse-following ambient radial glow effect.
 */

import { motion, useReducedMotion, useSpring } from "framer-motion";

import { useCursorPosition } from "@/hooks/useCursorPosition";
import { useThemePreset } from "@/lib/theme";

export function CursorGlow() {
	const { x, y } = useCursorPosition();
	const prefersReduced = useReducedMotion();
	const preset = useThemePreset();

	const springConfig = { stiffness: 50, damping: 30 };
	const smoothX = useSpring(x, springConfig);
	const smoothY = useSpring(y, springConfig);

	if (prefersReduced) return null;

	const rgb = preset.primaryRgb;

	return (
		<motion.div
			style={{
				position: "fixed",
				width: 800,
				height: 800,
				borderRadius: "50%",
				background: `radial-gradient(circle, rgba(${rgb},0.3) 0%, rgba(${rgb},0.08) 40%, transparent 70%)`,
				x: smoothX,
				y: smoothY,
				translateX: "-50%",
				translateY: "-50%",
				pointerEvents: "none",
				zIndex: 0,
			}}
		/>
	);
}
