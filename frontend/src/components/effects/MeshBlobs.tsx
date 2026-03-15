/**
 * Morphing gradient blob backgrounds with staggered infinite animations.
 * Blob count and cycle duration are driven by the active theme preset.
 */

import { useTheme } from "@mui/material/styles";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";

// Waypoint patterns — cycled by blob index
const waypoints = [
	{
		x: ["20%", "60%", "30%", "20%"],
		y: ["10%", "50%", "80%", "10%"],
	},
	{
		x: ["70%", "30%", "80%", "70%"],
		y: ["60%", "20%", "40%", "60%"],
	},
	{
		x: ["40%", "80%", "20%", "40%"],
		y: ["80%", "30%", "60%", "80%"],
	},
	{
		x: ["60%", "20%", "70%", "60%"],
		y: ["30%", "70%", "20%", "30%"],
	},
	{
		x: ["50%", "10%", "60%", "50%"],
		y: ["20%", "60%", "40%", "20%"],
	},
];

const sizes = [700, 600, 650, 550, 620];
const alphas = [0.4, 0.25, 0.2, 0.18, 0.22];

export function MeshBlobs() {
	const prefersReduced = useReducedMotion();
	const theme = useTheme();
	const { meshBlobCount, meshBlobCycleMin, meshBlobCycleMax } =
		theme.trading.animations;
	const primaryMain = theme.palette.primary.main;

	// Convert hex to RGB for rgba()
	const hexToRgb = (hex: string) => {
		const r = Number.parseInt(hex.slice(1, 3), 16);
		const g = Number.parseInt(hex.slice(3, 5), 16);
		const b = Number.parseInt(hex.slice(5, 7), 16);
		return `${r}, ${g}, ${b}`;
	};

	const blobs = useMemo(() => {
		const rgb = hexToRgb(primaryMain);
		return Array.from({ length: meshBlobCount }, (_, i) => {
			const wp = waypoints[i % waypoints.length];
			const frac = meshBlobCount > 1 ? i / (meshBlobCount - 1) : 0;
			const duration =
				meshBlobCycleMin +
				frac * (meshBlobCycleMax - meshBlobCycleMin);
			return {
				color: `rgba(${rgb}, ${alphas[i % alphas.length]})`,
				size: sizes[i % sizes.length],
				x: wp.x,
				y: wp.y,
				duration,
			};
		});
	}, [meshBlobCount, meshBlobCycleMin, meshBlobCycleMax, primaryMain]);

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
