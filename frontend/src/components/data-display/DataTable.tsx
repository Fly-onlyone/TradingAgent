/**
 * Data Table Component
 */

import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/common/EmptyState";
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

export interface Column<T> {
	id: keyof T | string;
	label: string;
	minWidth?: number;
	align?: "left" | "center" | "right";
	sortable?: boolean;
	render?: (row: T) => ReactNode;
	format?: (value: unknown) => string;
}

interface DataTableProps<T> {
	columns: Column<T>[];
	rows: T[];
	loading?: boolean;
	emptyMessage?: string;
	rowKey: keyof T;
	pagination?: boolean;
	defaultRowsPerPage?: number;
	rowsPerPageOptions?: number[];
	onRowClick?: (row: T) => void;
	stickyHeader?: boolean;
	maxHeight?: number | string;
}

type SortDirection = "asc" | "desc";

const alignClass = {
	left: "text-left",
	center: "text-center",
	right: "text-right",
} as const;

export function DataTable<T extends object>({
	columns,
	rows,
	loading = false,
	emptyMessage = "No data available",
	rowKey,
	pagination = true,
	defaultRowsPerPage = 10,
	rowsPerPageOptions = [5, 10, 25, 50],
	onRowClick,
	stickyHeader = true,
	maxHeight = "auto",
}: DataTableProps<T>) {
	const [page, setPage] = useState(0);
	const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
	const [sortBy, setSortBy] = useState<string | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	const handleSort = (columnId: string) => {
		const isAsc = sortBy === columnId && sortDirection === "asc";
		setSortDirection(isAsc ? "desc" : "asc");
		setSortBy(columnId);
	};

	const sortedRows = useMemo(() => {
		if (!sortBy) return rows;

		return [...rows].sort((a, b) => {
			const aVal = (a as Record<string, unknown>)[sortBy];
			const bVal = (b as Record<string, unknown>)[sortBy];

			if (aVal === null || aVal === undefined) return 1;
			if (bVal === null || bVal === undefined) return -1;

			let comparison = 0;
			if (typeof aVal === "string" && typeof bVal === "string") {
				comparison = aVal.localeCompare(bVal);
			} else if (typeof aVal === "number" && typeof bVal === "number") {
				comparison = aVal - bVal;
			}

			return sortDirection === "desc" ? -comparison : comparison;
		});
	}, [rows, sortBy, sortDirection]);

	const paginatedRows = pagination
		? sortedRows.slice(
				page * rowsPerPage,
				page * rowsPerPage + rowsPerPage,
			)
		: sortedRows;

	const totalPages = Math.ceil(rows.length / rowsPerPage);
	const startItem = page * rowsPerPage + 1;
	const endItem = Math.min((page + 1) * rowsPerPage, rows.length);

	if (!loading && rows.length === 0) {
		return <EmptyState title={emptyMessage} />;
	}

	return (
		<div className="w-full overflow-hidden rounded-lg border border-border bg-card">
			<div
				className={cn("overflow-auto", stickyHeader && "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-card")}
				style={{ maxHeight }}
			>
				<Table>
					<TableHeader>
						<TableRow>
							{columns.map((column) => (
								<TableHead
									key={String(column.id)}
									className={cn(
										alignClass[column.align || "left"],
									)}
									style={{
										minWidth: column.minWidth,
									}}
								>
									{column.sortable !== false ? (
										<button
											type="button"
											className="inline-flex items-center gap-1 font-medium hover:text-foreground"
											onClick={() =>
												handleSort(String(column.id))
											}
										>
											{column.label}
											<ArrowUpDown
												className={cn(
													"size-3.5",
													sortBy === column.id
														? "text-foreground"
														: "text-muted-foreground",
												)}
											/>
										</button>
									) : (
										column.label
									)}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading
							? Array.from({ length: 5 }).map((_, index) => (
									<TableRow key={`skeleton-${String(index)}`}>
										{columns.map((column) => (
											<TableCell
												key={String(column.id)}
											>
												<Skeleton className="h-4 w-full" />
											</TableCell>
										))}
									</TableRow>
								))
							: paginatedRows.map((row) => (
									<TableRow
										key={String(row[rowKey])}
										className={cn(
											onRowClick && "cursor-pointer",
										)}
										onClick={
											onRowClick
												? () => onRowClick(row)
												: undefined
										}
									>
										{columns.map((column) => {
											const value =
												row[column.id as keyof T];
											return (
												<TableCell
													key={String(column.id)}
													className={cn(
														alignClass[
															column.align ||
																"left"
														],
													)}
												>
													{column.render
														? column.render(row)
														: column.format
															? column.format(
																	value,
																)
															: String(
																	value ?? "-",
																)}
												</TableCell>
											);
										})}
									</TableRow>
								))}
					</TableBody>
				</Table>
			</div>
			{pagination && (
				<div className="flex items-center justify-between border-t border-border px-4 py-2">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<span>Rows per page</span>
						<Select
							value={rowsPerPage}
							onValueChange={(val) => {
								setRowsPerPage(val as number);
								setPage(0);
							}}
						>
							<SelectTrigger size="sm" className="w-16">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{rowsPerPageOptions.map((opt) => (
									<SelectItem key={opt} value={opt}>
										{opt}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<span>
							{startItem}-{endItem} of {rows.length}
						</span>
						<Button
							variant="ghost"
							size="icon-xs"
							disabled={page === 0}
							onClick={() => setPage((p) => p - 1)}
						>
							<ChevronLeft />
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							disabled={page >= totalPages - 1}
							onClick={() => setPage((p) => p + 1)}
						>
							<ChevronRight />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

export default DataTable;
