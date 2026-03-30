/**
 * Morphing gradient blob backgrounds with staggered infinite animations.
 * Blob count and cycle duration are driven by the active theme preset.
 */

import { useTheme } from "@mui/material/styles";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";

// Waypoint patterns — each blob starts in a distinct grid sector
// to ensure even brightness distribution across the entire viewport.
// Grid layout (start positions):
//   0: top-left      1: top-right     2: mid-left
//   3: mid-right     4: bottom-left   5: bottom-right
//   6: center-top    7: center-bottom
const waypoints = [
	{
		// top-left → drifts center → bottom-left → back
		x: ["10%", "40%", "15%", "10%"],
		y: ["8%", "35%", "55%", "8%"],
	},
	{
		// top-right → drifts left → center → back
		x: ["80%", "50%", "70%", "80%"],
		y: ["5%", "30%", "15%", "5%"],
	},
	{
		// mid-left → drifts down-right → up → back
		x: ["5%", "35%", "20%", "5%"],
		y: ["45%", "70%", "35%", "45%"],
	},
	{
		// mid-right → drifts center → down → back
		x: ["85%", "55%", "75%", "85%"],
		y: ["50%", "35%", "65%", "50%"],
	},
	{
		// bottom-left → drifts up-right → back
		x: ["15%", "45%", "25%", "15%"],
		y: ["80%", "55%", "90%", "80%"],
	},
	{
		// bottom-right → drifts left → center-bottom → back
		x: ["80%", "55%", "90%", "80%"],
		y: ["85%", "60%", "75%", "85%"],
	},
	{
		// center-top → drifts right → left → back
		x: ["45%", "70%", "30%", "45%"],
		y: ["20%", "10%", "30%", "20%"],
	},
	{
		// center-bottom → drifts up → right → back
		x: ["50%", "35%", "65%", "50%"],
		y: ["70%", "45%", "80%", "70%"],
	},
];

const sizes = [700, 600, 650, 550, 620];
const alphas = [0.4, 0.25, 0.2, 0.18, 0.22];

function hexToRgb(hex: string) {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `${r}, ${g}, ${b}`;
}

export function MeshBlobs() {
	const prefersReduced = useReducedMotion();
	const theme = useTheme();
	const { meshBlobCount, meshBlobCycleMin, meshBlobCycleMax } =
		theme.trading.animations;
	const primaryMain = theme.palette.primary.main;
	const secondaryMain = theme.palette.secondary.main;

	const blobs = useMemo(() => {
		const primaryRgb = hexToRgb(primaryMain);
		const secondaryRgb = hexToRgb(secondaryMain);
		return Array.from({ length: meshBlobCount }, (_, i) => {
			const wp = waypoints[i % waypoints.length];
			const frac = meshBlobCount > 1 ? i / (meshBlobCount - 1) : 0;
			const duration =
				meshBlobCycleMin + frac * (meshBlobCycleMax - meshBlobCycleMin);
			// Alternate primary and secondary colors for visual depth
			const rgb = i % 3 === 2 ? secondaryRgb : primaryRgb;
			return {
				color: `rgba(${rgb}, ${alphas[i % alphas.length]})`,
				size: sizes[i % sizes.length],
				x: wp.x,
				y: wp.y,
				duration,
			};
		});
	}, [
		meshBlobCount,
		meshBlobCycleMin,
		meshBlobCycleMax,
		primaryMain,
		secondaryMain,
	]);

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				overflow: "hidden",
				pointerEvents: "none",
				zIndex: 0,
			}}
		>
			{blobs.map((blob, i) => (
				<motion.div
					key={`blob-${String(i)}`}
					animate={
						prefersReduced
							? undefined
							: {
									left: blob.x,
									top: blob.y,
									scale: [1, 1.2, 0.9, 1],
									rotate: [0, 90, 180, 360],
								}
					}
					transition={
						prefersReduced
							? undefined
							: {
									duration: blob.duration,
									repeat: Infinity,
									ease: "linear",
								}
					}
					style={{
						position: "absolute",
						width: blob.size,
						height: blob.size,
						borderRadius: "50%",
						background: blob.color,
						filter: "blur(100px)",
						willChange: "transform",
						left: blob.x[0],
						top: blob.y[0],
						transform: "translate(-50%, -50%)",
					}}
				/>
			))}
		</div>
	);
}
