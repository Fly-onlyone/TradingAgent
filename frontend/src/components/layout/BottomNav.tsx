/**
 * Mobile Bottom Navigation -- shown below md breakpoint
 */

import { Bot, LayoutDashboard, List, Monitor, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

const navItems: { path: string; label: string; icon: LucideIcon }[] = [
	{ path: "/", label: "Dashboard", icon: LayoutDashboard },
	{ path: "/agent", label: "Agent", icon: Bot },
	{ path: "/trading", label: "Monitor", icon: Monitor },
	{ path: "/orders", label: "Orders", icon: List },
	{ path: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
	const isMobile = useMediaQuery("(max-width: 767px)");
	const currentPath = useRouterState({
		select: (state) => state.location.pathname,
	});

	if (!isMobile) return null;

	return (
		<nav
			className={cn(
				"fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center h-14",
				"glass-card border-t border-[var(--border-subtle)] border-x-0 border-b-0 rounded-none",
			)}
		>
			{navItems.map((item) => {
				const isActive =
					item.path === "/"
						? currentPath === "/"
						: currentPath.startsWith(item.path);
				const Icon = item.icon;

				return (
					<Link
						key={item.path}
						to={item.path}
						className={cn(
							"flex flex-col items-center gap-1 p-2 min-w-0 no-underline transition-colors duration-200",
							isActive
								? "text-[var(--primary)]"
								: "text-[var(--text-secondary)]",
						)}
					>
						<Icon className="size-5" />
						<span className="text-[0.625rem] leading-none">
							{item.label}
						</span>
					</Link>
				);
			})}
		</nav>
	);
}
