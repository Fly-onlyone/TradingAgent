/**
 * Recent OKX order activity table.
 */

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
} from "@mui/material";
import { motion } from "framer-motion";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import type { OkxOrder } from "@/types";
import { formatDateTime, formatPrice, formatSymbol } from "@/utils/formatters";

interface RecentOrderActivityProps {
	orders: OkxOrder[];
	isLoading?: boolean;
	error?: string | null;
	maxRows?: number;
	/** When true, skip the outer Card/CardContent wrapper (for embedding in a parent Card). */
	embedded?: boolean;
}

function formatNumeric(value: number | undefined, digits = 6): string {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return "-";
	}
	return value.toFixed(digits);
}

function formatPriceValue(value: number | undefined): string {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return "-";
	}
	return `$${formatPrice(value)}`;
}

function formatTimestamp(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) {
		return "-";
	}
	return formatDateTime(new Date(ms).toISOString());
}

function getStatusColor(
	status: string,
): "default" | "success" | "error" | "warning" | "info" {
	if (status === "filled") return "success";
	if (status === "cancelled") return "default";
	if (status === "partially_filled") return "warning";
	if (status === "open") return "info";
	return "default";
}

export function RecentOrderActivity({
	orders,
	isLoading = false,
	error,
	maxRows = 12,
	embedded = false,
}: RecentOrderActivityProps) {
	const rows = orders.slice(0, maxRows);

	const content = (
		<>
			{!embedded && (
				<Typography variant="h6" gutterBottom>
					Recent Order Activity
				</Typography>
			)}

			{error ? (
				<Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
					{error}
				</Typography>
			) : null}

			{isLoading ? (
				<Box>
					{[1, 2, 3, 4, 5].map((value) => (
						<ShimmerSkeleton
							key={`recent-orders-skeleton-${value}`}
							shimmerVariant="table-row"
						/>
					))}
				</Box>
			) : rows.length > 0 ? (
				<TableContainer>
					<Table size="small">
						<TableHead>
							<TableRow>
								<TableCell>Side</TableCell>
								<TableCell>Symbol</TableCell>
								<TableCell align="right">Quantity</TableCell>
								<TableCell align="right">Filled</TableCell>
								<TableCell align="right">Price</TableCell>
								<TableCell>Status</TableCell>
								<TableCell align="right">Updated</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((order) => (
								<TableRow key={order.orderId} hover>
									<TableCell>
										<Chip
											label={order.side.toUpperCase()}
											size="small"
											color={order.side === "buy" ? "success" : "error"}
											variant="outlined"
										/>
									</TableCell>
									<TableCell>{formatSymbol(order.symbol)}</TableCell>
									<TableCell align="right">
										{formatNumeric(order.quantity)}
									</TableCell>
									<TableCell align="right">
										{formatNumeric(order.filledQuantity)}
									</TableCell>
									<TableCell align="right">
										{formatPriceValue(order.avgFillPrice ?? order.price)}
									</TableCell>
									<TableCell>
										<Chip
											label={order.status}
											size="small"
											color={getStatusColor(order.status)}
											variant="outlined"
										/>
									</TableCell>
									<TableCell align="right">
										<Typography variant="body2" color="text.secondary">
											{formatTimestamp(order.updatedAtMs)}
										</Typography>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>
			) : (
				<Typography variant="body2" color="text.secondary">
					No recent OKX order activity.
				</Typography>
			)}
		</>
	);

	if (embedded) {
		return content;
	}

	return (
		<Card
			component={motion.div}
			initial={{ opacity: 0, y: 30 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 380, damping: 30, delay: 0.2 }}
		>
			<CardContent>{content}</CardContent>
		</Card>
	);
}

export default RecentOrderActivity;
