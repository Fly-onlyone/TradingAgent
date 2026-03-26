/**
 * Header Component
 */

import { Bell, LogOut, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusDot } from "@/components/common/StatusDot";
import { ThemeSelector } from "@/components/common/ThemeSelector";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { useAuth } from "@/hooks/useAuth";
import { useAgentStore } from "@/store/agentStore";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export function Header() {
	const { user, logout } = useAuth();
	const { notifications } = useUIStore();
	const backendStatus = useUIStore((s) => s.backendStatus);
	const backendStatusMessage = useUIStore((s) => s.backendStatusMessage);
	const agentStatus = useAgentStore((s) => s.status);

	// Notification panel
	const [notifOpen, setNotifOpen] = useState(false);

	const unreadCount = notifications.length;

	const handleLogout = () => {
		logout();
	};

	return (
		<header
			className={cn(
				"glass-header fixed top-0 left-0 right-0 z-50 h-[52px] flex items-center border-b-0",
				"after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px]",
				"after:bg-[var(--gradient-accent)] after:bg-[length:200%_100%] after:animate-[gradientSlide_4s_linear_infinite]",
			)}
		>
			<div className="flex items-center w-full h-[52px] px-4 sm:px-6">
				{/* Brand */}
				<Link
					to="/"
					className="flex items-center gap-2 no-underline flex-1"
				>
					<img
						src="/coin.png"
						alt="TradingBot"
						width={24}
						height={24}
						className="block"
					/>
					<span
						className={cn(
							"text-sm font-bold whitespace-nowrap",
							"bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-light)_100%)]",
							"bg-[length:200%_100%] bg-clip-text [-webkit-background-clip:text] [-webkit-text-fill-color:transparent]",
							"animate-[brandShine_3.5s_linear_infinite]",
						)}
					>
						TradingBot
					</span>
				</Link>

				{/* Actions */}
				<div className="flex items-center gap-2">
					{/* Backend Status */}
					<Tooltip>
						<TooltipTrigger
							className="flex items-center gap-1.5 mr-2 cursor-default"
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
							<span className="hidden sm:block text-xs text-[var(--text-secondary)]">
								Backend
							</span>
						</TooltipTrigger>
						<TooltipContent>
							{backendStatusMessage
								? `Backend: ${backendStatusMessage}`
								: `Backend: ${backendStatus}`}
						</TooltipContent>
					</Tooltip>

					{/* Agent Status */}
					<Tooltip>
						<TooltipTrigger
							className="flex items-center gap-1.5 mr-2 cursor-default"
						>
							<StatusDot
								status={
									agentStatus === "connected" ||
									agentStatus === "analyzing"
										? "online"
										: agentStatus === "error"
											? "busy"
											: "offline"
								}
								size={7}
							/>
							<span className="hidden sm:block text-xs text-[var(--text-secondary)]">
								Agent
							</span>
						</TooltipTrigger>
						<TooltipContent>{`Agent: ${agentStatus}`}</TooltipContent>
					</Tooltip>

					{/* Theme Selector */}
					<ThemeSelector />

					{/* Notifications */}
					<NotificationPanel
						open={notifOpen}
						onOpenChange={setNotifOpen}
					>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										variant="ghost"
										size="icon"
										aria-label="Notifications"
										className={cn(
											"text-[var(--text-primary)]",
											unreadCount > 0 &&
												"drop-shadow-[0_0_6px_rgba(var(--error-rgb),0.5)]",
										)}
										onClick={() => setNotifOpen((o) => !o)}
									/>
								}
							>
								<div className="relative">
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
											<Bell className="size-5" />
										</motion.div>
									) : (
										<Bell className="size-5" />
									)}
									{unreadCount > 0 && (
										<span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-[var(--error)] rounded-full">
											{unreadCount}
										</span>
									)}
								</div>
							</TooltipTrigger>
							<TooltipContent>Notifications</TooltipContent>
						</Tooltip>
					</NotificationPanel>

					{/* User Menu */}
					<DropdownMenu>
						<Tooltip>
							<TooltipTrigger
								render={
									<DropdownMenuTrigger
										className="relative cursor-pointer outline-none"
									/>
								}
							>
								<Avatar className="bg-[var(--primary)] text-[var(--primary-contrast)]">
									<AvatarFallback className="bg-[var(--primary)] text-[var(--primary-contrast)] text-sm">
										{user?.email?.[0].toUpperCase() || "U"}
									</AvatarFallback>
								</Avatar>
							</TooltipTrigger>
							<TooltipContent>Account</TooltipContent>
						</Tooltip>

						<DropdownMenuContent
							align="end"
							sideOffset={8}
							className="min-w-[200px]"
						>
							<div className="px-3 py-2">
								<p className="text-sm font-semibold text-[var(--text-primary)]">
									{user?.email}
								</p>
								<p className="text-xs text-[var(--text-secondary)]">
									{user?.username || "Trader"}
								</p>
							</div>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								render={<Link to="/settings" />}
							>
								<Settings className="size-5 mr-1.5" />
								Settings
							</DropdownMenuItem>
							<DropdownMenuItem onClick={handleLogout}>
								<LogOut className="size-5 mr-1.5" />
								Logout
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</header>
	);
}

export default Header;
