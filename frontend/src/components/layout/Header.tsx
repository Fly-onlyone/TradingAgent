/**
 * Header Component
 */

import LogoutIcon from "@mui/icons-material/Logout";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SettingsIcon from "@mui/icons-material/Settings";
import {
	AppBar,
	Avatar,
	Badge,
	Box,
	Divider,
	IconButton,
	Menu,
	MenuItem,
	Toolbar,
	Tooltip,
	Typography,
} from "@mui/material";
import type { PopoverPosition } from "@mui/material/Popover";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { StatusDot } from "@/components/common/StatusDot";
import { ThemeSelector } from "@/components/common/ThemeSelector";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { useAuth } from "@/hooks/useAuth";
import { useAgentStore } from "@/store/agentStore";
import { useUIStore } from "@/store/uiStore";

export function Header() {
	const { user, logout } = useAuth();
	const { notifications } = useUIStore();
	const uiScale = useUIStore((s) => s.uiScale);
	const backendStatus = useUIStore((s) => s.backendStatus);
	const backendStatusMessage = useUIStore((s) => s.backendStatusMessage);
	const agentStatus = useAgentStore((s) => s.status);
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

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

	const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleLogout = () => {
		handleClose();
		logout();
	};

	const unreadCount = notifications.length;

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
									agentStatus === "connected" || agentStatus === "analyzing"
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
							onClick={handleMenu}
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

					<Menu
						anchorEl={anchorEl}
						open={Boolean(anchorEl)}
						onClose={handleClose}
						anchorOrigin={{
							vertical: "bottom",
							horizontal: "right",
						}}
						transformOrigin={{
							vertical: "top",
							horizontal: "right",
						}}
						PaperProps={{
							sx: { minWidth: 200, mt: 1 },
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
					</Menu>
				</Box>
			</Toolbar>
		</AppBar>
	);
}

export default Header;
