/**
 * Sidebar Component
 */

import {
	BookOpen,
	Bot,
	Clock,
	Database,
	FileText,
	Landmark,
	LayoutDashboard,
	List,
	Monitor,
	Newspaper,
	Pin,
	Receipt,
	Settings,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useThemePreset } from "@/lib/theme";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { spring } from "@/utils/animations/variants";
import { markNavStart } from "@/utils/performance/navigationMetrics";
import { preloadNavigationTarget } from "./navigationPreload";

const DRAWER_WIDTH = 220;
const COLLAPSED_WIDTH = 56;

interface NavGroup {
	label: string;
	items: { path: string; label: string; icon: LucideIcon }[];
}

const navGroups: NavGroup[] = [
	{
		label: "Core",
		items: [
			{ path: "/", label: "Dashboard", icon: LayoutDashboard },
			{ path: "/agent", label: "Agent", icon: Bot },
		],
	},
	{
		label: "Monitor",
		items: [
			{ path: "/trading", label: "Market Monitor", icon: Monitor },
			{ path: "/orders", label: "Orders", icon: List },
			{ path: "/trades", label: "Trades", icon: Receipt },
		],
	},
	{
		label: "Intelligence",
		items: [
			{ path: "/strategies", label: "Strategies", icon: Landmark },
			{ path: "/knowledge", label: "Knowledge", icon: BookOpen },
			{ path: "/news", label: "News", icon: Newspaper },
		],
	},
	{
		label: "System",
		items: [{ path: "/tasks", label: "Tasks", icon: Clock }],
	},
];

const adminGroup: NavGroup = {
	label: "Admin",
	items: [
		{ path: "/admin/database", label: "Database", icon: Database },
		{ path: "/admin/logs", label: "Logs", icon: FileText },
	],
};

const bottomMenuItems = [
	{ path: "/settings", label: "Settings", icon: Settings },
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
	const theme = useThemePreset();
	const primaryRgb = theme.primaryRgb;

	return (
		<>
			{items.map((item) => {
				const isActive =
					item.path === "/"
						? currentPath === "/"
						: currentPath.startsWith(item.path);
				const Icon = item.icon;

				const link = (
					<Link
						to={item.path}
						preload={false}
						onClick={() => onNavigate(item.path)}
						className={cn(
							"relative flex items-center min-h-[44px] transition-[transform,background-color] duration-200 ease-out",
							isExpanded ? "px-4 justify-start" : "px-3 justify-center",
							isActive
								? `bg-[rgba(${primaryRgb},0.1)]`
								: "bg-transparent",
							"hover:translate-x-1",
							isActive
								? `hover:bg-[rgba(${primaryRgb},0.15)]`
								: `hover:bg-[rgba(${primaryRgb},0.08)]`,
							"group/nav-item no-underline",
						)}
						style={
							isActive
								? {
										// Active indicator bar
									}
								: undefined
						}
					>
						{/* Active indicator */}
						{isActive && (
							<span
								className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-[4px]"
								style={{
									background: `radial-gradient(ellipse at left, rgba(${primaryRgb},0.6) 0%, transparent 70%), var(--primary)`,
									boxShadow: `0 0 16px rgba(${primaryRgb},0.7), 0 0 6px rgba(${primaryRgb},0.5), 0 0 30px rgba(${primaryRgb},0.2)`,
								}}
							/>
						)}

						<span
							className={cn(
								"flex items-center justify-center shrink-0 transition-[color,transform] duration-200 ease-out",
								isExpanded ? "mr-4" : "mr-0",
								isActive
									? "text-[var(--primary)]"
									: "text-[var(--text-secondary)]",
								"group-hover/nav-item:text-[var(--primary)] group-hover/nav-item:scale-115",
							)}
						>
							<Icon className="size-[18px]" />
						</span>
						{isExpanded && (
							<span
								className={cn(
									"text-sm",
									isActive
										? "font-semibold text-[var(--primary)]"
										: "font-normal text-[var(--text-primary)]",
								)}
							>
								{item.label}
							</span>
						)}
					</Link>
				);

				if (!isExpanded) {
					return (
						<div key={item.path} className="block relative">
							<Tooltip>
								<TooltipTrigger render={link} />
								<TooltipContent side="right">
									{item.label}
								</TooltipContent>
							</Tooltip>
						</div>
					);
				}

				return (
					<div key={item.path} className="block relative">
						{link}
					</div>
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
	const theme = useThemePreset();

	const isPinned = sidebarState === "expanded";
	const isExpanded = isPinned || isHovered;
	const drawerWidth = isExpanded ? DRAWER_WIDTH : COLLAPSED_WIDTH;

	const primaryRgb = theme.primaryRgb;

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
		<aside
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			className="glass-sidebar fixed left-0 top-[52px] bottom-0 flex flex-col overflow-x-hidden overflow-y-auto z-40 transition-[width] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
			style={{ width: drawerWidth }}
		>
			{/* Logo / Brand */}
			<div
				className={cn(
					"flex items-center overflow-hidden py-2.5 min-h-[48px]",
					isExpanded ? "justify-start px-4" : "justify-center px-2",
				)}
			>
				<Bot
					className="size-[22px] shrink-0 text-[var(--primary)]"
					style={{
						filter: `drop-shadow(0 0 6px rgba(${primaryRgb},0.4))`,
					}}
				/>
				{isExpanded && (
					<>
						<span
							className={cn(
								"ml-3 text-base font-bold whitespace-nowrap",
								"bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-light)_100%)]",
								"bg-[length:200%_100%] bg-clip-text [-webkit-background-clip:text] [-webkit-text-fill-color:transparent]",
								"animate-[brandShine_3.5s_linear_infinite]",
							)}
						>
							TradingBot
						</span>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={toggleSidebar}
							className={cn(
								"ml-auto",
								isPinned
									? "text-[var(--primary)]"
									: "text-[var(--text-secondary)] hover:text-[var(--primary)]",
							)}
						>
							<motion.div
								animate={{ rotate: isPinned ? 0 : 45 }}
								transition={spring.snappy}
								style={{ display: "flex" }}
							>
								<Pin className="size-4" />
							</motion.div>
						</Button>
					</>
				)}
			</div>

			<Separator className="bg-[var(--border-subtle)]" />

			{/* Main Menu */}
			<nav className="py-1 flex-1">
				{navGroups.map((group, groupIndex) => (
					<div key={group.label}>
						{groupIndex > 0 && !isExpanded && (
							<Separator className="my-1 bg-[var(--border-subtle)]" />
						)}
						{isExpanded && (
							<span
								className={cn(
									"block px-4 pb-1 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-disabled)]",
									groupIndex === 0 ? "pt-1" : "pt-3",
								)}
							>
								{group.label}
							</span>
						)}
						<MenuSection
							items={group.items}
							isExpanded={isExpanded}
							currentPath={location.pathname}
							onNavigate={handleNavigate}
						/>
					</div>
				))}
			</nav>

			{/* Admin Section (superusers only) */}
			{(isSuperuser || import.meta.env.DEV) && (
				<>
					<Separator className="bg-[var(--border-subtle)]" />
					<nav className="py-1">
						{isExpanded && (
							<span className="block px-4 pt-1 pb-1 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-disabled)]">
								{adminGroup.label}
							</span>
						)}
						<MenuSection
							items={adminGroup.items}
							isExpanded={isExpanded}
							currentPath={location.pathname}
							onNavigate={handleNavigate}
						/>
					</nav>
				</>
			)}

			<Separator className="bg-[var(--border-subtle)]" />

			{/* Bottom Menu */}
			<nav className="py-2">
				<MenuSection
					items={bottomMenuItems}
					isExpanded={isExpanded}
					currentPath={location.pathname}
					onNavigate={handleNavigate}
				/>
			</nav>
		</aside>
	);
}

export default Sidebar;
