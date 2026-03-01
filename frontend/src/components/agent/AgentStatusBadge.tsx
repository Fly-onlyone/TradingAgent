/**
 * Agent Status Badge Component
 */

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import SyncIcon from "@mui/icons-material/Sync";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import { Box, Chip } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import type { AgentStatus } from "@/types/session";

interface AgentStatusBadgeProps {
	status: AgentStatus;
	showLabel?: boolean;
}

const statusConfig: Record<
	AgentStatus,
	{
		label: string;
		color: "default" | "success" | "warning" | "error" | "info";
		icon: typeof CheckCircleIcon;
		animate?: boolean;
	}
> = {
	disconnected: {
		label: "Disconnected",
		color: "default",
		icon: WifiOffIcon,
	},
	connected: {
		label: "Online",
		color: "success",
		icon: CheckCircleIcon,
	},
	thinking: {
		label: "Thinking...",
		color: "info",
		icon: SyncIcon,
		animate: true,
	},
	analyzing: {
		label: "Analyzing...",
		color: "warning",
		icon: SyncIcon,
		animate: true,
	},
	error: {
		label: "Error",
		color: "error",
		icon: ErrorIcon,
	},
	auth_required: {
		label: "Auth Required",
		color: "warning",
		icon: ErrorIcon,
	},
};

export function AgentStatusBadge({
	status,
	showLabel = true,
}: AgentStatusBadgeProps) {
	const config = statusConfig[status];
	const Icon = config.icon;

	return (
		<AnimatePresence mode="wait">
			<motion.div
				key={status}
				initial={{ opacity: 0, scale: 0.8 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.8 }}
				transition={{ duration: 0.15 }}
				style={{ display: "inline-flex" }}
			>
				<Chip
					icon={
						config.animate ? (
							<motion.div
								animate={{ rotate: 360 }}
								transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
								style={{ display: "flex" }}
							>
								<Icon sx={{ fontSize: 16 }} />
							</motion.div>
						) : (
							<Icon sx={{ fontSize: 16 }} />
						)
					}
					label={showLabel ? config.label : undefined}
					color={config.color}
					size="small"
					variant="outlined"
					sx={{
						"& .MuiChip-icon": {
							ml: showLabel ? undefined : 0,
							mr: showLabel ? undefined : 0,
						},
						minWidth: showLabel ? undefined : 32,
					}}
				/>
			</motion.div>
		</AnimatePresence>
	);
}

// Animated pulse indicator for online status
export function OnlineIndicator({ isOnline }: { isOnline: boolean }) {
	return (
		<Box sx={{ position: "relative", display: "inline-flex" }}>
			<Box
				sx={{
					width: 8,
					height: 8,
					borderRadius: "50%",
					bgcolor: isOnline ? "success.main" : "error.main",
				}}
			/>
			{isOnline && (
				<>
					<motion.div
						animate={{ scale: [1, 2.5], opacity: [0.7, 0] }}
						transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: 8,
							height: 8,
							borderRadius: "50%",
							backgroundColor: "#10B981",
						}}
					/>
					<motion.div
						animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
						transition={{
							duration: 2,
							repeat: Infinity,
							ease: "easeOut",
							delay: 0.6,
						}}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: 8,
							height: 8,
							borderRadius: "50%",
							backgroundColor: "#10B981",
						}}
					/>
				</>
			)}
		</Box>
	);
}

export default AgentStatusBadge;
