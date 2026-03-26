/**
 * Rotating conic-gradient card border.
 * Uses CSS @property animation (compositor thread -- zero JS cost).
 */

import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { useThemePreset } from "@/lib/theme";

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
	colors,
	animationDuration = "3s",
	disabled = false,
}: AnimatedGradientBorderProps) {
	const prefersReduced = useReducedMotion();
	const isStatic = disabled || prefersReduced;
	const preset = useThemePreset();

	const resolvedColors = colors ?? [
		preset.primary.main,
		preset.primary.light,
		preset.primary.dark,
		preset.primary.main,
	];

	return (
		<div
			style={{
				position: "relative",
				borderRadius,
				padding: borderWidth,
				background: isStatic
					? resolvedColors[0]
					: `conic-gradient(from var(--gradient-angle), ${resolvedColors.join(", ")})`,
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
