/**
 * Orders Page
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { List, RefreshCw } from "lucide-react";
import { useState } from "react";

import { ordersApi } from "@/api/endpoints/orders";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { type Column, DataTable } from "@/components/data-display/DataTable";
import { PositionCard } from "@/components/trading/PositionCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useOrderStore } from "@/store/orderStore";
import type { OkxOrder } from "@/types";
import { listStagger } from "@/utils/animations/variants";
import { ORDER_STATUSES } from "@/utils/constants";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime, formatPrice } from "@/utils/formatters";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/orders")({
	beforeLoad: requireAuth,
	component: OrdersPage,
});

function formatTimestamp(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) {
		return "-";
	}
	return formatDateTime(new Date(ms).toISOString());
}

function OrdersPage() {
	const positions = useOrderStore((state) => state.positions);

	const [tabValue, setTabValue] = useState("open");
	const [symbolFilter, setSymbolFilter] = useState("");

	const normalizedSymbol = symbolFilter.trim().toUpperCase();

	const openOrdersQuery = useQuery({
		queryKey: ["orders", "okx", "open", normalizedSymbol, 50],
		queryFn: () =>
			ordersApi.getOkxOpenOrders({
				symbol: normalizedSymbol || undefined,
				limit: 50,
			}),
		refetchInterval: 15_000,
		retry: 1,
	});

	const historyOrdersQuery = useQuery({
		queryKey: ["orders", "okx", "history", normalizedSymbol, 50],
		queryFn: () =>
			ordersApi.getOkxOrderHistory({
				symbol: normalizedSymbol || undefined,
				limit: 50,
			}),
		refetchInterval: 15_000,
		retry: 1,
	});

	const getStatusBadge = (status: string) => {
		const config = ORDER_STATUSES.find((s) => s.value === status);
		const colorMap: Record<string, string> = {
			success:
				"border-[var(--trading-bullish)] text-[var(--trading-bullish)]",
			error: "border-[var(--trading-bearish)] text-[var(--trading-bearish)]",
			warning: "border-yellow-500 text-yellow-500",
			info: "border-blue-500 text-blue-500",
		};
		const colorClass = colorMap[config?.color ?? ""] ?? "";
		return (
			<Badge variant="outline" className={colorClass}>
				{config?.label || status}
			</Badge>
		);
	};

	const openOrders = openOrdersQuery.data?.orders ?? [];
	const historyOrders = historyOrdersQuery.data?.orders ?? [];
	const openCount = openOrdersQuery.data?.count ?? openOrders.length;
	const historyCount = historyOrdersQuery.data?.count ?? historyOrders.length;

	const activeApiError =
		tabValue === "open"
			? openOrdersQuery.data?.error ||
				(openOrdersQuery.isError
					? getErrorMessage(openOrdersQuery.error)
					: null)
			: tabValue === "history"
				? historyOrdersQuery.data?.error ||
					(historyOrdersQuery.isError
						? getErrorMessage(historyOrdersQuery.error)
						: null)
				: null;

	const lastUpdatedAt =
		tabValue === "open"
			? openOrdersQuery.dataUpdatedAt
			: tabValue === "history"
				? historyOrdersQuery.dataUpdatedAt
				: 0;

	const columns: Column<OkxOrder>[] = [
		{ id: "symbol", label: "Symbol", minWidth: 100 },
		{
			id: "side",
			label: "Side",
			render: (row) => (
				<Badge
					variant="outline"
					className={cn(
						row.side === "buy"
							? "border-[var(--trading-bullish)] text-[var(--trading-bullish)]"
							: "border-[var(--trading-bearish)] text-[var(--trading-bearish)]",
					)}
				>
					{row.side.toUpperCase()}
				</Badge>
			),
		},
		{
			id: "orderType",
			label: "Type",
			format: (v) => String(v).toUpperCase(),
		},
		{
			id: "quantity",
			label: "Quantity",
			align: "right",
			format: (v) => Number(v).toFixed(6),
		},
		{
			id: "filledQuantity",
			label: "Filled",
			align: "right",
			format: (v) => Number(v).toFixed(6),
		},
		{
			id: "price",
			label: "Price",
			align: "right",
			render: (row) =>
				row.price !== undefined ? `$${formatPrice(row.price)}` : "-",
		},
		{
			id: "status",
			label: "Status",
			render: (row) => getStatusBadge(row.status),
		},
		{
			id: "createdAtMs",
			label: "Created",
			render: (row) => formatTimestamp(row.createdAtMs),
		},
		{
			id: "updatedAtMs",
			label: "Updated",
			render: (row) => formatTimestamp(row.updatedAtMs),
		},
	];

	const handleRefresh = () => {
		if (tabValue === "open") {
			void openOrdersQuery.refetch();
			return;
		}
		if (tabValue === "history") {
			void historyOrdersQuery.refetch();
		}
	};

	return (
		<PageTransition pageKey="orders">
			<div>
				<SectionHeader
					title="Orders & Positions"
					subtitle="Review agent-executed orders and current positions"
				/>

				<div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
					<div className="w-full sm:w-[220px]">
						<Label htmlFor="symbol-filter" className="sr-only">
							Symbol (optional)
						</Label>
						<Input
							id="symbol-filter"
							placeholder="BTC-USDT"
							value={symbolFilter}
							onChange={(event) =>
								setSymbolFilter(event.target.value.toUpperCase())
							}
						/>
					</div>
					<Button
						variant="outline"
						onClick={handleRefresh}
						disabled={
							openOrdersQuery.isFetching || historyOrdersQuery.isFetching
						}
					>
						<RefreshCw className="size-4" />
						Refresh
					</Button>
					{lastUpdatedAt > 0 && (
						<span className="text-sm text-muted-foreground">
							Last updated: {formatTimestamp(lastUpdatedAt)}
						</span>
					)}
				</div>

				{activeApiError && (
					<Alert variant="destructive" className="mb-4">
						<AlertDescription>{activeApiError}</AlertDescription>
					</Alert>
				)}

				<Tabs value={tabValue} onValueChange={setTabValue}>
					<TabsList className="mb-6">
						<TabsTrigger value="open">
							Open Orders{openCount > 0 ? ` (${openCount})` : ""}
						</TabsTrigger>
						<TabsTrigger value="history">
							Order History
							{historyCount > 0 ? ` (${historyCount})` : ""}
						</TabsTrigger>
						<TabsTrigger value="positions">
							Positions
							{positions.length > 0 ? ` (${positions.length})` : ""}
						</TabsTrigger>
					</TabsList>

					<AnimatePresence mode="wait">
						<TabsContent value="open" key="open-orders">
							<motion.div
								variants={listStagger.container}
								initial="hidden"
								animate="visible"
								exit={{
									opacity: 0,
									x: 20,
									transition: { duration: 0.15 },
								}}
							>
								<Card>
									<CardContent>
										<DataTable
											columns={columns}
											rows={openOrders}
											rowKey="orderId"
											loading={openOrdersQuery.isLoading}
											emptyMessage="No open orders — the agent hasn't placed any yet"
											maxHeight={500}
										/>
									</CardContent>
								</Card>
							</motion.div>
						</TabsContent>

						<TabsContent value="history" key="order-history">
							<motion.div
								variants={listStagger.container}
								initial="hidden"
								animate="visible"
								exit={{
									opacity: 0,
									x: 20,
									transition: { duration: 0.15 },
								}}
							>
								<Card>
									<CardContent>
										<DataTable
											columns={columns}
											rows={historyOrders}
											rowKey="orderId"
											loading={historyOrdersQuery.isLoading}
											emptyMessage="No order history from OKX"
											maxHeight={500}
										/>
									</CardContent>
								</Card>
							</motion.div>
						</TabsContent>

						<TabsContent value="positions" key="positions">
							<motion.div
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: 20 }}
								transition={{ duration: 0.15 }}
							>
								{positions.length === 0 ? (
									<EmptyState
										icon={<List className="size-16" />}
										title="No open positions"
										description="The agent hasn't opened any trades yet"
									/>
								) : (
									<div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4">
										{positions.map((position) => (
											<PositionCard
												key={position.id}
												position={position}
											/>
										))}
									</div>
								)}
							</motion.div>
						</TabsContent>
					</AnimatePresence>
				</Tabs>
			</div>
		</PageTransition>
	);
}
