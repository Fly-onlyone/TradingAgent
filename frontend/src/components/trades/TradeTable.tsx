/**
 * Trade Table Component
 * Displays trades in a sortable table format
 */

import { ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { TradeWithPnL } from "@/types";

interface TradeTableProps {
	trades: TradeWithPnL[];
	total: number;
	page: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
	isLoading?: boolean;
}

type SortDirection = "asc" | "desc";
type SortField =
	| "symbol"
	| "side"
	| "entryPrice"
	| "exitPrice"
	| "quantity"
	| "realizedPnl"
	| "entryTime";

interface Column {
	id: SortField;
	label: string;
	align?: "left" | "right" | "center";
	sortable?: boolean;
}

const columns: Column[] = [
	{ id: "symbol", label: "Symbol", align: "left", sortable: true },
	{ id: "side", label: "Side", align: "center", sortable: true },
	{ id: "entryPrice", label: "Entry", align: "right", sortable: true },
	{ id: "exitPrice", label: "Exit", align: "right", sortable: true },
	{ id: "quantity", label: "Quantity", align: "right", sortable: true },
	{ id: "realizedPnl", label: "P&L", align: "right", sortable: true },
	{ id: "entryTime", label: "Date", align: "right", sortable: true },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function formatPrice(price: number | undefined): string {
	if (price === undefined || price === null) return "-";
	return price.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 6,
	});
}

function formatPnL(pnl: number | undefined): { text: string; color: string } {
	if (pnl === undefined || pnl === null)
		return { text: "-", color: "text-muted-foreground" };
	const prefix = pnl >= 0 ? "+" : "";
	return {
		text: `${prefix}$${Math.abs(pnl).toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})}`,
		color: pnl >= 0 ? "text-success" : "text-destructive",
	};
}

function formatPnLPercent(pnlPercent: number | undefined): string {
	if (pnlPercent === undefined || pnlPercent === null) return "";
	const prefix = pnlPercent >= 0 ? "+" : "";
	return `${prefix}${pnlPercent.toFixed(2)}%`;
}

function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "2-digit",
	});
}

const alignClass = {
	left: "text-left",
	right: "text-right",
	center: "text-center",
} as const;

export function TradeTable({
	trades,
	total,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
	isLoading,
}: TradeTableProps) {
	const [sortField, setSortField] = useState<SortField>("entryTime");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

	const sortedTrades = useMemo(() => {
		return [...trades].sort((a, b) => {
			let aVal: number | string = a[sortField] ?? "";
			let bVal: number | string = b[sortField] ?? "";

			if (sortField === "entryTime") {
				aVal = new Date(aVal as string).getTime();
				bVal = new Date(bVal as string).getTime();
			}

			if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
			if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
			return 0;
		});
	}, [trades, sortField, sortDirection]);

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc");
		} else {
			setSortField(field);
			setSortDirection("desc");
		}
	};

	const totalPages = Math.ceil(total / pageSize);
	const startItem = (page - 1) * pageSize + 1;
	const endItem = Math.min(page * pageSize, total);

	if (isLoading) {
		return (
			<div className="rounded-xl border bg-card ring-1 ring-foreground/10">
				<Table>
					<TableHeader>
						<TableRow>
							{columns.map((col) => (
								<TableHead
									key={col.id}
									className={alignClass[col.align ?? "left"]}
								>
									{col.label}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{[...Array(5)].map((_, i) => (
							<TableRow key={i}>
								{columns.map((col) => (
									<TableCell key={col.id}>
										<Skeleton className="h-4 w-full" />
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		);
	}

	if (trades.length === 0) {
		return (
			<div className="rounded-xl border bg-card p-8 text-center ring-1 ring-foreground/10">
				<span className="text-sm text-muted-foreground">
					No trades found
				</span>
			</div>
		);
	}

	return (
		<div className="rounded-xl border bg-card ring-1 ring-foreground/10">
			<Table>
				<TableHeader>
					<TableRow>
						{columns.map((col) => (
							<TableHead
								key={col.id}
								className={alignClass[col.align ?? "left"]}
							>
								{col.sortable ? (
									<button
										type="button"
										className={cn(
											"inline-flex items-center gap-1 font-medium hover:text-foreground",
											sortField === col.id &&
												"text-foreground",
										)}
										onClick={() => handleSort(col.id)}
									>
										{col.label}
										<ArrowUpDown
											className={cn(
												"size-3.5 text-muted-foreground",
												sortField === col.id &&
													"text-foreground",
												sortField === col.id &&
													sortDirection === "asc" &&
													"rotate-180",
											)}
										/>
									</button>
								) : (
									col.label
								)}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{sortedTrades.map((trade) => {
						const pnl = formatPnL(trade.realizedPnl);
						return (
							<TableRow key={trade.id}>
								<TableCell>
									<span className="text-sm font-semibold">
										{trade.symbol}
									</span>
								</TableCell>
								<TableCell className="text-center">
									<Badge
										variant={
											trade.side === "buy"
												? "default"
												: "destructive"
										}
										className={
											trade.side === "buy"
												? "bg-success/10 text-success"
												: ""
										}
									>
										{trade.side.toUpperCase()}
									</Badge>
								</TableCell>
								<TableCell className="text-right">
									{formatPrice(trade.entryPrice)}
								</TableCell>
								<TableCell className="text-right">
									{formatPrice(trade.exitPrice)}
								</TableCell>
								<TableCell className="text-right">
									{trade.quantity.toFixed(4)}
								</TableCell>
								<TableCell className="text-right">
									<div>
										<span
											className={cn(
												"text-sm font-semibold",
												pnl.color,
											)}
										>
											{pnl.text}
										</span>
										{trade.realizedPnlPercent !==
											undefined && (
											<span
												className={cn(
													"block text-xs",
													pnl.color,
												)}
											>
												{formatPnLPercent(
													trade.realizedPnlPercent,
												)}
											</span>
										)}
									</div>
								</TableCell>
								<TableCell className="text-right">
									<span className="text-sm text-muted-foreground">
										{formatDate(trade.entryTime)}
									</span>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>

			{/* Pagination */}
			<div className="flex items-center justify-between border-t px-4 py-2">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<span>Rows per page:</span>
					<Select
						value={pageSize}
						onValueChange={(val) => onPageSizeChange(val as number)}
					>
						<SelectTrigger size="sm" className="w-16">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PAGE_SIZE_OPTIONS.map((size) => (
								<SelectItem key={size} value={size}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">
						{startItem}-{endItem} of {total}
					</span>
					<div className="flex gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							disabled={page <= 1}
							onClick={() => onPageChange(page - 1)}
						>
							<span className="sr-only">Previous page</span>
							&lsaquo;
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							disabled={page >= totalPages}
							onClick={() => onPageChange(page + 1)}
						>
							<span className="sr-only">Next page</span>
							&rsaquo;
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default TradeTable;
