/**
 * Header Component
 */

import LogoutIcon from "@mui/icons-material/Logout";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import SettingsIcon from "@mui/icons-material/Settings";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import {
	AppBar,
	Avatar,
	Badge,
	Box,
	Divider,
	IconButton,
	MenuItem,
	Popover,
	Toolbar,
	Tooltip,
	Typography,
} from "@mui/material";
import type { PopoverPosition } from "@mui/material/Popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { tasksApi } from "@/api/endpoints/tasks";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusDot } from "@/components/common/StatusDot";
import { ThemeSelector } from "@/components/common/ThemeSelector";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { useAuth } from "@/hooks/useAuth";
import { useAgentStore } from "@/store/agentStore";
import { notify, useUIStore } from "@/store/uiStore";

const QK_EMERGENCY_STATUS = ["agent-emergency-status"] as const;
const QK_TASKS = ["tasks"] as const;

export function Header() {
	const { user, logout } = useAuth();
	const { notifications } = useUIStore();
	const uiScale = useUIStore((s) => s.uiScale);
	const backendStatus = useUIStore((s) => s.backendStatus);
	const backendStatusMessage = useUIStore((s) => s.backendStatusMessage);
	const agentStatus = useAgentStore((s) => s.status);
	const accountButtonRef = useRef<HTMLButtonElement | null>(null);
	const [accountMenuPosition, setAccountMenuPosition] =
		useState<PopoverPosition | null>(null);

	// Notification panel
	const notifButtonRef = useRef<HTMLButtonElement | null>(null);
	const [notifPosition, setNotifPosition] = useState<PopoverPosition | null>(
		null,
	);

	const openNotifPanel = useCallback(() => {
		const button = notifButtonRef.current;
		if (!button) return;
		const rect = button.getBoundingClientRect();
		const zoom = uiScale || 1;
		setNotifPosition({
			top: rect.bottom / zoom,
			left: rect.right / zoom,
		});
	}, [uiScale]);

	const updateAccountMenuPosition = useCallback(() => {
		const button = accountButtonRef.current;
		if (!button) return;
		const rect = button.getBoundingClientRect();
		const zoom = uiScale || 1;
		setAccountMenuPosition({
			top: rect.bottom / zoom,
			left: rect.right / zoom,
		});
	}, [uiScale]);

	const toggleAccountMenu = useCallback(() => {
		if (accountMenuPosition) {
			setAccountMenuPosition(null);
			return;
		}

		updateAccountMenuPosition();
	}, [accountMenuPosition, updateAccountMenuPosition]);

	const handleClose = () => {
		setAccountMenuPosition(null);
	};

	const handleLogout = () => {
		handleClose();
		logout();
	};

	// Emergency stop / resume
	const [emergencyStopOpen, setEmergencyStopOpen] = useState(false);
	const [resumeAllOpen, setResumeAllOpen] = useState(false);
	const queryClient = useQueryClient();
	const emergencyStatusQuery = useQuery({
		queryKey: QK_EMERGENCY_STATUS,
		queryFn: () => tasksApi.emergencyStatus(),
		enabled: Boolean(user),
		refetchInterval: 30_000,
		staleTime: 10_000,
	});
	const emergencyActive = emergencyStatusQuery.data?.active ?? false;
	const invalidateEmergencyRelated = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: QK_TASKS });
		void queryClient.invalidateQueries({ queryKey: QK_EMERGENCY_STATUS });
	}, [queryClient]);
	const emergencyStopMutation = useMutation({
		mutationFn: () => tasksApi.emergencyStop(),
		onSuccess: (data) => {
			setEmergencyStopOpen(false);
			notify.success(
				"Emergency Stop",
				`Paused ${data.pausedCount} active task${data.pausedCount === 1 ? "" : "s"} and halted strategy discovery.`,
			);
			invalidateEmergencyRelated();
		},
		onError: () => {
			notify.error("Emergency Stop Failed", "Could not pause tasks.");
		},
	});
	const resumeAllMutation = useMutation({
		mutationFn: () => tasksApi.resumeAll(),
		onSuccess: (data) => {
			setResumeAllOpen(false);
			notify.success(
				"Resumed",
				`Resumed ${data.resumedCount} task${data.resumedCount === 1 ? "" : "s"} and re-enabled strategy discovery.`,
			);
			invalidateEmergencyRelated();
		},
		onError: () => {
			notify.error("Resume Failed", "Could not resume tasks.");
		},
	});

	const unreadCount = notifications.length;
	const isAccountMenuOpen = Boolean(accountMenuPosition);

	useEffect(() => {
		if (!isAccountMenuOpen) return;

		const handleLayoutChange = () => {
			window.requestAnimationFrame(updateAccountMenuPosition);
		};

		handleLayoutChange();
		window.addEventListener("resize", handleLayoutChange);
		window.addEventListener("scroll", handleLayoutChange, true);

		return () => {
			window.removeEventListener("resize", handleLayoutChange);
			window.removeEventListener("scroll", handleLayoutChange, true);
		};
	}, [isAccountMenuOpen, updateAccountMenuPosition]);

	return (
		<AppBar
			position="fixed"
			sx={{
				zIndex: (theme) => theme.zIndex.drawer + 1,
				background: (theme) => theme.trading.glass.header.background,
				backdropFilter: (theme) => theme.trading.glass.header.backdropFilter,
				borderBottom: "none",
				"&::after": {
					content: '""',
					position: "absolute",
					bottom: 0,
					left: 0,
					right: 0,
					height: "1.5px",
					background: (theme) => theme.trading.gradientAccent,
					backgroundSize: "200% 100%",
					animation: "gradientSlide 4s linear infinite",
				},
				"@keyframes gradientSlide": {
					"0%": { backgroundPosition: "0% 0" },
					"100%": { backgroundPosition: "200% 0" },
				},
			}}
		>
			<Toolbar sx={{ minHeight: "52px !important", px: { xs: 2, sm: 3 } }}>
				{/* Brand */}
				<Box
					component={Link}
					to="/"
					sx={{
						display: "flex",
						alignItems: "center",
						textDecoration: "none",
						gap: 1,
						flexGrow: 1,
					}}
				>
					<img
						src="/coin.png"
						alt="TradingBot"
						width={24}
						height={24}
						style={{ display: "block" }}
					/>
					<Typography
						variant="subtitle2"
						fontWeight={700}
						noWrap
						sx={{
							background: (t) =>
								`linear-gradient(135deg, ${t.palette.primary.main} 0%, ${t.palette.primary.light} 100%)`,
							backgroundSize: "200% 100%",
							backgroundClip: "text",
							WebkitBackgroundClip: "text",
							WebkitTextFillColor: "transparent",
							animation: "brandShine 3.5s linear infinite",
							"@keyframes brandShine": {
								"0%": { backgroundPosition: "0% 50%" },
								"50%": { backgroundPosition: "100% 50%" },
								"100%": { backgroundPosition: "0% 50%" },
							},
						}}
					>
						TradingBot
					</Typography>
				</Box>

				{/* Actions */}
				<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
					{/* Backend Status */}
					<Tooltip
						title={
							backendStatusMessage
								? `Backend: ${backendStatusMessage}`
								: `Backend: ${backendStatus}`
						}
					>
						<Box
							sx={{ display: "flex", alignItems: "center", gap: 0.75, mr: 1 }}
						>
							<StatusDot
								status={
									backendStatus === "online"
										? "online"
										: backendStatus === "connecting"
											? "loading"
											: "offline"
								}
								size={7}
							/>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: { xs: "none", sm: "block" } }}
							>
								Backend
							</Typography>
						</Box>
					</Tooltip>

					{/* Agent Status */}
					<Tooltip title={`Agent: ${agentStatus}`}>
						<Box
							sx={{ display: "flex", alignItems: "center", gap: 0.75, mr: 1 }}
						>
							<StatusDot
								status={
									agentStatus === "connected" ||
									agentStatus === "analyzing" ||
									agentStatus === "initializing"
										? "online"
										: agentStatus === "error"
											? "busy"
											: "offline"
								}
								size={7}
							/>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: { xs: "none", sm: "block" } }}
							>
								Agent
							</Typography>
						</Box>
					</Tooltip>

					{/* Theme Selector */}
					<ThemeSelector />

					{/* Emergency Stop / Resume */}
					{user &&
						(emergencyActive ? (
							<Tooltip title="Resume — revive emergency-paused tasks & discovery">
								<IconButton
									aria-label="Resume all"
									color="success"
									onClick={() => setResumeAllOpen(true)}
									sx={{
										"&:hover": {
											bgcolor: "success.dark",
											color: "success.contrastText",
										},
									}}
								>
									<PlayCircleIcon />
								</IconButton>
							</Tooltip>
						) : (
							<Tooltip title="Emergency Stop — pause all tasks & discovery">
								<IconButton
									aria-label="Emergency stop"
									color="error"
									onClick={() => setEmergencyStopOpen(true)}
									sx={{
										"&:hover": {
											bgcolor: "error.dark",
											color: "error.contrastText",
										},
									}}
								>
									<StopCircleIcon />
								</IconButton>
							</Tooltip>
						))}

					<ConfirmDialog
						open={emergencyStopOpen}
						title="Emergency Stop"
						message="Stop all trading? This pauses all active tasks AND halts strategy discovery until you resume."
						confirmLabel="Stop All"
						destructive
						loading={emergencyStopMutation.isPending}
						onConfirm={() => emergencyStopMutation.mutate()}
						onCancel={() => setEmergencyStopOpen(false)}
					/>

					<ConfirmDialog
						open={resumeAllOpen}
						title="Resume"
						message="Resume all emergency-paused tasks and re-enable strategy discovery?"
						confirmLabel="Resume"
						loading={resumeAllMutation.isPending}
						onConfirm={() => resumeAllMutation.mutate()}
						onCancel={() => setResumeAllOpen(false)}
					/>

					{/* Notifications */}
					<Tooltip title="Notifications">
						<IconButton
							ref={notifButtonRef}
							aria-label="Notifications"
							color="inherit"
							onClick={openNotifPanel}
							sx={
								unreadCount > 0
									? {
											filter: (theme) =>
												`drop-shadow(0 0 6px rgba(${theme.trading.semanticRgb.error}, 0.5))`,
										}
									: undefined
							}
						>
							<Badge badgeContent={unreadCount} color="error">
								{unreadCount > 0 ? (
									<motion.div
										animate={{
											rotate: [0, 15, -15, 10, -10, 0],
										}}
										transition={{
											duration: 0.5,
											delay: 1,
											repeat: Infinity,
											repeatDelay: 4,
										}}
										style={{ display: "flex" }}
									>
										<NotificationsIcon />
									</motion.div>
								) : (
									<NotificationsIcon />
								)}
							</Badge>
						</IconButton>
					</Tooltip>

					<NotificationPanel
						anchorPosition={notifPosition}
						onClose={() => setNotifPosition(null)}
					/>

					{/* User Menu */}
					<Tooltip title="Account">
						<IconButton
							ref={accountButtonRef}
							onClick={toggleAccountMenu}
							color="inherit"
							sx={{ position: "relative" }}
						>
							<Avatar
								sx={{
									width: 32,
									height: 32,
									bgcolor: "primary.main",
									fontSize: "0.875rem",
								}}
							>
								{user?.email?.[0].toUpperCase() || "U"}
							</Avatar>
						</IconButton>
					</Tooltip>

					<Popover
						anchorReference="anchorPosition"
						anchorPosition={accountMenuPosition ?? undefined}
						open={isAccountMenuOpen}
						onClose={handleClose}
						transformOrigin={{
							vertical: "top",
							horizontal: "right",
						}}
						slotProps={{
							paper: {
								sx: { minWidth: 200, mt: 1 },
							},
						}}
					>
						<Box sx={{ px: 2, py: 1 }}>
							<Typography variant="subtitle2">{user?.email}</Typography>
							<Typography variant="caption" color="text.secondary">
								{user?.username || "Trader"}
							</Typography>
						</Box>
						<Divider />
						<MenuItem component={Link} to="/settings" onClick={handleClose}>
							<SettingsIcon sx={{ mr: 1.5, fontSize: 20 }} />
							Settings
						</MenuItem>
						<MenuItem onClick={handleLogout}>
							<LogoutIcon sx={{ mr: 1.5, fontSize: 20 }} />
							Logout
						</MenuItem>
					</Popover>
				</Box>
			</Toolbar>
		</AppBar>
	);
}

export default Header;
