/**
 * Sidebar Component
 */

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import ArticleIcon from "@mui/icons-material/Article";
import BackupIcon from "@mui/icons-material/Backup";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import ListAltIcon from "@mui/icons-material/ListAlt";
import MonitorIcon from "@mui/icons-material/Monitor";
import NewspaperIcon from "@mui/icons-material/Newspaper";
import PsychologyIcon from "@mui/icons-material/Psychology";
import PushPinIcon from "@mui/icons-material/PushPin";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SettingsIcon from "@mui/icons-material/Settings";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import StorageIcon from "@mui/icons-material/Storage";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
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
	Tooltip,
	Typography,
	useTheme,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { spring } from "@/utils/animations/variants";
import { markNavStart } from "@/utils/performance/navigationMetrics";
import { preloadNavigationTarget } from "./navigationPreload";

const DRAWER_WIDTH = 220;
const COLLAPSED_WIDTH = 56;

interface NavGroup {
	label: string;
	items: { path: string; label: string; icon: typeof DashboardIcon }[];
}

const navGroups: NavGroup[] = [
	{
		label: "Core",
		items: [
			{ path: "/", label: "Dashboard", icon: DashboardIcon },
			{ path: "/agent", label: "Agent", icon: SmartToyIcon },
		],
	},
	{
		label: "Monitor",
		items: [
			{ path: "/trading", label: "Market Monitor", icon: MonitorIcon },
			{ path: "/orders", label: "Orders", icon: ListAltIcon },
			{ path: "/trades", label: "Trades", icon: ReceiptLongIcon },
		],
	},
	{
		label: "Intelligence",
		items: [
			{
				path: "/strategies",
				label: "Strategies",
				icon: AccountBalanceIcon,
			},
			{
				path: "/knowledge",
				label: "Knowledge",
				icon: LibraryBooksIcon,
			},
			{ path: "/memory", label: "Memory", icon: PsychologyIcon },
			{ path: "/news", label: "News", icon: NewspaperIcon },
		],
	},
	{
		label: "System",
		items: [{ path: "/tasks", label: "Tasks", icon: ScheduleIcon }],
	},
];

const adminGroup: NavGroup = {
	label: "Admin",
	items: [
		{ path: "/admin/database", label: "Database", icon: StorageIcon },
		{
			path: "/admin/data-management",
			label: "Data Management",
			icon: DeleteSweepIcon,
		},
		{ path: "/admin/backup", label: "Backup", icon: BackupIcon },
		{ path: "/admin/logs", label: "Logs", icon: ArticleIcon },
		{
			path: "/admin/strategy-discovery",
			label: "Strategy Discovery",
			icon: TravelExploreIcon,
		},
	],
};

const bottomMenuItems = [
	{ path: "/settings", label: "Settings", icon: SettingsIcon },
];

function MenuSection({
	items,
	isExpanded,
	currentPath,
	onNavigate,
}: {
	items: NavGroup["items"];
	isExpanded: boolean;
	currentPath: string;
	onNavigate: (path: string) => void;
}) {
	const theme = useTheme();
	const primaryRgb = theme.trading.primaryRgb;

	return (
		<>
			{items.map((item) => {
				const isActive =
					item.path === "/"
						? currentPath === "/"
						: currentPath.startsWith(item.path);
				const Icon = item.icon;

				const button = (
					<ListItemButton
						component={Link}
						to={item.path}
						preload={false}
						onClick={() => onNavigate(item.path)}
						sx={{
							position: "relative",
							minHeight: 44,
							justifyContent: isExpanded ? "initial" : "center",
							px: isExpanded ? 2 : 1.5,
							bgcolor: isActive ? `rgba(${primaryRgb}, 0.1)` : "transparent",
							transition: "transform 0.2s ease-out, background-color 0.2s ease",
							"&::before": isActive
								? {
										content: '""',
										position: "absolute",
										left: 0,
										top: "50%",
										transform: "translateY(-50%)",
										width: 3,
										height: 24,
										borderRadius: "0 4px 4px 0",
										background: `radial-gradient(ellipse at left, rgba(${primaryRgb},0.6) 0%, transparent 70%), ${theme.palette.primary.main}`,
										boxShadow: `0 0 16px rgba(${primaryRgb},0.7), 0 0 6px rgba(${primaryRgb},0.5), 0 0 30px rgba(${primaryRgb},0.2)`,
									}
								: undefined,
							"&:hover": {
								bgcolor: isActive
									? `rgba(${primaryRgb}, 0.15)`
									: `rgba(${primaryRgb}, 0.08)`,
								transform: "translateX(4px)",
								"& .nav-icon": {
									color: "primary.main",
									transform: "scale(1.15)",
								},
							},
						}}
					>
						<ListItemIcon
							className="nav-icon"
							sx={{
								minWidth: 0,
								mr: isExpanded ? 2 : "auto",
								justifyContent: "center",
								color: isActive ? "primary.main" : "text.secondary",
								transition: "color 0.2s ease, transform 0.2s ease",
							}}
						>
							<Icon fontSize="small" />
						</ListItemIcon>
						{isExpanded && (
							<ListItemText
								primary={item.label}
								slotProps={{
									primary: {
										fontSize: "0.875rem",
										fontWeight: isActive ? 600 : 400,
										color: isActive ? "primary.main" : "text.primary",
									},
								}}
							/>
						)}
					</ListItemButton>
				);

				return (
					<ListItem
						key={item.path}
						disablePadding
						sx={{ display: "block", position: "relative" }}
					>
						<Tooltip
							title={isExpanded ? "" : item.label}
							placement="right"
							arrow
							disableHoverListener={isExpanded}
						>
							{button}
						</Tooltip>
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
	const [isHovered, setIsHovered] = useState(false);
	const isHidden = sidebarState === "hidden";
	const isSuperuser = user?.isSuperuser ?? false;
	const theme = useTheme();

	const isPinned = sidebarState === "expanded";
	const isExpanded = isPinned || isHovered;
	const drawerWidth = isExpanded ? DRAWER_WIDTH : COLLAPSED_WIDTH;

	const primaryRgb = theme.trading.primaryRgb;

	const handleNavigate = useCallback(
		(to: string) => {
			if (location.pathname !== to) {
				markNavStart(to);
				void preloadNavigationTarget(to, router, queryClient);
			}
		},
		[location.pathname, router, queryClient],
	);

	if (isHidden) return null;

	return (
		<Drawer
			variant="permanent"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			sx={{
				width: drawerWidth,
				flexShrink: 0,
				"& .MuiDrawer-paper": {
					width: drawerWidth,
					boxSizing: "border-box",
					transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
					overflowX: "hidden",
				},
			}}
		>
			{/* Logo / Brand */}
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: isExpanded ? "flex-start" : "center",
					px: isExpanded ? 2 : 1,
					py: 1.25,
					minHeight: 48,
					overflow: "hidden",
				}}
			>
				<SmartToyIcon
					sx={{
						color: "primary.main",
						fontSize: 22,
						flexShrink: 0,
						filter: `drop-shadow(0 0 6px rgba(${primaryRgb},0.4))`,
					}}
				/>
				{isExpanded && (
					<>
						<Typography
							variant="subtitle1"
							fontWeight={700}
							noWrap
							sx={{
								ml: 1.5,
								background: (t) =>
									`linear-gradient(135deg, ${t.palette.primary.main} 0%, ${t.palette.primary.light} 100%)`,
								backgroundSize: "200% 100%",
								backgroundClip: "text",
								WebkitBackgroundClip: "text",
								WebkitTextFillColor: "transparent",
								animation: "brandShine 3.5s linear infinite",
								"@keyframes brandShine": {
									"0%": {
										backgroundPosition: "0% 50%",
									},
									"50%": {
										backgroundPosition: "100% 50%",
									},
									"100%": {
										backgroundPosition: "0% 50%",
									},
								},
							}}
						>
							TradingBot
						</Typography>
						<IconButton
							size="small"
							onClick={toggleSidebar}
							sx={{
								ml: "auto",
								color: isPinned ? "primary.main" : "text.secondary",
								"&:hover": { color: "primary.main" },
							}}
						>
							<motion.div
								animate={{ rotate: isPinned ? 0 : 45 }}
								transition={spring.snappy}
								style={{ display: "flex" }}
							>
								<PushPinIcon sx={{ fontSize: 16 }} />
							</motion.div>
						</IconButton>
					</>
				)}
			</Box>

			<Divider />

			{/* Main Menu */}
			<List sx={{ py: 0.5, flex: 1 }}>
				{navGroups.map((group, groupIndex) => (
					<Box key={group.label}>
						{groupIndex > 0 && !isExpanded && <Divider sx={{ my: 0.5 }} />}
						{isExpanded && (
							<Typography
								variant="overline"
								sx={{
									px: 2,
									pt: groupIndex === 0 ? 0.5 : 1.5,
									pb: 0.5,
									display: "block",
									color: "text.disabled",
									fontSize: "0.65rem",
								}}
							>
								{group.label}
							</Typography>
						)}
						<MenuSection
							items={group.items}
							isExpanded={isExpanded}
							currentPath={location.pathname}
							onNavigate={handleNavigate}
						/>
					</Box>
				))}
			</List>

			{/* Admin Section (superusers only) */}
			{(isSuperuser || import.meta.env.DEV) && (
				<>
					<Divider />
					<List sx={{ py: 0.5 }}>
						{isExpanded && (
							<Typography
								variant="overline"
								sx={{
									px: 2,
									pt: 0.5,
									pb: 0.5,
									display: "block",
									color: "text.disabled",
									fontSize: "0.65rem",
								}}
							>
								{adminGroup.label}
							</Typography>
						)}
						<MenuSection
							items={adminGroup.items}
							isExpanded={isExpanded}
							currentPath={location.pathname}
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
					onNavigate={handleNavigate}
				/>
			</List>
		</Drawer>
	);
}

export default Sidebar;
