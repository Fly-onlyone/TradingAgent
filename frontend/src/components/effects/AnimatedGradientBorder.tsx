/**
 * Rotating conic-gradient card border.
 * Uses CSS @property animation (compositor thread — zero JS cost).
 */

import { useTheme } from "@mui/material/styles";
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
	colors,
	animationDuration = "3s",
	disabled = false,
}: AnimatedGradientBorderProps) {
	const prefersReduced = useReducedMotion();
	const isStatic = disabled || prefersReduced;
	const theme = useTheme();

	const resolvedColors = colors ?? [
		theme.palette.primary.main,
		theme.palette.primary.light,
		theme.palette.primary.dark,
		theme.palette.primary.main,
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
