/**
 * Trades Page - P&L Tracking
 * Displays trade history with profit/loss analysis
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { tradesApi } from "@/api/endpoints/trades";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import {
	TradeExportButton,
	TradeFilterBar,
	TradeSummaryCards,
	TradesBySymbolAccordion,
	TradeTable,
} from "@/components/trades";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { useTradeStore } from "@/store/tradeStore";
import { tabSwitch } from "@/utils/animations/variants";
import { requireAuth } from "../-guards";

export const Route = createFileRoute("/trades/")({
	beforeLoad: requireAuth,
	component: TradesPage,
});

function TradesPage() {
	const {
		filters,
		viewMode,
		expandedSymbols,
		setFilters,
		resetFilters,
		setViewMode,
		setPage,
		setPageSize,
		toggleSymbolExpanded,
		expandAllSymbols,
		collapseAllSymbols,
	} = useTradeStore();

	// Fetch trades
	const tradesQuery = useQuery({
		queryKey: ["trades", filters],
		queryFn: () => tradesApi.getTrades(filters),
		staleTime: 30_000,
	});

	// Fetch summary
	const summaryQuery = useQuery({
		queryKey: ["trades-summary", filters.startDate, filters.endDate],
		queryFn: () =>
			tradesApi.getSummary({
				startDate: filters.startDate,
				endDate: filters.endDate,
			}),
		staleTime: 30_000,
	});

	// Fetch by symbol (for grouped view)
	const bySymbolQuery = useQuery({
		queryKey: ["trades-by-symbol", filters.startDate, filters.endDate],
		queryFn: () =>
			tradesApi.getBySymbol({
				startDate: filters.startDate,
				endDate: filters.endDate,
			}),
		staleTime: 30_000,
		enabled: viewMode === "grouped",
	});

	const isLoading = tradesQuery.isLoading || summaryQuery.isLoading;
	const error = tradesQuery.error || summaryQuery.error;

	return (
		<PageTransition pageKey="trades">
			<div>
				<SectionHeader
					title="Trade History"
					subtitle="Review agent-executed trades and P&L performance"
					action={
						<TradeExportButton
							startDate={filters.startDate}
							endDate={filters.endDate}
							disabled={
								isLoading ||
								!tradesQuery.data?.trades.length
							}
						/>
					}
				/>

				{error && (
					<Alert variant="destructive" className="mb-6">
						<AlertDescription>
							Failed to load trade data. Please try again.
						</AlertDescription>
					</Alert>
				)}

				{/* Summary Cards */}
				<div className="mb-6">
					<TradeSummaryCards
						summary={summaryQuery.data ?? null}
						isLoading={summaryQuery.isLoading}
					/>
				</div>

				{/* P&L Chart Placeholder */}
				<Card className="mb-6">
					<CardContent>
						<h3 className="mb-3 text-base font-semibold">
							P&L Performance
						</h3>
						<div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-foreground/20">
							<span className="text-sm text-muted-foreground">
								P&L chart — coming soon
							</span>
						</div>
					</CardContent>
				</Card>

				{/* Filter Bar */}
				<TradeFilterBar
					filters={filters}
					viewMode={viewMode}
					onFilterChange={setFilters}
					onViewModeChange={setViewMode}
					onResetFilters={resetFilters}
				/>

				{/* Trade Data */}
				<AnimatePresence mode="wait">
					<motion.div
						key={viewMode}
						variants={tabSwitch}
						initial="initial"
						animate="animate"
						exit="exit"
					>
						{viewMode === "table" ? (
							<TradeTable
								trades={tradesQuery.data?.trades ?? []}
								total={tradesQuery.data?.total ?? 0}
								page={filters.page ?? 1}
								pageSize={filters.pageSize ?? 20}
								onPageChange={setPage}
								onPageSizeChange={setPageSize}
								isLoading={tradesQuery.isLoading}
							/>
						) : (
							<TradesBySymbolAccordion
								data={bySymbolQuery.data ?? []}
								expandedSymbols={expandedSymbols}
								onToggleSymbol={toggleSymbolExpanded}
								onExpandAll={() =>
									expandAllSymbols(
										(bySymbolQuery.data ?? []).map(
											(item) => item.symbol,
										),
									)
								}
								onCollapseAll={collapseAllSymbols}
								isLoading={bySymbolQuery.isLoading}
							/>
						)}
					</motion.div>
				</AnimatePresence>
			</div>
		</PageTransition>
	);
}
