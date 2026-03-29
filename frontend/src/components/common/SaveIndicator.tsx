/**
 * Subtle inline save-status indicator with Framer Motion fade animations.
 */

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { Box, CircularProgress, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import type { SaveStatus } from "@/hooks/useDebouncedSave";

interface SaveIndicatorProps {
	status: SaveStatus;
}

const fade = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
	transition: { duration: 0.2 },
};

export function SaveIndicator({ status }: SaveIndicatorProps) {
	if (status === "idle") return null;

	return (
		<AnimatePresence mode="wait">
			{status === "pending" && (
				<motion.div key="pending" {...fade}>
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 0.5,
						}}
					>
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ fontStyle: "italic" }}
						>
							Unsaved changes...
						</Typography>
					</Box>
				</motion.div>
			)}

			{status === "saving" && (
				<motion.div key="saving" {...fade}>
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 0.5,
						}}
					>
						<CircularProgress size={14} />
						<Typography variant="caption" color="text.secondary">
							Saving...
						</Typography>
					</Box>
				</motion.div>
			)}

			{status === "saved" && (
				<motion.div key="saved" {...fade}>
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 0.5,
						}}
					>
						<CheckCircleOutlineIcon
							sx={{ fontSize: 16, color: "success.main" }}
						/>
						<Typography variant="caption" color="success.main">
							Saved
						</Typography>
					</Box>
				</motion.div>
			)}

			{status === "error" && (
				<motion.div key="error" {...fade}>
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 0.5,
						}}
					>
						<ErrorOutlineIcon sx={{ fontSize: 16, color: "error.main" }} />
						<Typography variant="caption" color="error.main">
							Failed to save
						</Typography>
					</Box>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
