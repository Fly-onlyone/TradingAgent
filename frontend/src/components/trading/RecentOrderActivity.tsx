/**
 * Recent OKX order activity table.
 */

import { motion } from "framer-motion";

import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { OkxOrder } from "@/types";
import { formatDateTime, formatPrice, formatSymbol } from "@/utils/formatters";

interface RecentOrderActivityProps {
	orders: OkxOrder[];
	isLoading?: boolean;
	error?: string | null;
	maxRows?: number;
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

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function getStatusBadge(status: string): {
	variant: BadgeVariant;
	className?: string;
} {
	if (status === "filled")
		return {
			variant: "outline",
			className:
				"border-[var(--trading-bullish)] text-[var(--trading-bullish)]",
		};
	if (status === "cancelled") return { variant: "secondary" };
	if (status === "partially_filled")
		return { variant: "outline", className: "border-yellow-500 text-yellow-500" };
	if (status === "open")
		return { variant: "outline", className: "border-blue-500 text-blue-500" };
	return { variant: "secondary" };
}

export function RecentOrderActivity({
	orders,
	isLoading = false,
	error,
	maxRows = 12,
}: RecentOrderActivityProps) {
	const rows = orders.slice(0, maxRows);

	return (
		<motion.div
			initial={{ opacity: 0, y: 30 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				type: "spring",
				stiffness: 380,
				damping: 30,
				delay: 0.2,
			}}
		>
			<Card>
				<CardContent>
					<h3 className="mb-3 text-lg font-semibold">
						Recent Order Activity
					</h3>

					{error ? (
						<p className="mb-2 text-sm text-yellow-500">{error}</p>
					) : null}

					{isLoading ? (
						<div>
							{[1, 2, 3, 4, 5].map((value) => (
								<ShimmerSkeleton
									key={`recent-orders-skeleton-${value}`}
									shimmerVariant="table-row"
								/>
							))}
						</div>
					) : rows.length > 0 ? (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Side</TableHead>
									<TableHead>Symbol</TableHead>
									<TableHead className="text-right">Quantity</TableHead>
									<TableHead className="text-right">Filled</TableHead>
									<TableHead className="text-right">Price</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Updated</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((order) => {
									const statusStyle = getStatusBadge(order.status);
									return (
										<TableRow key={order.orderId}>
											<TableCell>
												<Badge
													variant="outline"
													className={cn(
														order.side === "buy"
															? "border-[var(--trading-bullish)] text-[var(--trading-bullish)]"
															: "border-[var(--trading-bearish)] text-[var(--trading-bearish)]",
													)}
												>
													{order.side.toUpperCase()}
												</Badge>
											</TableCell>
											<TableCell>
												{formatSymbol(order.symbol)}
											</TableCell>
											<TableCell className="text-right">
												{formatNumeric(order.quantity)}
											</TableCell>
											<TableCell className="text-right">
												{formatNumeric(order.filledQuantity)}
											</TableCell>
											<TableCell className="text-right">
												{formatPriceValue(
													order.avgFillPrice ?? order.price,
												)}
											</TableCell>
											<TableCell>
												<Badge
													variant={statusStyle.variant}
													className={statusStyle.className}
												>
													{order.status}
												</Badge>
											</TableCell>
											<TableCell className="text-right">
												<span className="text-sm text-muted-foreground">
													{formatTimestamp(order.updatedAtMs)}
												</span>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					) : (
						<p className="text-sm text-muted-foreground">
							No recent OKX order activity.
						</p>
					)}
				</CardContent>
			</motion.div>
		</Card>
	);
}

export default RecentOrderActivity;
