/**
 * Sidebar Component
 */

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import ArticleIcon from "@mui/icons-material/Article";
import BugReportIcon from "@mui/icons-material/BugReport";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DashboardIcon from "@mui/icons-material/Dashboard";
import NewspaperIcon from "@mui/icons-material/Newspaper";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SchoolIcon from "@mui/icons-material/School";
import SettingsIcon from "@mui/icons-material/Settings";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import StorageIcon from "@mui/icons-material/Storage";
import TimelineIcon from "@mui/icons-material/Timeline";
import {
	Box,
	Divider,
	Drawer,
	IconButton,
	List,
	ListItem,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { preloadNavigationTarget } from "@/components/layout/navigationPreload";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { markNavStart } from "@/utils/performance/navigationMetrics";

const DRAWER_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

// Main navigation items
const menuItems = [
	{ path: "/", label: "Dashboard", icon: DashboardIcon },
	{ path: "/trading", label: "Trading", icon: ShowChartIcon },
	{ path: "/orders", label: "Orders", icon: ReceiptLongIcon },
	{ path: "/trades", label: "Trade History", icon: TimelineIcon },
];

// Agent section items
const agentMenuItems = [
	{ path: "/agent", label: "Agent Chat", icon: SmartToyIcon },
	{ path: "/tasks", label: "Tasks", icon: ScheduleIcon },
];

// Strategy & Learning section
const strategyMenuItems = [
	{ path: "/strategies", label: "Strategies", icon: AccountBalanceIcon },
	{ path: "/knowledge", label: "Knowledge", icon: SchoolIcon },
	{ path: "/news", label: "News", icon: NewspaperIcon },
];

// Admin section (only for superusers)
const adminMenuItems = [
	{ path: "/admin/database", label: "Database", icon: StorageIcon },
	{ path: "/admin/logs", label: "Logs", icon: ArticleIcon },
	{ path: "/admin/bugs", label: "Bug Tracker", icon: BugReportIcon },
];

const bottomMenuItems = [
	{ path: "/settings", label: "Settings", icon: SettingsIcon },
];

// Reusable menu section renderer
function MenuSection({
	items,
	isExpanded,
	currentPath,
	onPreload,
	onNavigate,
}: {
	items: typeof menuItems;
	isExpanded: boolean;
	currentPath: string;
	onPreload: (path: string) => void;
	onNavigate: (path: string) => void;
}) {
	return (
		<>
			{items.map((item) => {
				const isActive = currentPath === item.path;
				const Icon = item.icon;

				return (
					<ListItem key={item.path} disablePadding sx={{ display: "block" }}>
						<ListItemButton
							component={Link}
							to={item.path}
							onMouseEnter={() => onPreload(item.path)}
							onFocus={() => onPreload(item.path)}
							onTouchStart={() => onPreload(item.path)}
							onClick={() => onNavigate(item.path)}
							sx={{
								minHeight: 48,
								justifyContent: isExpanded ? "initial" : "center",
								px: 2.5,
								bgcolor: isActive ? "rgba(249, 115, 22, 0.1)" : "transparent",
								borderRight: isActive ? "3px solid" : "none",
								borderColor: "primary.main",
								"&:hover": {
									bgcolor: isActive
										? "rgba(249, 115, 22, 0.15)"
										: "rgba(255, 255, 255, 0.05)",
								},
							}}
						>
							<ListItemIcon
								sx={{
									minWidth: 0,
									mr: isExpanded ? 2 : "auto",
									justifyContent: "center",
									color: isActive ? "primary.main" : "text.secondary",
								}}
							>
								<Icon />
							</ListItemIcon>
							{isExpanded && (
								<ListItemText
									primary={item.label}
									slotProps={{
										primary: {
											fontWeight: isActive ? 600 : 400,
											color: isActive ? "primary.main" : "text.primary",
										},
									}}
								/>
							)}
						</ListItemButton>
					</ListItem>
				);
			})}
		</>
	);
}

export function Sidebar() {
	const location = useLocation();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { sidebarState, toggleSidebar } = useUIStore();
	const { user } = useAuthStore();
	const isExpanded = sidebarState === "expanded";
	const isHidden = sidebarState === "hidden";
	const isSuperuser = user?.isSuperuser ?? false;

	const handlePreload = useCallback(
		(to: string) => {
			void preloadNavigationTarget(to, router, queryClient);
		},
		[router, queryClient],
	);

	const handleNavigate = useCallback(
		(to: string) => {
			if (location.pathname !== to) {
				markNavStart(to);
			}
		},
		[location.pathname],
	);

	if (isHidden) return null;

	const drawerWidth = isExpanded ? DRAWER_WIDTH : COLLAPSED_WIDTH;

	return (
		<Drawer
			variant="permanent"
			sx={{
				width: drawerWidth,
				flexShrink: 0,
				"& .MuiDrawer-paper": {
					width: drawerWidth,
					boxSizing: "border-box",
					transition: (theme) =>
						theme.transitions.create("width", {
							easing: theme.transitions.easing.sharp,
							duration: theme.transitions.duration.enteringScreen,
						}),
					overflowX: "hidden",
				},
			}}
		>
			{/* Logo / Brand */}
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: isExpanded ? "space-between" : "center",
					px: isExpanded ? 2 : 1,
					py: 2,
					minHeight: 64,
				}}
			>
				{isExpanded && (
					<Typography variant="h6" fontWeight={700} color="primary">
						TradingBot
					</Typography>
				)}
				<IconButton onClick={toggleSidebar} size="small">
					{isExpanded ? <ChevronLeftIcon /> : <ChevronRightIcon />}
				</IconButton>
			</Box>

			<Divider />

			{/* Main Menu */}
			<List sx={{ py: 1 }}>
				<MenuSection
					items={menuItems}
					isExpanded={isExpanded}
					currentPath={location.pathname}
					onPreload={handlePreload}
					onNavigate={handleNavigate}
				/>
			</List>

			<Divider />

			{/* Agent Section */}
			<List sx={{ py: 1 }}>
				{isExpanded && (
					<ListItem sx={{ py: 0.5 }}>
						<Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
							AGENT
						</Typography>
					</ListItem>
				)}
				<MenuSection
					items={agentMenuItems}
					isExpanded={isExpanded}
					currentPath={location.pathname}
					onPreload={handlePreload}
					onNavigate={handleNavigate}
				/>
			</List>

			<Divider />

			{/* Strategy & Learning Section */}
			<List sx={{ flex: 1, py: 1 }}>
				{isExpanded && (
					<ListItem sx={{ py: 0.5 }}>
						<Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
							STRATEGY
						</Typography>
					</ListItem>
				)}
				<MenuSection
					items={strategyMenuItems}
					isExpanded={isExpanded}
					currentPath={location.pathname}
					onPreload={handlePreload}
					onNavigate={handleNavigate}
				/>
			</List>

			{/* Admin Section (superusers only) */}
			{(isSuperuser || import.meta.env.DEV) && (
				<>
					<Divider />
					<List sx={{ py: 1 }}>
						{isExpanded && (
							<ListItem sx={{ py: 0.5 }}>
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{ px: 1 }}
								>
									ADMIN
								</Typography>
							</ListItem>
						)}
						<MenuSection
							items={adminMenuItems}
							isExpanded={isExpanded}
							currentPath={location.pathname}
							onPreload={handlePreload}
							onNavigate={handleNavigate}
						/>
					</List>
				</>
			)}

			<Divider />

			{/* Bottom Menu */}
			<List sx={{ py: 1 }}>
				<MenuSection
					items={bottomMenuItems}
					isExpanded={isExpanded}
					currentPath={location.pathname}
					onPreload={handlePreload}
					onNavigate={handleNavigate}
				/>
			</List>
		</Drawer>
	);
}

export default Sidebar;
