/**
 * Decision History Panel Component
 * Filterable list of agent decisions with expandable details
 */

import {
	AlertTriangle,
	ArrowLeftRight,
	BarChart3,
	Bell,
	ChevronDown,
	ChevronUp,
	ExternalLink,
	FileText,
	Filter,
	Hourglass,
	Lightbulb,
	PauseCircle,
	ThumbsDown,
	ThumbsUp,
	TrendingDown,
	TrendingUp,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type {
	AgentDecisionSummary,
	DecisionAction,
	DecisionFilters,
	DecisionStatus,
	DecisionType,
} from "@/types/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Icon mappings
const actionIcons: Record<DecisionAction, React.ElementType> = {
	buy: TrendingUp,
	sell: TrendingDown,
	hold: PauseCircle,
	wait: Hourglass,
	close: X,
};

const typeIcons: Record<DecisionType, React.ElementType> = {
	analysis: BarChart3,
	recommendation: Lightbulb,
	trade_execution: ArrowLeftRight,
	risk_alert: AlertTriangle,
	news_insight: FileText,
	monitoring_alert: Bell,
};

interface DecisionHistoryPanelProps {
	decisions: AgentDecisionSummary[];
	symbols: string[];
	isLoading?: boolean;
	onLoadMore?: () => void;
	hasMore?: boolean;
	onDecisionClick?: (decisionId: string) => void;
	onConfirmDecision?: (decisionId: string) => void;
	onRejectDecision?: (decisionId: string) => void;
	onFeedback?: (
		decisionId: string,
		feedback: "thumbs_up" | "thumbs_down",
	) => void;
	filters: DecisionFilters;
	onFiltersChange: (filters: DecisionFilters) => void;
}

interface DecisionCardProps {
	decision: AgentDecisionSummary;
	onExpand?: () => void;
	onConfirm?: () => void;
	onReject?: () => void;
	onFeedback?: (feedback: "thumbs_up" | "thumbs_down") => void;
}

const getActionColorClass = (action?: DecisionAction) => {
	switch (action) {
		case "buy":
			return "bg-emerald-500 text-white";
		case "sell":
			return "bg-red-500 text-white";
		case "hold":
			return "bg-sky-500 text-white";
		case "wait":
			return "bg-amber-500 text-white";
		case "close":
			return "bg-muted text-muted-foreground";
		default:
			return "bg-muted text-muted-foreground";
	}
};

const getStatusVariant = (status: DecisionStatus) => {
	switch (status) {
		case "pending":
			return "border-amber-500/50 text-amber-500";
		case "confirmed":
			return "border-sky-500/50 text-sky-500";
		case "executed":
			return "border-emerald-500/50 text-emerald-500";
		case "rejected":
			return "border-red-500/50 text-red-500";
		case "expired":
			return "border-muted-foreground/40 text-muted-foreground";
		default:
			return "border-muted-foreground/40 text-muted-foreground";
	}
};

function DecisionHistoryCard({
	decision,
	onExpand,
	onConfirm,
	onReject,
	onFeedback,
}: DecisionCardProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	const TypeIcon = typeIcons[decision.decisionType] || BarChart3;
	const ActionIcon = decision.action ? actionIcons[decision.action] : null;
	const isPending = decision.status === "pending";

	const confidenceColor =
		decision.confidence !== undefined
			? decision.confidence >= 70
				? "text-emerald-500"
				: decision.confidence >= 40
					? "text-amber-500"
					: "text-red-500"
			: "";

	const progressColorClass =
		decision.confidence !== undefined
			? decision.confidence >= 70
				? "[&_[data-slot=progress-indicator]]:bg-emerald-500"
				: decision.confidence >= 40
					? "[&_[data-slot=progress-indicator]]:bg-amber-500"
					: "[&_[data-slot=progress-indicator]]:bg-red-500"
			: "";

	return (
		<Card
			className={cn(
				"mb-3",
				isPending
					? "border-2 border-amber-500 bg-[rgba(var(--trading-warning-rgb),0.05)]"
					: "",
			)}
		>
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
			>
				<CardContent className="space-y-2 py-3">
					{/* Header Row */}
					<div className="flex items-center gap-2">
						<TypeIcon className="size-4 text-muted-foreground" />

						{decision.symbol && (
							<Badge variant="outline">{decision.symbol}</Badge>
						)}

						{decision.action && ActionIcon && (
							<Badge
								className={cn(
									"gap-1",
									getActionColorClass(decision.action),
								)}
							>
								<ActionIcon className="size-3" />
								{decision.action.toUpperCase()}
							</Badge>
						)}

						<Badge
							variant="outline"
							className={cn(
								"ml-auto",
								getStatusVariant(decision.status),
							)}
						>
							{decision.status}
						</Badge>

						<Button
							variant="ghost"
							size="icon-xs"
							onClick={() => setIsExpanded(!isExpanded)}
						>
							{isExpanded ? (
								<ChevronUp className="size-4" />
							) : (
								<ChevronDown className="size-4" />
							)}
						</Button>
					</div>

					{/* Summary */}
					<p className="text-sm">{decision.summary}</p>

					{/* Confidence Bar */}
					{decision.confidence !== undefined && (
						<div>
							<div className="mb-0.5 flex justify-between">
								<span className="text-xs text-muted-foreground">
									Confidence
								</span>
								<span
									className={cn(
										"text-xs font-semibold",
										confidenceColor,
									)}
								>
									{decision.confidence.toFixed(0)}%
								</span>
							</div>
							<Progress
								value={decision.confidence}
								className={cn(
									"[&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-track]]:rounded-full",
									progressColorClass,
								)}
							/>
						</div>
					)}

					{/* Timestamp */}
					<p className="text-xs text-muted-foreground/60">
						{new Date(decision.createdAt).toLocaleString()}
					</p>

					{/* Expanded Details */}
					{isExpanded && (
						<div>
							<Separator className="my-3" />

							{/* Action buttons for pending decisions */}
							{isPending && (
								<div className="mb-3 flex gap-2">
									<Button
										size="sm"
										className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
										onClick={onConfirm}
									>
										Confirm
									</Button>
									<Button
										variant="destructive"
										size="sm"
										className="flex-1"
										onClick={onReject}
									>
										Reject
									</Button>
								</div>
							)}

							{/* Feedback buttons */}
							{decision.status === "executed" && onFeedback && (
								<div className="mb-2 flex items-center gap-2">
									<span className="text-xs text-muted-foreground">
										Was this helpful?
									</span>
									<Button
										variant="ghost"
										size="icon-xs"
										onClick={() =>
											onFeedback("thumbs_up")
										}
										className="text-emerald-500 hover:text-emerald-600"
									>
										<ThumbsUp className="size-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon-xs"
										onClick={() =>
											onFeedback("thumbs_down")
										}
										className="text-red-500 hover:text-red-600"
									>
										<ThumbsDown className="size-3.5" />
									</Button>
								</div>
							)}

							{/* View full details link */}
							<Button
								variant="link"
								size="sm"
								onClick={onExpand}
								className="mt-1 px-0"
							>
								View Full Details
								<ExternalLink className="ml-1 size-3" />
							</Button>
						</div>
					)}
				</CardContent>
			</motion.div>
		</Card>
	);
}

function DecisionHistorySkeleton() {
	return (
		<>
			{[1, 2, 3].map((i) => (
				<Card key={i} className="mb-3">
					<CardContent className="space-y-2 py-3">
						<div className="flex gap-2">
							<Skeleton className="size-6 rounded-full" />
							<Skeleton className="h-6 w-15 rounded" />
							<Skeleton className="h-6 w-12 rounded" />
							<Skeleton className="ml-auto h-6 w-18 rounded" />
						</div>
						<Skeleton className="h-4 w-[90%]" />
						<Skeleton className="h-4 w-[60%]" />
						<Skeleton className="mt-2 h-1 w-full rounded" />
					</CardContent>
				</Card>
			))}
		</>
	);
}

export function DecisionHistoryPanel({
	decisions,
	symbols,
	isLoading = false,
	onLoadMore,
	hasMore = false,
	onDecisionClick,
	onConfirmDecision,
	onRejectDecision,
	onFeedback,
	filters,
	onFiltersChange,
}: DecisionHistoryPanelProps) {
	const [showFilters, setShowFilters] = useState(false);

	const activeFilterCount = Object.values(filters).filter(Boolean).length;

	const handleFilterChange = (
		key: keyof DecisionFilters,
		value: string | undefined,
	) => {
		onFiltersChange({
			...filters,
			[key]: value || undefined,
		});
	};

	const clearFilters = () => {
		onFiltersChange({});
	};

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border p-4">
				<h3 className="text-sm font-semibold">Decision History</h3>
				<div className="relative">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => setShowFilters(!showFilters)}
					>
						<Filter className="size-4" />
					</Button>
					{activeFilterCount > 0 && (
						<span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white">
							{activeFilterCount}
						</span>
					)}
				</div>
			</div>

			{/* Filters */}
			<Collapsible open={showFilters} onOpenChange={setShowFilters}>
				<CollapsibleContent>
					<div className="space-y-3 bg-muted/50 p-4">
						<Select
							value={filters.decisionType || "all"}
							onValueChange={(v) =>
								handleFilterChange(
									"decisionType",
									v === "all" ? undefined : (v as DecisionType),
								)
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="All Types" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Types</SelectItem>
								<SelectItem value="analysis">Analysis</SelectItem>
								<SelectItem value="recommendation">
									Recommendation
								</SelectItem>
								<SelectItem value="trade_execution">
									Trade
								</SelectItem>
								<SelectItem value="risk_alert">
									Risk Alert
								</SelectItem>
								<SelectItem value="news_insight">News</SelectItem>
								<SelectItem value="monitoring_alert">
									Alert
								</SelectItem>
							</SelectContent>
						</Select>

						<Select
							value={filters.symbol || "all"}
							onValueChange={(v) =>
								handleFilterChange(
									"symbol",
									v === "all" ? undefined : v,
								)
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="All Symbols" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Symbols</SelectItem>
								{symbols.map((symbol) => (
									<SelectItem key={symbol} value={symbol}>
										{symbol}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select
							value={filters.action || "all"}
							onValueChange={(v) =>
								handleFilterChange(
									"action",
									v === "all"
										? undefined
										: (v as DecisionAction),
								)
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="All Actions" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Actions</SelectItem>
								<SelectItem value="buy">Buy</SelectItem>
								<SelectItem value="sell">Sell</SelectItem>
								<SelectItem value="hold">Hold</SelectItem>
								<SelectItem value="wait">Wait</SelectItem>
								<SelectItem value="close">Close</SelectItem>
							</SelectContent>
						</Select>

						<Select
							value={filters.status || "all"}
							onValueChange={(v) =>
								handleFilterChange(
									"status",
									v === "all"
										? undefined
										: (v as DecisionStatus),
								)
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="All Statuses" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Statuses</SelectItem>
								<SelectItem value="pending">Pending</SelectItem>
								<SelectItem value="confirmed">
									Confirmed
								</SelectItem>
								<SelectItem value="executed">Executed</SelectItem>
								<SelectItem value="rejected">Rejected</SelectItem>
								<SelectItem value="expired">Expired</SelectItem>
							</SelectContent>
						</Select>

						{activeFilterCount > 0 && (
							<Button
								variant="ghost"
								size="sm"
								onClick={clearFilters}
								className="w-full"
							>
								Clear Filters
							</Button>
						)}
					</div>
					<Separator />
				</CollapsibleContent>
			</Collapsible>

			{/* Decision List */}
			<div className="flex-1 overflow-auto p-4">
				{isLoading ? (
					<DecisionHistorySkeleton />
				) : decisions.length === 0 ? (
					<div className="flex h-full flex-col items-center justify-center text-muted-foreground">
						<BarChart3 className="mb-2 size-12 opacity-50" />
						<p className="text-center text-sm">
							No decisions found
						</p>
						{activeFilterCount > 0 && (
							<p className="text-center text-xs text-muted-foreground/60">
								Try adjusting your filters
							</p>
						)}
					</div>
				) : (
					<AnimatePresence>
						{decisions.map((decision) => (
							<DecisionHistoryCard
								key={decision.id}
								decision={decision}
								onExpand={() =>
									onDecisionClick?.(decision.id)
								}
								onConfirm={() =>
									onConfirmDecision?.(decision.id)
								}
								onReject={() =>
									onRejectDecision?.(decision.id)
								}
								onFeedback={(feedback) =>
									onFeedback?.(decision.id, feedback)
								}
							/>
						))}
					</AnimatePresence>
				)}

				{/* Load More */}
				{hasMore && !isLoading && (
					<div className="mt-4 text-center">
						<Button variant="outline" size="sm" onClick={onLoadMore}>
							Load More
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}

export default DecisionHistoryPanel;
