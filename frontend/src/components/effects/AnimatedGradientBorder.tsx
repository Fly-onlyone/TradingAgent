/**
 * Rotating conic-gradient card border.
 * Uses CSS @property animation (compositor thread — zero JS cost).
 */

import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface AnimatedGradientBorderProps {
	children: ReactNode;
	borderWidth?: number;
	borderRadius?: number;
	colors?: string[];
	animationDuration?: string;
	disabled?: boolean;
}

export function AnimatedGradientBorder({
	children,
	borderWidth = 1,
	borderRadius = 12,
	colors = ["#F97316", "#8B5CF6", "#3B82F6", "#F97316"],
	animationDuration = "3s",
	disabled = false,
}: AnimatedGradientBorderProps) {
	const prefersReduced = useReducedMotion();
	const isStatic = disabled || prefersReduced;

	return (
		<div
			style={{
				position: "relative",
				borderRadius,
				padding: borderWidth,
				background: isStatic
					? colors[0]
					: `conic-gradient(from var(--gradient-angle), ${colors.join(", ")})`,
				animation: isStatic
					? undefined
					: `gradientBorderSpin ${animationDuration} linear infinite`,
				isolation: "isolate",
			}}
		>
			<div
				style={{
					borderRadius: borderRadius - borderWidth,
					overflow: "hidden",
					position: "relative",
					zIndex: 1,
				}}
			>
				{children}
			</div>
		</div>
	);
}
