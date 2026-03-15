/**
 * Scroll-triggered entrance animation wrapper.
 */

import { motion, useInView, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useRef } from "react";

type Direction = "up" | "down" | "left" | "right";

interface ScrollRevealProps {
	children: ReactNode;
	direction?: Direction;
	delay?: number;
	duration?: number;
	distance?: number;
	once?: boolean;
}

const directionOffsets: Record<Direction, { x: number; y: number }> = {
	up: { x: 0, y: 40 },
	down: { x: 0, y: -40 },
	left: { x: 40, y: 0 },
	right: { x: -40, y: 0 },
};

export function ScrollReveal({
	children,
	direction = "up",
	delay = 0,
	duration,
	distance = 40,
	once = true,
}: ScrollRevealProps) {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once, margin: "-80px" });
	const prefersReduced = useReducedMotion();

	const offset = directionOffsets[direction];
	const scale = distance / 40; // scale the offset by custom distance

	if (prefersReduced) {
		return <div ref={ref}>{children}</div>;
	}

	return (
		<motion.div
			ref={ref}
			initial={{
				opacity: 0,
				x: offset.x * scale,
				y: offset.y * scale,
			}}
			animate={
				isInView
					? { opacity: 1, x: 0, y: 0 }
					: { opacity: 0, x: offset.x * scale, y: offset.y * scale }
			}
			transition={{
				type: "spring",
				stiffness: 300,
				damping: 30,
				delay,
				...(duration ? { duration } : {}),
			}}
		>
			{children}
		</motion.div>
	);
}
