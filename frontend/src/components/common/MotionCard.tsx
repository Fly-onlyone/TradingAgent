/**
 * Motion-enhanced Card wrapper with configurable hover effects.
 */

import { Card, type CardProps } from "@mui/material";
import { type MotionProps, motion } from "framer-motion";
import { useRef } from "react";
import { useReducedMotion } from "@/utils/animations/hooks";
import { spring } from "@/utils/animations/variants";

type HoverEffect = "lift" | "glow" | "tilt" | "none";

interface MotionCardProps extends Omit<CardProps, keyof MotionProps> {
	hoverEffect?: HoverEffect;
	children?: React.ReactNode;
}

const hoverConfigs: Record<
	HoverEffect,
	{ whileHover?: MotionProps["whileHover"]; whileTap?: MotionProps["whileTap"] }
> = {
	lift: {
		whileHover: {
			y: -8,
			boxShadow: "0 20px 40px rgba(0, 0, 0, 0.35)",
			transition: spring.snappy,
		},
		whileTap: { scale: 0.98, transition: spring.snappy },
	},
	glow: {
		whileHover: {
			boxShadow:
				"0 12px 40px rgba(0, 0, 0, 0.3), 0 0 24px rgba(249, 115, 22, 0.25)",
			transition: spring.snappy,
		},
		whileTap: { scale: 0.98, transition: spring.snappy },
	},
	tilt: {
		whileTap: { scale: 0.98, transition: spring.snappy },
	},
	none: {},
};

export function MotionCard({
	hoverEffect = "lift",
	children,
	sx,
	...rest
}: MotionCardProps) {
	const reduced = useReducedMotion();
	const cardRef = useRef<HTMLDivElement>(null);
	const config = reduced ? hoverConfigs.none : hoverConfigs[hoverEffect];

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		if (hoverEffect !== "tilt" || reduced || !cardRef.current) return;
		const rect = cardRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const centerX = rect.width / 2;
		const centerY = rect.height / 2;
		const rotateX = ((y - centerY) / centerY) * -4;
		const rotateY = ((x - centerX) / centerX) * 4;
		cardRef.current.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
	};

	const handleMouseLeave = () => {
		if (hoverEffect !== "tilt" || !cardRef.current) return;
		cardRef.current.style.transform = "";
	};

	return (
		<Card
			ref={cardRef}
			component={motion.div}
			whileHover={config.whileHover}
			whileTap={config.whileTap}
			onMouseMove={hoverEffect === "tilt" ? handleMouseMove : undefined}
			onMouseLeave={hoverEffect === "tilt" ? handleMouseLeave : undefined}
			sx={{
				transition:
					hoverEffect === "tilt" ? "transform 0.15s ease-out" : undefined,
				...sx,
			}}
			{...(rest as any)}
		>
			{children}
		</Card>
	);
}

export default MotionCard;
