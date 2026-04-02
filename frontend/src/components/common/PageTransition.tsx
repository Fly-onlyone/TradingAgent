/**
 * Page Transition Component using Framer Motion
 */

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useMotionTier, useReducedMotion } from "@/utils/animations/hooks";
import {
	pageEntrance,
	pageInstant,
	reducedMotionPage,
} from "@/utils/animations/variants";

interface PageTransitionProps {
	children: ReactNode;
	pageKey?: string;
	heavy?: boolean;
}

export function PageTransition({
	children,
	pageKey,
	heavy = false,
}: PageTransitionProps) {
	const reducedMotion = useReducedMotion();
	const motionTier = useMotionTier({ heavyRoute: heavy });
	const variants = reducedMotion
		? reducedMotionPage
		: motionTier === "full"
			? pageEntrance
			: pageInstant;

	return (
		<motion.div
			key={pageKey}
			initial="initial"
			animate="animate"
			variants={variants}
			style={{
				height: "100%",
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				flex: 1,
			}}
		>
			{children}
		</motion.div>
	);
}

export default PageTransition;
