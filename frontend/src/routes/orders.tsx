/**
 * Orders Page
 */

import ListAltIcon from "@mui/icons-material/ListAlt";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	Stack,
	Tab,
	Tabs,
	TextField,
	Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { ordersApi } from "@/api/endpoints/orders";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { type Column, DataTable } from "@/components/data-display/DataTable";
import { PositionCard } from "@/components/trading/PositionCard";
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

	const [tabValue, setTabValue] = useState(0);
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

	const getStatusChip = (status: string) => {
		const config = ORDER_STATUSES.find((s) => s.value === status);
		return (
			<Chip
				label={config?.label || status}
				size="small"
				color={
					(config?.color as
						| "success"
						| "error"
						| "warning"
						| "info"
						| "default") || "default"
				}
				variant="outlined"
			/>
		);
	};

	const openOrders = openOrdersQuery.data?.orders ?? [];
	const historyOrders = historyOrdersQuery.data?.orders ?? [];
	const openCount = openOrdersQuery.data?.count ?? openOrders.length;
	const historyCount = historyOrdersQuery.data?.count ?? historyOrders.length;

	const activeApiError =
		tabValue === 0
			? openOrdersQuery.data?.error ||
				(openOrdersQuery.isError
					? getErrorMessage(openOrdersQuery.error)
					: null)
			: tabValue === 1
				? historyOrdersQuery.data?.error ||
					(historyOrdersQuery.isError
						? getErrorMessage(historyOrdersQuery.error)
						: null)
				: null;

	const lastUpdatedAt =
		tabValue === 0
			? openOrdersQuery.dataUpdatedAt
			: tabValue === 1
				? historyOrdersQuery.dataUpdatedAt
				: 0;

	const columns: Column<OkxOrder>[] = [
		{ id: "symbol", label: "Symbol", minWidth: 100 },
		{
			id: "side",
			label: "Side",
			render: (row) => (
				<Chip
					label={row.side.toUpperCase()}
					size="small"
					color={row.side === "buy" ? "success" : "error"}
				/>
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
			render: (row) => getStatusChip(row.status),
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
		if (tabValue === 0) {
			void openOrdersQuery.refetch();
			return;
		}
		if (tabValue === 1) {
			void historyOrdersQuery.refetch();
		}
	};

	return (
		<PageTransition pageKey="orders">
			<Box>
				<SectionHeader
					title="Orders & Positions"
					subtitle="Review agent-executed orders and current positions"
				/>

				<Stack
					direction={{ xs: "column", sm: "row" }}
					spacing={2}
					sx={{ mb: 2, alignItems: { sm: "center" } }}
				>
					<TextField
						size="small"
						label="Symbol (optional)"
						placeholder="BTC-USDT"
						value={symbolFilter}
						onChange={(event) =>
							setSymbolFilter(event.target.value.toUpperCase())
						}
						sx={{ width: { xs: "100%", sm: 220 } }}
					/>
					<Button
						variant="outlined"
						startIcon={<RefreshIcon />}
						onClick={handleRefresh}
						disabled={
							openOrdersQuery.isFetching || historyOrdersQuery.isFetching
						}
					>
						Refresh
					</Button>
					{lastUpdatedAt > 0 && (
						<Typography variant="body2" color="text.secondary">
							Last updated: {formatTimestamp(lastUpdatedAt)}
						</Typography>
					)}
				</Stack>

				{activeApiError && (
					<Alert severity="warning" sx={{ mb: 2 }}>
						{activeApiError}
					</Alert>
				)}

				<Tabs
					value={tabValue}
					onChange={(_, v) => setTabValue(v)}
					sx={{ mb: 3 }}
				>
					<Tab label={`Open Orders${openCount > 0 ? ` (${openCount})` : ""}`} />
					<Tab
						label={`Order History${historyCount > 0 ? ` (${historyCount})` : ""}`}
					/>
					<Tab
						label={`Positions${positions.length > 0 ? ` (${positions.length})` : ""}`}
					/>
				</Tabs>

				<AnimatePresence mode="wait">
					{tabValue === 0 && (
						<motion.div
							key="open-orders"
							variants={listStagger.container}
							initial="hidden"
							animate="visible"
							exit={{ opacity: 0, x: 20, transition: { duration: 0.15 } }}
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
					)}

					{tabValue === 1 && (
						<motion.div
							key="order-history"
							variants={listStagger.container}
							initial="hidden"
							animate="visible"
							exit={{ opacity: 0, x: 20, transition: { duration: 0.15 } }}
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
					)}

					{tabValue === 2 && (
						<motion.div
							key="positions"
							initial={{ opacity: 0, x: -20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: 20 }}
							transition={{ duration: 0.15 }}
						>
							{positions.length === 0 ? (
								<EmptyState
									icon={<ListAltIcon />}
									title="No open positions"
									description="The agent hasn't opened any trades yet"
								/>
							) : (
								<Box
									sx={{
										display: "grid",
										gridTemplateColumns:
											"repeat(auto-fill, minmax(350px, 1fr))",
										gap: 2,
									}}
								>
									{positions.map((position) => (
										<PositionCard key={position.id} position={position} />
									))}
								</Box>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</Box>
		</PageTransition>
	);
}
