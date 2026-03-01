/**
 * Empty State Component
 */

import InboxIcon from "@mui/icons-material/Inbox";
import {
	Box,
	Button,
	type SxProps,
	type Theme,
	Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useReducedMotion } from "@/utils/animations/hooks";

interface EmptyStateProps {
	icon?: ReactNode;
	title: string;
	description?: string;
	action?: {
		label: string;
		onClick: () => void;
	};
	sx?: SxProps<Theme>;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
	sx,
}: EmptyStateProps) {
	const reducedMotion = useReducedMotion();

	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				py: 8,
				px: 3,
				textAlign: "center",
				...sx,
			}}
		>
			<motion.div
				animate={reducedMotion ? undefined : { y: [0, -8, 0] }}
				transition={
					reducedMotion
						? undefined
						: { duration: 3, repeat: Infinity, ease: "easeInOut" }
				}
			>
				<Box
					sx={{
						mb: 2,
						color: "text.disabled",
						"& > svg": {
							fontSize: 64,
						},
					}}
				>
					{icon || <InboxIcon />}
				</Box>
			</motion.div>
			<Typography variant="h6" gutterBottom>
				{title}
			</Typography>
			{description && (
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ mb: 3, maxWidth: 300 }}
				>
					{description}
				</Typography>
			)}
			{action && (
				<Button variant="contained" onClick={action.onClick}>
					{action.label}
				</Button>
			)}
		</Box>
	);
}

export default EmptyState;
