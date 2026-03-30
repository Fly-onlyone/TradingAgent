/**
 * Data Table Component
 */

import {
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
} from "@mui/material";
import { type ReactNode, useMemo, useState } from "react";
import { EmptyState } from "../common/EmptyState";

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

	const handleChangePage = (_: unknown, newPage: number) => {
		setPage(newPage);
	};

	const handleChangeRowsPerPage = (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		setRowsPerPage(parseInt(event.target.value, 10));
		setPage(0);
	};

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
		? sortedRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
		: sortedRows;

	if (!loading && rows.length === 0) {
		return <EmptyState title={emptyMessage} />;
	}

	return (
		<Paper sx={{ width: "100%", overflow: "hidden" }}>
			<TableContainer sx={{ maxHeight }}>
				<Table stickyHeader={stickyHeader} size="small">
					<TableHead>
						<TableRow>
							{columns.map((column) => (
								<TableCell
									key={String(column.id)}
									align={column.align || "left"}
									style={{ minWidth: column.minWidth }}
								>
									{column.sortable !== false ? (
										<TableSortLabel
											active={sortBy === column.id}
											direction={sortBy === column.id ? sortDirection : "asc"}
											onClick={() => handleSort(String(column.id))}
										>
											{column.label}
										</TableSortLabel>
									) : (
										column.label
									)}
								</TableCell>
							))}
						</TableRow>
					</TableHead>
					<TableBody>
						{loading
							? Array.from(
									{ length: 5 },
									(_, index) => `loading-row-${String(index)}`,
								).map((rowId) => (
									<TableRow key={rowId}>
										{columns.map((column) => (
											<TableCell key={String(column.id)}>
												<Skeleton variant="text" />
											</TableCell>
										))}
									</TableRow>
								))
							: paginatedRows.map((row) => (
									<TableRow
										key={String(row[rowKey])}
										hover
										onClick={onRowClick ? () => onRowClick(row) : undefined}
										sx={{
											cursor: onRowClick ? "pointer" : "default",
										}}
									>
										{columns.map((column) => {
											const value = row[column.id as keyof T];
											return (
												<TableCell
													key={String(column.id)}
													align={column.align || "left"}
												>
													{column.render
														? column.render(row)
														: column.format
															? column.format(value)
															: String(value ?? "-")}
												</TableCell>
											);
										})}
									</TableRow>
								))}
					</TableBody>
				</Table>
			</TableContainer>
			{pagination && (
				<TablePagination
					rowsPerPageOptions={rowsPerPageOptions}
					component="div"
					count={rows.length}
					rowsPerPage={rowsPerPage}
					page={page}
					onPageChange={handleChangePage}
					onRowsPerPageChange={handleChangeRowsPerPage}
				/>
			)}
		</Paper>
	);
}

export default DataTable;
