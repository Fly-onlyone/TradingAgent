/**
 * Log Viewer Page (admin only)
 */

import BugReportIcon from "@mui/icons-material/BugReport";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControl,
	FormControlLabel,
	Grid2 as Grid,
	IconButton,
	InputAdornment,
	InputLabel,
	MenuItem,
	Paper,
	Switch,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { motion } from "framer-motion";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import {
	adminLogStatsQueryOptions,
	adminLogsQueryOptions,
} from "@/api/queryOptions/admin";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { useLogStore } from "@/store/logStore";
import type { LogEntry } from "@/types/log";
import { spring } from "@/utils/animations/variants";
import { requireAdmin } from "../-guards";

export const Route = createFileRoute("/admin/logs")({
	beforeLoad: requireAdmin,
	component: LogViewerPage,
});

const LEVEL_OPTIONS = ["", "INFO", "WARNING", "ERROR", "CRITICAL"];

const LEVEL_COLORS: Record<
	string,
	"success" | "warning" | "error" | "info" | "default"
> = {
	INFO: "info",
	WARNING: "warning",
	ERROR: "error",
	CRITICAL: "error",
	DEBUG: "default",
};

const LEVEL_ICONS: Record<string, ReactNode> = {
	INFO: <InfoOutlinedIcon fontSize="small" />,
	WARNING: <WarningAmberIcon fontSize="small" />,
	ERROR: <ErrorOutlineIcon fontSize="small" />,
	CRITICAL: <BugReportIcon fontSize="small" />,
};

function StatCard({
	label,
	value,
	color,
}: {
	label: string;
	value: number;
	color?: string;
}) {
	return (
		<Card variant="outlined">
			<CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
				<Typography variant="body2" color="text.secondary">
					{label}
				</Typography>
				<Typography
					variant="h5"
					fontWeight={700}
					color={color || "text.primary"}
				>
					{value.toLocaleString()}
				</Typography>
			</CardContent>
		</Card>
	);
}

function LogViewerPage() {
	const store = useLogStore();

	const logsQuery = useQuery({
		...adminLogsQueryOptions(store.filters),
		placeholderData: keepPreviousData,
		refetchInterval: store.autoRefresh ? 5000 : false,
	});

	const statsQuery = useQuery({
		...adminLogStatsQueryOptions(),
		refetchInterval: store.autoRefresh ? 10000 : false,
	});

	const handleSearch = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			store.setFilters({
				search: (event.target as HTMLInputElement).value,
				page: 1,
			});
		}
	};

	const handleLevelChange = (level: string) => {
		store.setFilters({ level: level || undefined, page: 1 });
	};

	const handleRowClick = (log: LogEntry) => {
		store.setSelectedLog(log);
	};

	const logs = logsQuery.data?.logs ?? [];
	const stats = statsQuery.data;

	return (
		<PageTransition pageKey="admin-logs">
			<Box>
				<SectionHeader
					title="Application Logs"
					subtitle="Real-time application logging and diagnostics"
					action={
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<FormControlLabel
								control={
									<Switch
										size="small"
										checked={store.autoRefresh}
										onChange={() => store.toggleAutoRefresh()}
									/>
								}
								label="Auto-refresh"
							/>
							<Tooltip title="Refresh">
								<IconButton
									onClick={() => {
										void logsQuery.refetch();
										void statsQuery.refetch();
									}}
									size="small"
								>
									<RefreshIcon />
								</IconButton>
							</Tooltip>
						</Box>
					}
				/>

				{logsQuery.error && (
					<Alert severity="error" sx={{ mb: 3 }}>
						Failed to load logs. You may not have admin privileges.
					</Alert>
				)}

				{/* Stats Cards */}
				<Grid container spacing={2} sx={{ mb: 3 }}>
					<Grid size={{ xs: 6, sm: 3 }}>
						<StatCard label="Total" value={stats?.totalCount ?? 0} />
					</Grid>
					<Grid size={{ xs: 6, sm: 3 }}>
						<StatCard
							label="Errors"
							value={stats?.levelCounts?.ERROR ?? 0}
							color="error.main"
						/>
					</Grid>
					<Grid size={{ xs: 6, sm: 3 }}>
						<StatCard
							label="Warnings"
							value={stats?.levelCounts?.WARNING ?? 0}
							color="warning.main"
						/>
					</Grid>
					<Grid size={{ xs: 6, sm: 3 }}>
						<StatCard
							label="Info"
							value={stats?.levelCounts?.INFO ?? 0}
							color="info.main"
						/>
					</Grid>
				</Grid>

				{/* Filters */}
				<motion.div
					initial={{ opacity: 0, x: -30 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ ...spring.snappy, delay: 0.15 }}
				>
					<Paper sx={{ p: 2, mb: 2 }}>
						<Box
							sx={{
								display: "flex",
								gap: 2,
								flexWrap: "wrap",
								alignItems: "center",
							}}
						>
							<FormControl size="small" sx={{ minWidth: 140 }}>
								<InputLabel>Level</InputLabel>
								<ZoomAwareSelect
									value={store.filters.level || ""}
									label="Level"
									onChange={(e) => handleLevelChange(e.target.value as string)}
								>
									<MenuItem value="">All Levels</MenuItem>
									{LEVEL_OPTIONS.filter(Boolean).map((level) => (
										<MenuItem key={level} value={level}>
											{level}
										</MenuItem>
									))}
								</ZoomAwareSelect>
							</FormControl>

							<TextField
								size="small"
								placeholder="Search messages..."
								defaultValue={store.filters.search || ""}
								onKeyDown={handleSearch}
								slotProps={{
									input: {
										startAdornment: (
											<InputAdornment position="start">
												<SearchIcon fontSize="small" />
											</InputAdornment>
										),
									},
								}}
								sx={{ minWidth: 250 }}
							/>

							<TextField
								size="small"
								placeholder="Module filter..."
								defaultValue={store.filters.module || ""}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										store.setFilters({
											module: (e.target as HTMLInputElement).value || undefined,
											page: 1,
										});
									}
								}}
								sx={{ minWidth: 200 }}
							/>

							{(store.filters.level ||
								store.filters.search ||
								store.filters.module) && (
								<Button size="small" onClick={() => store.resetFilters()}>
									Clear Filters
								</Button>
							)}
						</Box>
					</Paper>
				</motion.div>

				{/* Log Table */}
				<Paper>
					<TableContainer>
						<Table size="small">
							<TableHead>
								<TableRow>
									<TableCell width={160}>Timestamp</TableCell>
									<TableCell width={100}>Level</TableCell>
									<TableCell width={200}>Logger</TableCell>
									<TableCell>Message</TableCell>
									<TableCell width={100}>Request ID</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{logsQuery.isLoading
									? Array.from(
											{ length: 10 },
											(_, index) => `log-loading-row-${String(index)}`,
										).map((rowId) => (
											<TableRow key={rowId}>
												{Array.from(
													{ length: 5 },
													(_, index) =>
														`log-loading-cell-${rowId}-${String(index)}`,
												).map((cellId) => (
													<TableCell key={cellId}>
														<ShimmerSkeleton />
													</TableCell>
												))}
											</TableRow>
										))
									: logs.map((log) => (
											<TableRow
												key={log.id}
												hover
												sx={{ cursor: "pointer" }}
												onClick={() => handleRowClick(log)}
											>
												<TableCell>
													<Typography
														variant="body2"
														fontSize="0.75rem"
														fontFamily="monospace"
													>
														{format(new Date(log.timestamp), "MMM dd HH:mm:ss")}
													</Typography>
												</TableCell>
												<TableCell>
													<Chip
														icon={LEVEL_ICONS[log.level] as ReactElement}
														label={log.level}
														size="small"
														color={LEVEL_COLORS[log.level] || "default"}
														variant="outlined"
													/>
												</TableCell>
												<TableCell>
													<Typography
														variant="body2"
														fontSize="0.75rem"
														color="text.secondary"
														noWrap
														sx={{ maxWidth: 200 }}
													>
														{log.loggerName}
													</Typography>
												</TableCell>
												<TableCell>
													<Typography
														variant="body2"
														noWrap
														sx={{ maxWidth: 500 }}
													>
														{log.message}
													</Typography>
												</TableCell>
												<TableCell>
													{log.requestId && (
														<Typography
															variant="body2"
															fontSize="0.7rem"
															fontFamily="monospace"
															color="text.secondary"
														>
															{log.requestId.slice(0, 8)}
														</Typography>
													)}
												</TableCell>
											</TableRow>
										))}
							</TableBody>
						</Table>
					</TableContainer>

					{logsQuery.data && (
						<TablePagination
							component="div"
							count={logsQuery.data.total}
							page={(store.filters.page ?? 1) - 1}
							onPageChange={(_, newPage) => store.setPage(newPage + 1)}
							rowsPerPage={store.filters.pageSize ?? 50}
							onRowsPerPageChange={(e) => {
								store.setPageSize(parseInt(e.target.value, 10));
							}}
							rowsPerPageOptions={[25, 50, 100, 200]}
						/>
					)}
				</Paper>

				{/* Log Detail Dialog */}
				<Dialog
					open={!!store.selectedLog}
					onClose={() => store.setSelectedLog(null)}
					maxWidth="md"
					fullWidth
				>
					{store.selectedLog && (
						<>
							<DialogTitle
								sx={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
								}}
							>
								<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
									Log Detail
									<Chip
										label={store.selectedLog.level}
										size="small"
										color={LEVEL_COLORS[store.selectedLog.level] || "default"}
										variant="outlined"
									/>
								</Box>
								<IconButton
									size="small"
									onClick={() => store.setSelectedLog(null)}
								>
									<CloseIcon />
								</IconButton>
							</DialogTitle>
							<DialogContent dividers>
								<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
									<Grid container spacing={2}>
										<Grid size={{ xs: 6, sm: 4 }}>
											<Typography variant="caption" color="text.secondary">
												Timestamp
											</Typography>
											<Typography variant="body2" fontFamily="monospace">
												{format(
													new Date(store.selectedLog.timestamp),
													"yyyy-MM-dd HH:mm:ss.SSS",
												)}
											</Typography>
										</Grid>
										<Grid size={{ xs: 6, sm: 4 }}>
											<Typography variant="caption" color="text.secondary">
												Logger
											</Typography>
											<Typography variant="body2" fontFamily="monospace">
												{store.selectedLog.loggerName}
											</Typography>
										</Grid>
										<Grid size={{ xs: 6, sm: 4 }}>
											<Typography variant="caption" color="text.secondary">
												Location
											</Typography>
											<Typography variant="body2" fontFamily="monospace">
												{store.selectedLog.module}:{store.selectedLog.function}:
												{store.selectedLog.line}
											</Typography>
										</Grid>
										{store.selectedLog.requestId && (
											<Grid size={{ xs: 6, sm: 4 }}>
												<Typography variant="caption" color="text.secondary">
													Request ID
												</Typography>
												<Typography variant="body2" fontFamily="monospace">
													{store.selectedLog.requestId}
												</Typography>
											</Grid>
										)}
										{store.selectedLog.userId && (
											<Grid size={{ xs: 6, sm: 4 }}>
												<Typography variant="caption" color="text.secondary">
													User ID
												</Typography>
												<Typography variant="body2" fontFamily="monospace">
													{store.selectedLog.userId}
												</Typography>
											</Grid>
										)}
									</Grid>

									<Box>
										<Typography variant="caption" color="text.secondary">
											Message
										</Typography>
										<Box
											sx={{
												bgcolor: "background.default",
												p: 2,
												borderRadius: 1,
												mt: 0.5,
											}}
										>
											<Typography
												variant="body2"
												fontFamily="monospace"
												whiteSpace="pre-wrap"
											>
												{store.selectedLog.message}
											</Typography>
										</Box>
									</Box>

									{store.selectedLog.traceback && (
										<Box>
											<Typography variant="caption" color="error.main">
												Traceback
											</Typography>
											<Typography
												component="pre"
												variant="caption"
												sx={{
													p: 2,
													mt: 0.5,
													borderRadius: 1,
													backgroundColor: "rgba(0,0,0,0.3)",
													fontFamily: (theme) => theme.trading.mono,
													whiteSpace: "pre-wrap",
													wordBreak: "break-word",
													overflow: "auto",
													maxHeight: 300,
												}}
											>
												{store.selectedLog.traceback}
											</Typography>
										</Box>
									)}

									{store.selectedLog.extra && (
										<Box>
											<Typography variant="caption" color="text.secondary">
												Extra Data
											</Typography>
											<Box
												component="pre"
												sx={{
													bgcolor: "background.default",
													p: 2,
													borderRadius: 1,
													mt: 0.5,
													overflow: "auto",
													fontSize: "0.75rem",
													fontFamily: "monospace",
													maxHeight: 200,
												}}
											>
												{JSON.stringify(store.selectedLog.extra, null, 2)}
											</Box>
										</Box>
									)}
								</Box>
							</DialogContent>
							<DialogActions>
								<Button onClick={() => store.setSelectedLog(null)}>
									Close
								</Button>
							</DialogActions>
						</>
					)}
				</Dialog>
			</Box>
		</PageTransition>
	);
}
