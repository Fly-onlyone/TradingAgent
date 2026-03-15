/**
 * Mini SVG sparkline chart with draw-in animation.
 */

import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";

interface SparklineProps {
	data: number[];
	width?: number;
	height?: number;
	strokeColor?: string;
	fillColor?: string;
}

export function Sparkline({
	data,
	width = 120,
	height = 32,
	strokeColor = "#F97316",
	fillColor = "rgba(249, 115, 22, 0.15)",
}: SparklineProps) {
	const prefersReduced = useReducedMotion();
	const gradientId = useId();

	if (data.length < 2) return null;

	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;
	const padding = 2;

	const points = data.map((v, i) => ({
		x: padding + (i / (data.length - 1)) * (width - padding * 2),
		y: padding + (1 - (v - min) / range) * (height - padding * 2),
	}));

	const linePath = points
		.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
		.join(" ");
	const fillPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

	const lastPoint = points[points.length - 1];
	const isUp = data[data.length - 1] >= data[0];
	const dotColor = isUp ? "#10B981" : "#EF4444";

	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label="Sparkline chart"
		>
			<title>Sparkline</title>
			{/* Gradient fill */}
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={fillColor} />
					<stop offset="100%" stopColor="transparent" />
				</linearGradient>
			</defs>
			<path d={fillPath} fill={`url(#${gradientId})`} opacity={0.6} />

			{/* Line */}
			<motion.path
				d={linePath}
				fill="none"
				stroke={strokeColor}
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
				initial={prefersReduced ? undefined : { pathLength: 0 }}
				animate={{ pathLength: 1 }}
				transition={{ duration: 1.2, ease: "easeOut" }}
			/>

			{/* Pulsing dot at last point */}
			<motion.circle
				cx={lastPoint.x}
				cy={lastPoint.y}
				r={3}
				fill={dotColor}
				animate={
					prefersReduced
						? undefined
						: {
								r: [3, 4.5, 3],
								opacity: [1, 0.7, 1],
							}
				}
				transition={
					prefersReduced
						? undefined
						: {
								duration: 2,
								repeat: Infinity,
								ease: "easeInOut",
							}
				}
			/>
		</svg>
	);
}
