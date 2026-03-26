/**
 * Notification panel popover -- shows active + recent notifications.
 */

import {
	AlertCircle,
	BellOff,
	CheckCircle,
	Info,
	AlertTriangle,
	Trash,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUIStore } from "@/store/uiStore";
import type { NotificationConfig } from "@/store/uiStore";
import { useReducedMotion } from "@/utils/animations/hooks";
import { spring, staggerCascade } from "@/utils/animations/variants";
import { cn } from "@/lib/utils";

const typeIcon: Record<NotificationConfig["type"], React.ReactNode> = {
	success: <CheckCircle className="size-4 text-[var(--success)]" />,
	error: <AlertCircle className="size-4 text-[var(--error)]" />,
	warning: <AlertTriangle className="size-4 text-[var(--warning)]" />,
	info: <Info className="size-4 text-[var(--info)]" />,
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
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
}

export function NotificationPanel({
	open,
	onOpenChange,
	children,
}: NotificationPanelProps) {
	const reducedMotion = useReducedMotion();
	const notifications = useUIStore((s) => s.notifications);
	const history = useUIStore((s) => s.notificationHistory);
	const removeNotification = useUIStore((s) => s.removeNotification);
	const clearNotifications = useUIStore((s) => s.clearNotifications);
	const clearHistory = useUIStore((s) => s.clearNotificationHistory);

	const allItems = [...notifications, ...history];
	const hasItems = allItems.length > 0;

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger render={children as React.ReactElement} />
			<PopoverContent
				align="end"
				sideOffset={8}
				className={cn(
					"w-[340px] max-h-[420px] p-0 overflow-hidden",
					"bg-[rgba(var(--surface-glass),var(--glass-card-opacity))]",
					"backdrop-blur-[24px]",
					"border border-[var(--border-subtle)]",
					"rounded-[calc(var(--glass-radius)*1px+4px)]",
				)}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
					<span className="text-sm font-bold text-[var(--text-primary)]">
						Notifications
					</span>
					{hasItems && (
						<Button
							variant="ghost"
							size="icon-xs"
							className="text-[var(--text-secondary)]"
							onClick={() => {
								clearNotifications();
								clearHistory();
							}}
						>
							<Trash className="size-4" />
						</Button>
					)}
				</div>

				{/* Content */}
				<div className="overflow-y-auto max-h-[360px]">
					{!hasItems ? (
						<div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
							<BellOff className="size-10 mb-2 opacity-40" />
							<p className="text-sm text-[var(--text-secondary)]">
								No notifications
							</p>
						</div>
					) : (
						<motion.div
							variants={
								reducedMotion ? undefined : staggerCascade.container
							}
							initial="hidden"
							animate="visible"
						>
							<AnimatePresence>
								{allItems.map((item) => {
									const isActive = notifications.some(
										(n) => n.id === item.id,
									);
									return (
										<motion.div
											key={item.id}
											variants={
												reducedMotion
													? undefined
													: staggerCascade.item
											}
											exit={{ opacity: 0, x: 40 }}
											transition={spring.snappy}
											layout
										>
											<div
												className={cn(
													"flex items-start gap-3 px-4 py-2.5",
													"border-b border-[var(--border-subtle)] last:border-b-0",
													"hover:bg-[rgba(var(--primary-rgb),0.04)]",
													!isActive && "opacity-60",
												)}
											>
												<div className="pt-0.5">
													{typeIcon[item.type]}
												</div>
												<div className="flex-1 min-w-0">
													<p className="text-sm font-semibold text-[var(--text-primary)] truncate">
														{item.title}
													</p>
													{item.message && (
														<p
															className="text-xs text-[var(--text-secondary)] line-clamp-2"
														>
															{item.message}
														</p>
													)}
													<p className="text-[0.65rem] text-[var(--text-disabled)]">
														{timeAgo(item.createdAt)}
													</p>
												</div>
												{isActive && (
													<Button
														variant="ghost"
														size="icon-xs"
														className="text-[var(--text-secondary)] p-0.5"
														onClick={() =>
															removeNotification(
																item.id,
															)
														}
													>
														<X className="size-4" />
													</Button>
												)}
											</div>
										</motion.div>
									);
								})}
							</AnimatePresence>
						</motion.div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
