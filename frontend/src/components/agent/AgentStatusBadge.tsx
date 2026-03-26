/**
 * Agent Status Badge Component
 */

import {
	AlertCircle,
	CheckCircle,
	RefreshCw,
	WifiOff,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { AgentStatus } from "@/types/session";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AgentStatusBadgeProps {
	status: AgentStatus;
	showLabel?: boolean;
}

const statusConfig: Record<
	AgentStatus,
	{
		label: string;
		colorClass: string;
		icon: typeof CheckCircle;
		animate?: boolean;
	}
> = {
	disconnected: {
		label: "Disconnected",
		colorClass: "border-muted-foreground/40 text-muted-foreground",
		icon: WifiOff,
	},
	connected: {
		label: "Online",
		colorClass: "border-emerald-500/50 text-emerald-500",
		icon: CheckCircle,
	},
	thinking: {
		label: "Thinking...",
		colorClass: "border-sky-500/50 text-sky-500",
		icon: RefreshCw,
		animate: true,
	},
	analyzing: {
		label: "Analyzing...",
		colorClass: "border-amber-500/50 text-amber-500",
		icon: RefreshCw,
		animate: true,
	},
	error: {
		label: "Error",
		colorClass: "border-destructive/50 text-destructive",
		icon: AlertCircle,
	},
	auth_required: {
		label: "Auth Required",
		colorClass: "border-amber-500/50 text-amber-500",
		icon: AlertCircle,
	},
};

export function AgentStatusBadge({
	status,
	showLabel = true,
}: AgentStatusBadgeProps) {
	const config = statusConfig[status];
	const Icon = config.icon;

	return (
		<AnimatePresence mode="wait">
			<motion.div
				key={status}
				initial={{ opacity: 0, scale: 0.8 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.8 }}
				transition={{ duration: 0.15 }}
				style={{ display: "inline-flex" }}
			>
				<Badge
					variant="outline"
					className={cn(
						"gap-1.5 py-0.5",
						config.colorClass,
						!showLabel && "min-w-8 px-1",
					)}
				>
					{config.animate ? (
						<motion.div
							animate={{ rotate: 360 }}
							transition={{
								duration: 1,
								repeat: Infinity,
								ease: "linear",
							}}
							style={{ display: "flex" }}
						>
							<Icon className="size-3.5" />
						</motion.div>
					) : (
						<Icon className="size-3.5" />
					)}
					{showLabel && config.label}
				</Badge>
			</motion.div>
		</AnimatePresence>
	);
}

/** Animated pulse indicator for online status */
export function OnlineIndicator({ isOnline }: { isOnline: boolean }) {
	return (
		<div className="relative inline-flex">
			<div
				className={cn(
					"size-2 rounded-full",
					isOnline
						? "bg-[var(--trading-bullish)]"
						: "bg-destructive",
				)}
			/>
			{isOnline && (
				<>
					<motion.div
						animate={{ scale: [1, 2.5], opacity: [0.7, 0] }}
						transition={{
							duration: 2,
							repeat: Infinity,
							ease: "easeOut",
						}}
						className="absolute top-0 left-0 size-2 rounded-full bg-[var(--trading-bullish)]"
					/>
					<motion.div
						animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
						transition={{
							duration: 2,
							repeat: Infinity,
							ease: "easeOut",
							delay: 0.6,
						}}
						className="absolute top-0 left-0 size-2 rounded-full bg-[var(--trading-bullish)]"
					/>
				</>
			)}
		</div>
	);
}

export default AgentStatusBadge;
