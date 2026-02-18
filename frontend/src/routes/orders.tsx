/**
 * Orders Page
 */

import CancelIcon from "@mui/icons-material/Cancel";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	IconButton,
	Stack,
	Tab,
	Tabs,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { ordersApi } from "@/api/endpoints/orders";
import { PageTransition } from "@/components/common/PageTransition";
import { type Column, DataTable } from "@/components/data-display/DataTable";
import { PositionCard } from "@/components/trading/PositionCard";
import { useOrderStore } from "@/store/orderStore";
import type { ApiError, OkxOrder } from "@/types";
import { ORDER_STATUSES } from "@/utils/constants";
import { formatDateTime, formatPrice } from "@/utils/formatters";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/orders")({
	beforeLoad: requireAuth,
	component: OrdersPage,
});

function getErrorMessage(error: unknown): string {
	if (error && typeof error === "object") {
		const apiError = error as Partial<ApiError>;
		if (typeof apiError.detail === "string" && apiError.detail) {
			return apiError.detail;
		}
		if (
			"message" in error &&
			typeof error.message === "string" &&
			error.message
		) {
			return error.message;
		}
	}
	return "Unable to fetch OKX orders.";
}

function formatTimestamp(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) {
		return "-";
	}
	return formatDateTime(new Date(ms).toISOString());
}

function isCancellableStatus(status: string): boolean {
	return (
		status === "open" || status === "pending" || status === "partially_filled"
	);
}

function OrdersPage() {
	const queryClient = useQueryClient();
	const positions = useOrderStore((state) => state.positions);

	const [tabValue, setTabValue] = useState(0);
	const [symbolFilter, setSymbolFilter] = useState("");
	const [actionMessage, setActionMessage] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

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

	const cancelMutation = useMutation({
		mutationFn: async (order: OkxOrder) => {
			const result = await ordersApi.cancelOkxOrder({
				symbol: order.symbol,
				orderId: order.orderId,
			});
			if (!result.success) {
				throw new Error(
					result.error || result.message || "Order cancellation failed",
				);
			}
			return result;
		},
		onSuccess: async (result) => {
			setActionError(null);
			setActionMessage(result.message);
			await queryClient.invalidateQueries({
				queryKey: ["orders", "okx", "open"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["orders", "okx", "history"],
			});
		},
		onError: (error) => {
			setActionMessage(null);
			setActionError(getErrorMessage(error));
		},
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
		{
			id: "actions",
			label: "",
			sortable: false,
			render: (row) =>
				tabValue === 0 && isCancellableStatus(row.status) ? (
					<Tooltip title="Cancel order">
						<IconButton
							size="small"
							color="error"
							onClick={() => {
								setActionMessage(null);
								setActionError(null);
								cancelMutation.mutate(row);
							}}
							disabled={cancelMutation.isPending}
						>
							<CancelIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				) : null,
		},
	];

	const handleRefresh = () => {
		setActionMessage(null);
		setActionError(null);
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
				<Typography variant="h4" fontWeight={700} gutterBottom>
					Orders & Positions
				</Typography>

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
							openOrdersQuery.isFetching ||
							historyOrdersQuery.isFetching ||
							cancelMutation.isPending
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
				{actionError && (
					<Alert severity="error" sx={{ mb: 2 }}>
						{actionError}
					</Alert>
				)}
				{actionMessage && (
					<Alert severity="success" sx={{ mb: 2 }}>
						{actionMessage}
					</Alert>
				)}

				<Tabs
					value={tabValue}
					onChange={(_, v) => setTabValue(v)}
					sx={{ mb: 3 }}
				>
					<Tab label={`Open Orders (${openCount})`} />
					<Tab label={`Order History (${historyCount})`} />
					<Tab label={`Positions (${positions.length})`} />
				</Tabs>

				<AnimatePresence mode="wait">
					{tabValue === 0 && (
						<motion.div
							key="open-orders"
							initial={{ opacity: 0, x: -20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: 20 }}
							transition={{ duration: 0.15 }}
						>
							<Card>
								<CardContent>
									<DataTable
										columns={columns}
										rows={openOrders}
										rowKey="orderId"
										loading={openOrdersQuery.isLoading}
										emptyMessage="No open orders from OKX"
										maxHeight={500}
									/>
								</CardContent>
							</Card>
						</motion.div>
					)}

					{tabValue === 1 && (
						<motion.div
							key="order-history"
							initial={{ opacity: 0, x: -20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: 20 }}
							transition={{ duration: 0.15 }}
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
							<Box
								sx={{
									display: "grid",
									gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
									gap: 2,
								}}
							>
								{positions.length === 0 ? (
									<Card>
										<CardContent>
											<Typography color="text.secondary" align="center">
												No open positions
											</Typography>
										</CardContent>
									</Card>
								) : (
									positions.map((position) => (
										<PositionCard key={position.id} position={position} />
									))
								)}
							</Box>
						</motion.div>
					)}
				</AnimatePresence>
			</Box>
		</PageTransition>
	);
}
