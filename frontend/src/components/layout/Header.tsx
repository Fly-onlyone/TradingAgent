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
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { ThemeSelector } from "@/components/common/ThemeSelector";
import { useAuth } from "@/hooks/useAuth";
import { useUIStore } from "@/store/uiStore";

export function Header() {
	const { user, logout } = useAuth();
	const { notifications } = useUIStore();
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

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
				background: (theme) =>
					theme.trading.glass.header.background.replace(
						/[\d.]+\)$/,
						"0.85)",
					),
				backdropFilter: "blur(20px)",
				borderBottom: "none",
				"&::after": {
					content: '""',
					position: "absolute",
					bottom: 0,
					left: 0,
					right: 0,
					height: "1px",
					background: (theme) =>
						`linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.light}, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
					backgroundSize: "200% 100%",
					animation: "gradientSlide 4s linear infinite",
				},
				"@keyframes gradientSlide": {
					"0%": { backgroundPosition: "0% 0" },
					"100%": { backgroundPosition: "200% 0" },
				},
			}}
		>
			<Toolbar sx={{ minHeight: "48px !important", px: 2 }}>
				<Box sx={{ flexGrow: 1 }} />

				{/* Actions */}
				<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
					{/* Theme Selector */}
					<ThemeSelector />

					{/* Notifications */}
					<Tooltip title="Notifications">
						<IconButton
							color="inherit"
							sx={
								unreadCount > 0
									? {
											filter: "drop-shadow(0 0 6px rgba(239, 68, 68, 0.5))",
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

					{/* User Menu */}
					<Tooltip title="Account">
						<IconButton onClick={handleMenu} color="inherit">
							<Avatar
								sx={{
									width: 32,
									height: 32,
									bgcolor: "primary.main",
									fontSize: "0.875rem",
									border: "2px solid transparent",
									backgroundClip: "padding-box",
									"&::before": {
										content: '""',
										position: "absolute",
										inset: -2,
										borderRadius: "50%",
										background: (theme) =>
											`linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`,
										opacity: 0,
										transition: "opacity 0.3s ease",
										zIndex: -1,
									},
									"&:hover::before": {
										opacity: 1,
									},
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
							<Typography variant="subtitle2">
								{user?.email}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								{user?.username || "Trader"}
							</Typography>
						</Box>
						<Divider />
						<MenuItem
							component={Link}
							to="/settings"
							onClick={handleClose}
						>
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
