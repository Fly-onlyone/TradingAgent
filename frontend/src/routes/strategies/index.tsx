/**
 * Strategies List Page
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
	Info,
	MoreVertical,
	Play,
	Plus,
	Square,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { strategiesApi } from "@/api/endpoints/strategies";
import { PerformanceGauge } from "@/components/charts/PerformanceGauge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { notify } from "@/store/uiStore";
import type { Strategy } from "@/types";
import { staggerCascade } from "@/utils/animations/variants";
import { formatPercent } from "@/utils/formatters";
import { requireAuth } from "../-guards";

export const Route = createFileRoute("/strategies/")({
	beforeLoad: requireAuth,
	component: StrategiesPage,
});

function StrategiesPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const {
		data: strategies,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["strategies"],
		queryFn: () => strategiesApi.getStrategies(),
	});

	const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [detailsTarget, setDetailsTarget] = useState<Strategy | null>(null);

	const deleteMutation = useMutation({
		mutationFn: (strategyId: string) =>
			strategiesApi.deleteStrategy(strategyId),
		onSuccess: async () => {
			notify.success("Strategy deleted");
			await queryClient.invalidateQueries({ queryKey: ["strategies"] });
		},
		onError: () => {
			notify.error("Failed to delete strategy");
		},
	});

	const filteredStrategies = useMemo(() => {
		if (!strategies) return [];
		if (filter === "active") return strategies.filter((s) => s.isActive);
		if (filter === "inactive") return strategies.filter((s) => !s.isActive);
		return strategies;
	}, [strategies, filter]);

	const handleToggleActive = async (strategy: Strategy) => {
		try {
			await strategiesApi.toggleStrategy(strategy.id, !strategy.isActive);
			void refetch();
			notify.success(
				strategy.isActive ? "Strategy deactivated" : "Strategy activated",
				strategy.name,
			);
		} catch (_error) {
			notify.error("Failed to update strategy");
		}
	};

	return (
		<PageTransition pageKey="strategies">
			<div>
				<SectionHeader
					title="Strategies"
					subtitle="Manage automated trading strategies for the agent"
					action={
						<Button render={<Link to="/strategies/create" />}>
							<Plus className="size-4" />
							Import Strategy
						</Button>
					}
				/>

				<div className="mb-6 flex flex-wrap items-center gap-2">
					<Badge
						variant={filter === "all" ? "default" : "outline"}
						className="cursor-pointer"
						onClick={() => setFilter("all")}
					>
						All
					</Badge>
					<Badge
						variant={filter === "active" ? "default" : "outline"}
						className={cn(
							"cursor-pointer",
							filter === "active" &&
								"bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
						)}
						onClick={() => setFilter("active")}
					>
						Active
					</Badge>
					<Badge
						variant={filter === "inactive" ? "default" : "outline"}
						className="cursor-pointer"
						onClick={() => setFilter("inactive")}
					>
						Inactive
					</Badge>
				</div>

				{isLoading ? (
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<ShimmerSkeleton key={i} shimmerVariant="card" sx={{ height: 250 }} />
						))}
					</div>
				) : filteredStrategies.length > 0 ? (
					<motion.div
						variants={staggerCascade.container}
						initial="hidden"
						animate="visible"
					>
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
							{filteredStrategies.map((strategy) => (
								<motion.div key={strategy.id} variants={staggerCascade.item}>
									<StrategyCard
										strategy={strategy}
										onToggle={() => handleToggleActive(strategy)}
										onDelete={() => setDeleteTarget(strategy.id)}
										onViewDetails={() => setDetailsTarget(strategy)}
									/>
								</motion.div>
							))}
						</div>
					</motion.div>
				) : (
					<EmptyState
						title="No strategies yet"
						description="Create your first automated trading strategy to get started"
						action={{
							label: "Import Strategy",
							onClick: () => navigate({ to: "/strategies/create" }),
						}}
					/>
				)}

				<ConfirmDialog
					open={!!deleteTarget}
					title="Delete Strategy"
					message="Are you sure you want to delete this strategy? This action cannot be undone."
					confirmLabel="Delete"
					destructive
					loading={deleteMutation.isPending}
					onConfirm={() => {
						if (deleteTarget) {
							deleteMutation.mutate(deleteTarget);
							setDeleteTarget(null);
						}
					}}
					onCancel={() => setDeleteTarget(null)}
				/>

				<Dialog
					open={!!detailsTarget}
					onOpenChange={(open) => {
						if (!open) setDetailsTarget(null);
					}}
				>
					{detailsTarget && (
						<DialogContent className="sm:max-w-md">
							<DialogHeader>
								<DialogTitle>{detailsTarget.name}</DialogTitle>
							</DialogHeader>
							<div className="flex flex-col gap-2">
								<p className="text-sm text-muted-foreground">
									{detailsTarget.description || "No description"}
								</p>
								{detailsTarget.symbol && (
									<p className="mt-1 text-sm">
										<strong>Symbol:</strong> {detailsTarget.symbol}
									</p>
								)}
								{detailsTarget.timeframe && (
									<p className="text-sm">
										<strong>Timeframe:</strong> {detailsTarget.timeframe}
									</p>
								)}
								<p className="text-sm">
									<strong>Status:</strong>{" "}
									{detailsTarget.isActive ? "Active" : "Inactive"}
								</p>
								{detailsTarget.backtestResults && (
									<div className="mt-3">
										<h4 className="mb-1 text-sm font-semibold">
											Backtest Results
										</h4>
										<p className="text-sm">
											Win Rate:{" "}
											{formatPercent(detailsTarget.backtestResults.winRate)}
										</p>
										<p className="text-sm">
											Total Trades:{" "}
											{detailsTarget.backtestResults.totalTrades}
										</p>
										<p className="text-sm">
											P&L:{" "}
											{formatPercent(
												detailsTarget.backtestResults.totalPnlPercent,
											)}
										</p>
										<p className="text-sm">
											Max Drawdown:{" "}
											{formatPercent(
												-detailsTarget.backtestResults.maxDrawdown,
											)}
										</p>
									</div>
								)}
							</div>
						</DialogContent>
					)}
				</Dialog>
			</div>
		</PageTransition>
	);
}

function StrategyCard({
	strategy,
	onToggle,
	onDelete,
	onViewDetails,
}: {
	strategy: Strategy;
	onToggle: () => void;
	onDelete: () => void;
	onViewDetails: () => void;
}) {
	const winRate = strategy.backtestResults?.winRate || 0;

	return (
		<Card
			className={cn(
				"h-full transition-shadow",
				strategy.isActive &&
					"border-emerald-500/50 shadow-[0_0_12px_rgba(var(--color-emerald-500),0.2)]",
			)}
		>
			<motion.div
				whileHover={{
					y: -6,
					transition: { type: "spring", stiffness: 400, damping: 30 },
				}}
				whileTap={{ scale: 0.98 }}
			>
				<CardContent>
					<div className="mb-3 flex items-start justify-between">
						<div>
							<div className="mb-1 flex items-center gap-2">
								<h3 className="text-base font-semibold">{strategy.name}</h3>
								<Badge
									variant={strategy.isActive ? "default" : "secondary"}
									className={
										strategy.isActive
											? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
											: ""
									}
								>
									{strategy.isActive ? "Active" : "Inactive"}
								</Badge>
							</div>
							{strategy.symbol && (
								<p className="text-sm text-muted-foreground">
									{strategy.symbol} | {strategy.timeframe}
								</p>
							)}
						</div>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={<Button variant="ghost" size="icon-xs" />}
							>
								<MoreVertical className="size-4" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={onViewDetails}>
									<Info className="size-4" /> View Details
								</DropdownMenuItem>
								<DropdownMenuItem onClick={onToggle}>
									{strategy.isActive ? (
										<>
											<Square className="size-4" /> Deactivate
										</>
									) : (
										<>
											<Play className="size-4" /> Activate
										</>
									)}
								</DropdownMenuItem>
								<DropdownMenuItem variant="destructive" onClick={onDelete}>
									<Trash2 className="size-4" /> Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					<p className="mb-3 min-h-[40px] text-sm text-muted-foreground">
						{strategy.description || "No description"}
					</p>

					{/* Performance */}
					<div className="mb-3 flex justify-around">
						<PerformanceGauge
							value={winRate}
							label="Win Rate"
							size={80}
							thickness={6}
						/>
					</div>

					{/* Stats */}
					{strategy.backtestResults && (
						<div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3">
							<div className="text-center">
								<p className="text-xs text-muted-foreground">Trades</p>
								<p className="text-sm font-semibold">
									{strategy.backtestResults.totalTrades}
								</p>
							</div>
							<div className="text-center">
								<p className="text-xs text-muted-foreground">P&L</p>
								<p
									className={cn(
										"text-sm font-semibold",
										strategy.backtestResults.totalPnlPercent >= 0
											? "text-emerald-400"
											: "text-red-400",
									)}
								>
									{formatPercent(strategy.backtestResults.totalPnlPercent)}
								</p>
							</div>
							<div className="text-center">
								<p className="text-xs text-muted-foreground">Max DD</p>
								<p className="text-sm font-semibold text-red-400">
									{formatPercent(-strategy.backtestResults.maxDrawdown)}
								</p>
							</div>
						</div>
					)}

					{/* Toggle */}
					<div className="mt-3 flex justify-end">
						<Switch
							checked={strategy.isActive}
							onCheckedChange={onToggle}
						/>
					</div>
				</CardContent>
			</motion.div>
		</Card>
	);
}
