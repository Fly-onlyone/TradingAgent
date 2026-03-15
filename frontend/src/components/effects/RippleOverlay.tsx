/**
 * Themed click ripple effect overlay.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

interface Ripple {
	id: number;
	x: number;
	y: number;
}

export function useRipple() {
	const [ripples, setRipples] = useState<Ripple[]>([]);
	const prefersReduced = useReducedMotion();

	const onRippleClick = useCallback(
		(e: React.MouseEvent<HTMLElement>) => {
			if (prefersReduced) return;
			const rect = e.currentTarget.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			const id = Date.now();
			setRipples((prev) => [...prev, { id, x, y }]);
			setTimeout(() => {
				setRipples((prev) => prev.filter((r) => r.id !== id));
			}, 600);
		},
		[prefersReduced],
	);

	return { ripples, onRippleClick };
}

interface RippleContainerProps {
	ripples: Ripple[];
	color?: string;
}

export function RippleContainer({
	ripples,
	color,
}: RippleContainerProps) {
	const resolvedColor = color ?? "rgba(var(--ripple-rgb, 249, 115, 22), 0.2)";
	return (
		<AnimatePresence>
			{ripples.map((ripple) => (
				<motion.div
					key={ripple.id}
					initial={{
						opacity: 0.3,
						scale: 0,
						x: ripple.x,
						y: ripple.y,
					}}
					animate={{
						opacity: 0,
						scale: 4,
					}}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.6, ease: "easeOut" }}
					style={{
						position: "absolute",
						width: 60,
						height: 60,
						borderRadius: "50%",
						background: resolvedColor,
						pointerEvents: "none",
						transform: "translate(-50%, -50%)",
						zIndex: 10,
					}}
				/>
			))}
		</AnimatePresence>
	);
}

interface RippleOverlayProps {
	children: ReactNode;
	color?: string;
}

export function RippleOverlay({ children, color }: RippleOverlayProps) {
	const { ripples, onRippleClick } = useRipple();

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: decorative ripple effect, not interactive
		// biome-ignore lint/a11y/useKeyWithClickEvents: decorative visual effect only
		<div
			style={{ position: "relative", overflow: "hidden" }}
			onClick={onRippleClick}
		>
			{children}
			<RippleContainer ripples={ripples} color={color} />
		</div>
	);
}
