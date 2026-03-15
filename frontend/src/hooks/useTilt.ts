/**
 * 3D parallax tilt hook for cards. Uses MotionValues to avoid re-renders.
 */

import type { MotionStyle } from "framer-motion";
import { useMotionValue, useSpring, useTransform } from "framer-motion";
import type { RefObject } from "react";
import { useCallback } from "react";

interface TiltConfig {
	maxTilt?: number;
	scale?: number;
	perspective?: number;
}

export function useTilt(
	ref: RefObject<HTMLElement | null>,
	{ maxTilt = 8, scale = 1.02, perspective = 1000 }: TiltConfig = {},
) {
	const mouseX = useMotionValue(0.5);
	const mouseY = useMotionValue(0.5);

	const springConfig = { stiffness: 300, damping: 30 };
	const rotateX = useSpring(
		useTransform(mouseY, [0, 1], [maxTilt, -maxTilt]),
		springConfig,
	);
	const rotateY = useSpring(
		useTransform(mouseX, [0, 1], [-maxTilt, maxTilt]),
		springConfig,
	);
	const scaleVal = useSpring(1, springConfig);

	const onMouseMove = useCallback(
		(e: React.MouseEvent) => {
			const el = ref.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			mouseX.set((e.clientX - rect.left) / rect.width);
			mouseY.set((e.clientY - rect.top) / rect.height);
			scaleVal.set(scale);
		},
		[ref, mouseX, mouseY, scaleVal, scale],
	);

	const onMouseLeave = useCallback(() => {
		mouseX.set(0.5);
		mouseY.set(0.5);
		scaleVal.set(1);
	}, [mouseX, mouseY, scaleVal]);

	const style: MotionStyle = {
		perspective,
		rotateX,
		rotateY,
		scale: scaleVal,
		transformStyle: "preserve-3d" as const,
	};

	return { style, onMouseMove, onMouseLeave };
}
