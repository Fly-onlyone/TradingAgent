/**
 * Trades Page - P&L Tracking
 * Displays trade history with profit/loss analysis
 */

import { Alert, Box, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { tradesApi } from "@/api/endpoints/trades";
import { PageTransition } from "@/components/common/PageTransition";
import {
	TradeExportButton,
	TradeFilterBar,
	TradeSummaryCards,
	TradesBySymbolAccordion,
	TradeTable,
} from "@/components/trades";
import { useTradeStore } from "@/store/tradeStore";
import { spring } from "@/utils/animations/variants";
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
			<Box>
				<motion.div
					initial={{ opacity: 0, x: -40 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ ...spring.snappy, delay: 0.1 }}
				>
					<Box
						sx={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							mb: 3,
						}}
					>
						<Typography variant="h4" fontWeight={700}>
							Trade History
						</Typography>
						<TradeExportButton
							startDate={filters.startDate}
							endDate={filters.endDate}
							disabled={isLoading || !tradesQuery.data?.trades.length}
						/>
					</Box>
				</motion.div>

				{error && (
					<Alert severity="error" sx={{ mb: 3 }}>
						Failed to load trade data. Please try again.
					</Alert>
				)}

				{/* Summary Cards */}
				<Box sx={{ mb: 3 }}>
					<TradeSummaryCards
						summary={summaryQuery.data ?? null}
						isLoading={summaryQuery.isLoading}
					/>
				</Box>

				{/* Filter Bar */}
				<TradeFilterBar
					filters={filters}
					viewMode={viewMode}
					onFilterChange={setFilters}
					onViewModeChange={setViewMode}
					onResetFilters={resetFilters}
				/>

				{/* Trade Data */}
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
								(bySymbolQuery.data ?? []).map((item) => item.symbol),
							)
						}
						onCollapseAll={collapseAllSymbols}
						isLoading={bySymbolQuery.isLoading}
					/>
				)}
			</Box>
		</PageTransition>
	);
}
