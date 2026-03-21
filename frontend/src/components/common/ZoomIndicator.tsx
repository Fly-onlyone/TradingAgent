/**
 * Transient zoom percentage indicator — appears on Ctrl+Wheel, fades out after idle.
 */

import { Box, Typography } from "@mui/material";
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
				<Box
					component={motion.div}
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 12 }}
					transition={{ duration: 0.18, ease: "easeOut" }}
					sx={{
						position: "fixed",
						bottom: 24,
						left: "50%",
						transform: "translateX(-50%)",
						zIndex: (theme) => theme.zIndex.tooltip - 1,
						pointerEvents: "none",
						px: 2,
						py: 0.5,
						borderRadius: 2,
						backdropFilter: "blur(12px)",
						background: (theme) =>
							theme.trading.glass.header.background.replace(
								/[\d.]+\)$/,
								"0.75)",
							),
						border: (theme) =>
							`1px solid rgba(${theme.trading.primaryRgb}, 0.25)`,
						boxShadow: (theme) =>
							`0 0 12px rgba(${theme.trading.primaryRgb}, 0.15)`,
					}}
				>
					<Typography
						variant="caption"
						sx={{
							fontWeight: 600,
							color: "text.primary",
							fontVariantNumeric: "tabular-nums",
						}}
					>
						{percent}%
					</Typography>
				</Box>
			)}
		</AnimatePresence>
	);
}
