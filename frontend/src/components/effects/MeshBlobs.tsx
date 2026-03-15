/**
 * Morphing gradient blob backgrounds with staggered infinite animations.
 */

import { motion, useReducedMotion } from "framer-motion";

const blobs = [
	{
		color: "rgba(249, 115, 22, 0.25)",
		size: 700,
		x: ["20%", "60%", "30%", "20%"],
		y: ["10%", "50%", "80%", "10%"],
		duration: 20,
	},
	{
		color: "rgba(139, 92, 246, 0.2)",
		size: 600,
		x: ["70%", "30%", "80%", "70%"],
		y: ["60%", "20%", "40%", "60%"],
		duration: 25,
	},
	{
		color: "rgba(59, 130, 246, 0.15)",
		size: 650,
		x: ["40%", "80%", "20%", "40%"],
		y: ["80%", "30%", "60%", "80%"],
		duration: 18,
	},
	{
		color: "rgba(16, 185, 129, 0.12)",
		size: 550,
		x: ["60%", "20%", "70%", "60%"],
		y: ["30%", "70%", "20%", "30%"],
		duration: 22,
	},
];

export function MeshBlobs() {
	const prefersReduced = useReducedMotion();

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
