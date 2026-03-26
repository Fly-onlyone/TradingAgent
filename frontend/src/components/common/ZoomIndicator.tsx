/**
 * Transient zoom percentage indicator -- appears on Ctrl+Wheel, fades out after idle.
 */

import { AnimatePresence, motion } from "framer-motion";

interface ZoomIndicatorProps {
	uiScale: number;
	visible: boolean;
}

export function ZoomIndicator({ uiScale, visible }: ZoomIndicatorProps) {
	const percent = Math.round(uiScale * 100);

	return (
		<AnimatePresence>
			{visible && (
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 12 }}
					transition={{ duration: 0.18, ease: "easeOut" }}
					className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1499] pointer-events-none px-4 py-1 rounded-lg backdrop-blur-[12px] bg-[var(--glass-header-bg)] border border-[rgba(var(--primary-rgb),0.25)] shadow-[0_0_12px_rgba(var(--primary-rgb),0.15)]"
				>
					<span className="text-xs font-semibold tabular-nums">
						{percent}%
					</span>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
