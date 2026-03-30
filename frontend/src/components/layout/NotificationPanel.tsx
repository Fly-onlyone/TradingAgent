/**
 * Notification panel popover — shows active + recent notifications.
 */

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CloseIcon from "@mui/icons-material/Close";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, IconButton, Popover, Typography, useTheme } from "@mui/material";
import type { PopoverPosition } from "@mui/material/Popover";
import { AnimatePresence, motion } from "framer-motion";
import type { NotificationConfig } from "@/store/uiStore";
import { useUIStore } from "@/store/uiStore";
import { useReducedMotion } from "@/utils/animations/hooks";
import { spring, staggerCascade } from "@/utils/animations/variants";

const typeIcon: Record<NotificationConfig["type"], React.ReactNode> = {
	success: <CheckCircleOutlineIcon fontSize="small" color="success" />,
	error: <ErrorOutlineIcon fontSize="small" color="error" />,
	warning: <WarningAmberIcon fontSize="small" color="warning" />,
	info: <InfoOutlinedIcon fontSize="small" color="info" />,
};

function timeAgo(ts: number): string {
	const seconds = Math.floor((Date.now() - ts) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

interface NotificationPanelProps {
	anchorPosition: PopoverPosition | null;
	onClose: () => void;
}

export function NotificationPanel({
	anchorPosition,
	onClose,
}: NotificationPanelProps) {
	const theme = useTheme();
	const reducedMotion = useReducedMotion();
	const notifications = useUIStore((s) => s.notifications);
	const history = useUIStore((s) => s.notificationHistory);
	const removeNotification = useUIStore((s) => s.removeNotification);
	const clearNotifications = useUIStore((s) => s.clearNotifications);
	const clearHistory = useUIStore((s) => s.clearNotificationHistory);

	const allItems = [...notifications, ...history];
	const hasItems = allItems.length > 0;

	return (
		<Popover
			open={Boolean(anchorPosition)}
			anchorReference="anchorPosition"
			anchorPosition={anchorPosition ?? undefined}
			onClose={onClose}
			transformOrigin={{ vertical: "top", horizontal: "right" }}
			slotProps={{
				paper: {
					sx: {
						width: 340,
						maxHeight: 420,
						mt: 1,
						background: theme.trading.glass.card.background,
						backdropFilter: "blur(24px)",
						WebkitBackdropFilter: "blur(24px)",
						border: `1px solid ${theme.trading.border.subtle}`,
						borderRadius: theme.trading.glass.card.borderRadius,
						overflow: "hidden",
					},
				},
			}}
		>
			{/* Header */}
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					px: 2,
					py: 1.5,
					borderBottom: `1px solid ${theme.trading.border.subtle}`,
				}}
			>
				<Typography variant="subtitle2" fontWeight={700}>
					Notifications
				</Typography>
				{hasItems && (
					<IconButton
						size="small"
						onClick={() => {
							clearNotifications();
							clearHistory();
						}}
						sx={{ color: "text.secondary" }}
					>
						<DeleteSweepIcon fontSize="small" />
					</IconButton>
				)}
			</Box>

			{/* Content */}
			<Box sx={{ overflowY: "auto", maxHeight: 360 }}>
				{!hasItems ? (
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							py: 6,
							color: "text.secondary",
						}}
					>
						<NotificationsNoneIcon sx={{ fontSize: 40, mb: 1, opacity: 0.4 }} />
						<Typography variant="body2" color="text.secondary">
							No notifications
						</Typography>
					</Box>
				) : (
					<motion.div
						variants={reducedMotion ? undefined : staggerCascade.container}
						initial="hidden"
						animate="visible"
					>
						<AnimatePresence>
							{allItems.map((item) => {
								const isActive = notifications.some((n) => n.id === item.id);
								return (
									<motion.div
										key={item.id}
										variants={reducedMotion ? undefined : staggerCascade.item}
										exit={{ opacity: 0, x: 40 }}
										transition={spring.snappy}
										layout
									>
										<Box
											sx={{
												display: "flex",
												alignItems: "flex-start",
												gap: 1.5,
												px: 2,
												py: 1.25,
												opacity: isActive ? 1 : 0.6,
												borderBottom: `1px solid ${theme.trading.border.subtle}`,
												"&:last-child": {
													borderBottom: "none",
												},
												"&:hover": {
													background: `rgba(${theme.trading.primaryRgb}, 0.04)`,
												},
											}}
										>
											<Box sx={{ pt: 0.25 }}>{typeIcon[item.type]}</Box>
											<Box sx={{ flex: 1, minWidth: 0 }}>
												<Typography variant="body2" fontWeight={600} noWrap>
													{item.title}
												</Typography>
												{item.message && (
													<Typography
														variant="caption"
														color="text.secondary"
														sx={{
															display: "-webkit-box",
															WebkitLineClamp: 2,
															WebkitBoxOrient: "vertical",
															overflow: "hidden",
														}}
													>
														{item.message}
													</Typography>
												)}
												<Typography
													variant="caption"
													color="text.disabled"
													sx={{ fontSize: "0.65rem" }}
												>
													{timeAgo(item.createdAt)}
												</Typography>
											</Box>
											{isActive && (
												<IconButton
													size="small"
													onClick={() => removeNotification(item.id)}
													sx={{
														color: "text.secondary",
														p: 0.25,
													}}
												>
													<CloseIcon sx={{ fontSize: 16 }} />
												</IconButton>
											)}
										</Box>
									</motion.div>
								);
							})}
						</AnimatePresence>
					</motion.div>
				)}
			</Box>
		</Popover>
	);
}
