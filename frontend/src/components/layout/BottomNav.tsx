/**
 * Mobile Bottom Navigation — shown below md breakpoint
 */

import DashboardIcon from "@mui/icons-material/Dashboard";
import ListAltIcon from "@mui/icons-material/ListAlt";
import MonitorIcon from "@mui/icons-material/Monitor";
import SettingsIcon from "@mui/icons-material/Settings";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import {
	BottomNavigation,
	BottomNavigationAction,
	Paper,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { Link, useRouterState } from "@tanstack/react-router";

const navItems = [
	{ path: "/", label: "Dashboard", icon: <DashboardIcon /> },
	{ path: "/agent", label: "Agent", icon: <SmartToyIcon /> },
	{ path: "/trading", label: "Monitor", icon: <MonitorIcon /> },
	{ path: "/orders", label: "Orders", icon: <ListAltIcon /> },
	{ path: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

export function BottomNav() {
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down("md"));
	const currentPath = useRouterState({
		select: (state) => state.location.pathname,
	});

	if (!isMobile) return null;

	const currentValue = navItems.findIndex((item) =>
		item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path),
	);

	return (
		<Paper
			sx={{
				position: "fixed",
				bottom: 0,
				left: 0,
				right: 0,
				zIndex: theme.zIndex.appBar + 1,
				background: theme.trading.glass.header.background,
				backdropFilter: "blur(20px)",
				WebkitBackdropFilter: "blur(20px)",
				borderTop: `1px solid ${theme.trading.border.subtle}`,
			}}
			elevation={0}
		>
			<BottomNavigation
				value={currentValue === -1 ? false : currentValue}
				sx={{
					background: "transparent",
					height: 56,
					"& .MuiBottomNavigationAction-root": {
						color: "text.secondary",
						minWidth: 0,
						padding: "6px 0",
						"&.Mui-selected": {
							color: "primary.main",
						},
					},
					"& .MuiBottomNavigationAction-label": {
						fontSize: "0.625rem",
						"&.Mui-selected": {
							fontSize: "0.625rem",
						},
					},
				}}
			>
				{navItems.map((item) => (
					<BottomNavigationAction
						key={item.path}
						component={Link}
						to={item.path}
						label={item.label}
						icon={item.icon}
						showLabel
					/>
				))}
			</BottomNavigation>
		</Paper>
	);
}
