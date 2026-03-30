/**
 * Open Positions Section
 * Displays live open orders fetched from OKX via polling, shown at the top of the Trades page.
 */

import ShowChartIcon from "@mui/icons-material/ShowChart";
import {
	Box,
	Card,
	CardContent,
	Chip,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Typography,
	useTheme,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ordersApi } from "@/api/endpoints/orders";
import { EmptyState } from "@/components/common/EmptyState";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import type { OkxOrder } from "@/types";
import { useReducedMotion } from "@/utils/animations/hooks";
import { staggerCascade } from "@/utils/animations/variants";
import { formatPrice } from "@/utils/formatters";

function formatTimestamp(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) {
		return "-";
	}
	return new Date(ms).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function OrderRow({ order }: { order: OkxOrder }) {
	const theme = useTheme();
	const isBuy = order.side === "buy";

	return (
		<TableRow
			component={motion.tr}
			variants={staggerCascade.item}
			sx={{
				"&:last-child td, &:last-child th": { border: 0 },
			}}
		>
			<TableCell>
				<Typography
					variant="body2"
					fontWeight={600}
					sx={{ fontFamily: theme.trading.mono }}
				>
					{order.symbol}
				</Typography>
			</TableCell>
			<TableCell>
				<Chip
					label={order.side.toUpperCase()}
					size="small"
					color={isBuy ? "success" : "error"}
				/>
			</TableCell>
			<TableCell>
				<Chip
					label={order.orderType.toUpperCase()}
					size="small"
					variant="outlined"
				/>
			</TableCell>
			<TableCell align="right">
				<Typography variant="body2" sx={{ fontFamily: theme.trading.mono }}>
					{order.quantity.toFixed(6)}
				</Typography>
			</TableCell>
			<TableCell align="right">
				<Typography variant="body2" sx={{ fontFamily: theme.trading.mono }}>
					{order.filledQuantity.toFixed(6)}
				</Typography>
			</TableCell>
			<TableCell align="right">
				<Typography variant="body2" sx={{ fontFamily: theme.trading.mono }}>
					{order.price !== undefined ? `$${formatPrice(order.price)}` : "-"}
				</Typography>
			</TableCell>
			<TableCell>
				<Chip
					label={order.status}
					size="small"
					color="info"
					variant="outlined"
				/>
			</TableCell>
			<TableCell>
				<Typography variant="body2" color="text.secondary">
					{formatTimestamp(order.createdAtMs)}
				</Typography>
			</TableCell>
		</TableRow>
	);
}

function LoadingSkeleton() {
	return (
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Box sx={{ mb: 2 }}>
					<ShimmerSkeleton
						variant="text"
						width={200}
						sx={{ fontSize: "1.25rem" }}
					/>
				</Box>
				{[0, 1, 2].map((i) => (
					<ShimmerSkeleton key={i} shimmerVariant="table-row" />
				))}
			</CardContent>
		</Card>
	);
}

export function OpenPositionsSection() {
	const theme = useTheme();
	const reducedMotion = useReducedMotion();

	const openOrdersQuery = useQuery({
		queryKey: ["trades-page", "okx", "open-orders"],
		queryFn: () => ordersApi.getOkxOpenOrders({ limit: 50 }),
		refetchInterval: 15_000,
		retry: 1,
	});

	const orders = openOrdersQuery.data?.orders ?? [];
	const apiError = openOrdersQuery.data?.error;

	if (openOrdersQuery.isLoading) {
		return <LoadingSkeleton />;
	}

	return (
		<motion.div
			variants={staggerCascade.container}
			initial={reducedMotion ? "visible" : "hidden"}
			animate="visible"
		>
			<Card sx={{ mb: 3 }}>
				<CardContent>
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							mb: 2,
						}}
					>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<Box
								sx={{
									p: 0.75,
									borderRadius: 1.5,
									bgcolor: `rgba(${theme.trading.primaryRgb}, 0.15)`,
									color: theme.palette.primary.main,
									display: "flex",
									alignItems: "center",
								}}
							>
								<ShowChartIcon fontSize="small" />
							</Box>
							<Typography variant="h6" fontWeight={600}>
								Open Positions
							</Typography>
							{orders.length > 0 && (
								<Chip
									label={orders.length}
									size="small"
									color="primary"
									variant="outlined"
								/>
							)}
						</Box>
						{openOrdersQuery.dataUpdatedAt > 0 && (
							<Typography variant="caption" color="text.secondary">
								Updated {formatTimestamp(openOrdersQuery.dataUpdatedAt)}
							</Typography>
						)}
					</Box>

					{apiError && (
						<Typography variant="body2" color="warning.main" sx={{ mb: 2 }}>
							{apiError}
						</Typography>
					)}

					{orders.length === 0 ? (
						<EmptyState
							icon={<ShowChartIcon />}
							title="No open positions"
							description="No live orders on OKX right now"
							sx={{ py: 4 }}
						/>
					) : (
						<TableContainer>
							<Table size="small">
								<TableHead>
									<TableRow>
										<TableCell>Symbol</TableCell>
										<TableCell>Side</TableCell>
										<TableCell>Type</TableCell>
										<TableCell align="right">Quantity</TableCell>
										<TableCell align="right">Filled</TableCell>
										<TableCell align="right">Price</TableCell>
										<TableCell>Status</TableCell>
										<TableCell>Created</TableCell>
									</TableRow>
								</TableHead>
								<TableBody
									component={motion.tbody}
									variants={staggerCascade.container}
									initial={reducedMotion ? "visible" : "hidden"}
									animate="visible"
								>
									{orders.map((order) => (
										<OrderRow key={order.orderId} order={order} />
									))}
								</TableBody>
							</Table>
						</TableContainer>
					)}
				</CardContent>
			</Card>
		</motion.div>
	);
}

export default OpenPositionsSection;
