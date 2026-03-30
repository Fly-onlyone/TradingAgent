/**
 * Trade Table Component
 * Displays trades in a sortable table format
 */

import {
	Box,
	Chip,
	Paper,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	TableSortLabel,
	Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
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

function formatPrice(price: number | undefined): string {
	if (price === undefined || price === null) return "-";
	return price.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 6,
	});
}

function formatPnL(pnl: number | undefined): { text: string; color: string } {
	if (pnl === undefined || pnl === null)
		return { text: "-", color: "text.secondary" };
	const prefix = pnl >= 0 ? "+" : "";
	return {
		text: `${prefix}$${Math.abs(pnl).toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})}`,
		color: pnl >= 0 ? "success.main" : "error.main",
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

			// Handle date sorting
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

	const handleChangePage = (_: unknown, newPage: number) => {
		onPageChange(newPage + 1);
	};

	const handleChangeRowsPerPage = (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		onPageSizeChange(parseInt(event.target.value, 10));
	};

	if (isLoading) {
		return (
			<Paper>
				<TableContainer>
					<Table>
						<TableHead>
							<TableRow>
								{columns.map((col) => (
									<TableCell key={col.id} align={col.align}>
										{col.label}
									</TableCell>
								))}
							</TableRow>
						</TableHead>
						<TableBody>
							{Array.from(
								{ length: 5 },
								(_, index) => `trade-loading-row-${String(index)}`,
							).map((rowId) => (
								<TableRow key={rowId}>
									{columns.map((col) => (
										<TableCell key={col.id}>
											<Skeleton />
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>
			</Paper>
		);
	}

	if (trades.length === 0) {
		return (
			<Paper sx={{ p: 4, textAlign: "center" }}>
				<Typography color="text.secondary">No trades found</Typography>
			</Paper>
		);
	}

	return (
		<Paper>
			<TableContainer>
				<Table>
					<TableHead>
						<TableRow>
							{columns.map((col) => (
								<TableCell key={col.id} align={col.align}>
									{col.sortable ? (
										<TableSortLabel
											active={sortField === col.id}
											direction={sortField === col.id ? sortDirection : "asc"}
											onClick={() => handleSort(col.id)}
										>
											{col.label}
										</TableSortLabel>
									) : (
										col.label
									)}
								</TableCell>
							))}
						</TableRow>
					</TableHead>
					<TableBody>
						{sortedTrades.map((trade) => {
							const pnl = formatPnL(trade.realizedPnl);
							return (
								<TableRow key={trade.id} hover>
									<TableCell>
										<Typography variant="body2" fontWeight={600}>
											{trade.symbol}
										</Typography>
									</TableCell>
									<TableCell align="center">
										<Chip
											label={trade.side.toUpperCase()}
											size="small"
											color={trade.side === "buy" ? "success" : "error"}
											variant="outlined"
										/>
									</TableCell>
									<TableCell align="right">
										{formatPrice(trade.entryPrice)}
									</TableCell>
									<TableCell align="right">
										{formatPrice(trade.exitPrice)}
									</TableCell>
									<TableCell align="right">
										{trade.quantity.toFixed(4)}
									</TableCell>
									<TableCell align="right">
										<Box>
											<Typography
												variant="body2"
												fontWeight={600}
												sx={{ color: pnl.color }}
											>
												{pnl.text}
											</Typography>
											{trade.realizedPnlPercent !== undefined && (
												<Typography variant="caption" sx={{ color: pnl.color }}>
													{formatPnLPercent(trade.realizedPnlPercent)}
												</Typography>
											)}
										</Box>
									</TableCell>
									<TableCell align="right">
										<Typography variant="body2" color="text.secondary">
											{formatDate(trade.entryTime)}
										</Typography>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</TableContainer>
			<TablePagination
				component="div"
				count={total}
				page={page - 1}
				onPageChange={handleChangePage}
				rowsPerPage={pageSize}
				onRowsPerPageChange={handleChangeRowsPerPage}
				rowsPerPageOptions={[10, 20, 50, 100]}
			/>
		</Paper>
	);
}

export default TradeTable;
