/**
 * Log Viewer Page (admin only)
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
	AlertCircle,
	AlertTriangle,
	Bug,
	Info,
	RefreshCw,
	Search,
	X,
} from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import {
	adminLogsQueryOptions,
	adminLogStatsQueryOptions,
} from "@/api/queryOptions/admin";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLogStore } from "@/store/logStore";
import type { LogEntry } from "@/types/log";
import { spring } from "@/utils/animations/variants";
import { requireAdmin } from "../-guards";

export const Route = createFileRoute("/admin/logs")({
	beforeLoad: requireAdmin,
	component: LogViewerPage,
});

const LEVEL_OPTIONS = ["", "INFO", "WARNING", "ERROR", "CRITICAL"];

const LEVEL_BADGE_VARIANTS: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	INFO: "secondary",
	WARNING: "outline",
	ERROR: "destructive",
	CRITICAL: "destructive",
	DEBUG: "outline",
};

const LEVEL_ICONS: Record<string, ReactNode> = {
	INFO: <Info className="h-3.5 w-3.5" />,
	WARNING: <AlertTriangle className="h-3.5 w-3.5" />,
	ERROR: <AlertCircle className="h-3.5 w-3.5" />,
	CRITICAL: <Bug className="h-3.5 w-3.5" />,
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
		<div className="glass-card py-3 px-4 ring-1 ring-[var(--border-subtle)]">
			<p className="text-sm text-[var(--text-secondary)]">{label}</p>
			<p
				className="text-2xl font-bold"
				style={{ color: color || "var(--text-primary)" }}
			>
				{value.toLocaleString()}
			</p>
		</div>
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
	const totalLogs = logsQuery.data?.total ?? 0;
	const currentPage = store.filters.page ?? 1;
	const currentPageSize = store.filters.pageSize ?? 50;
	const totalPages = Math.ceil(totalLogs / currentPageSize);

	return (
		<PageTransition pageKey="admin-logs">
			<div>
				<SectionHeader
					title="Application Logs"
					subtitle="Real-time application logging and diagnostics"
					action={
						<div className="flex items-center gap-3">
							<div className="flex items-center gap-2">
								<Switch
									size="sm"
									checked={store.autoRefresh}
									onCheckedChange={() => store.toggleAutoRefresh()}
								/>
								<Label className="text-sm">Auto-refresh</Label>
							</div>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={() => {
												void logsQuery.refetch();
												void statsQuery.refetch();
											}}
										>
											<RefreshCw className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Refresh</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					}
				/>

				{logsQuery.error && (
					<Alert variant="destructive" className="mb-6">
						<AlertDescription>
							Failed to load logs. You may not have admin privileges.
						</AlertDescription>
					</Alert>
				)}

				{/* Stats Cards */}
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
					<StatCard label="Total" value={stats?.totalCount ?? 0} />
					<StatCard
						label="Errors"
						value={stats?.levelCounts?.ERROR ?? 0}
						color="var(--error)"
					/>
					<StatCard
						label="Warnings"
						value={stats?.levelCounts?.WARNING ?? 0}
						color="var(--warning)"
					/>
					<StatCard
						label="Info"
						value={stats?.levelCounts?.INFO ?? 0}
						color="var(--info)"
					/>
				</div>

				{/* Filters */}
				<motion.div
					initial={{ opacity: 0, x: -30 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ ...spring.snappy, delay: 0.15 }}
				>
					<div className="glass-card p-4 mb-4">
						<div className="flex gap-4 flex-wrap items-center">
							<Select
								value={store.filters.level || "all"}
								onValueChange={(val) =>
									handleLevelChange(val === "all" ? "" : val)
								}
							>
								<SelectTrigger className="min-w-[140px]">
									<SelectValue placeholder="All Levels" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Levels</SelectItem>
									{LEVEL_OPTIONS.filter(Boolean).map((level) => (
										<SelectItem key={level} value={level}>
											{level}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<div className="relative min-w-[250px]">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
								<Input
									placeholder="Search messages..."
									defaultValue={store.filters.search || ""}
									onKeyDown={handleSearch}
									className="pl-10"
								/>
							</div>

							<Input
								placeholder="Module filter..."
								defaultValue={store.filters.module || ""}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										store.setFilters({
											module:
												(e.target as HTMLInputElement).value ||
												undefined,
											page: 1,
										});
									}
								}}
								className="min-w-[200px]"
							/>

							{(store.filters.level ||
								store.filters.search ||
								store.filters.module) && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => store.resetFilters()}
								>
									Clear Filters
								</Button>
							)}
						</div>
					</div>
				</motion.div>

				{/* Log Table */}
				<div className="glass-card overflow-hidden">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[160px]">
									Timestamp
								</TableHead>
								<TableHead className="w-[100px]">Level</TableHead>
								<TableHead className="w-[200px]">Logger</TableHead>
								<TableHead>Message</TableHead>
								<TableHead className="w-[100px]">
									Request ID
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{logsQuery.isLoading
								? [...Array(10)].map((_, i) => (
										<TableRow key={i}>
											{[...Array(5)].map((_, j) => (
												<TableCell key={j}>
													<ShimmerSkeleton />
												</TableCell>
											))}
										</TableRow>
									))
								: logs.map((log) => (
										<TableRow
											key={log.id}
											className="cursor-pointer hover:bg-[var(--interactive-hover)]"
											onClick={() => handleRowClick(log)}
										>
											<TableCell>
												<span className="font-mono text-xs">
													{format(
														new Date(log.timestamp),
														"MMM dd HH:mm:ss",
													)}
												</span>
											</TableCell>
											<TableCell>
												<Badge
													variant={
														LEVEL_BADGE_VARIANTS[log.level] ||
														"outline"
													}
													className="gap-1"
												>
													{LEVEL_ICONS[log.level]}
													{log.level}
												</Badge>
											</TableCell>
											<TableCell>
												<span className="text-xs text-[var(--text-secondary)] truncate block max-w-[200px]">
													{log.loggerName}
												</span>
											</TableCell>
											<TableCell>
												<span className="text-sm truncate block max-w-[500px]">
													{log.message}
												</span>
											</TableCell>
											<TableCell>
												{log.requestId && (
													<span className="font-mono text-[0.7rem] text-[var(--text-secondary)]">
														{log.requestId.slice(0, 8)}
													</span>
												)}
											</TableCell>
										</TableRow>
									))}
						</TableBody>
					</Table>

					{/* Pagination */}
					{logsQuery.data && (
						<div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)]">
							<div className="flex items-center gap-2">
								<span className="text-sm text-[var(--text-secondary)]">
									Rows per page:
								</span>
								<select
									value={currentPageSize}
									onChange={(e) => {
										store.setPageSize(
											Number.parseInt(e.target.value, 10),
										);
									}}
									className="bg-transparent text-sm text-[var(--text-primary)] border border-[var(--border-subtle)] rounded px-2 py-1"
								>
									{[25, 50, 100, 200].map((opt) => (
										<option key={opt} value={opt}>
											{opt}
										</option>
									))}
								</select>
							</div>
							<div className="flex items-center gap-3">
								<span className="text-sm text-[var(--text-secondary)]">
									{(currentPage - 1) * currentPageSize + 1}–
									{Math.min(
										currentPage * currentPageSize,
										totalLogs,
									)}{" "}
									of {totalLogs}
								</span>
								<div className="flex gap-1">
									<Button
										variant="ghost"
										size="sm"
										disabled={currentPage <= 1}
										onClick={() =>
											store.setPage(currentPage - 1)
										}
									>
										Prev
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={currentPage >= totalPages}
										onClick={() =>
											store.setPage(currentPage + 1)
										}
									>
										Next
									</Button>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Log Detail Dialog */}
				<Dialog
					open={!!store.selectedLog}
					onOpenChange={(open) => {
						if (!open) store.setSelectedLog(null);
					}}
				>
					{store.selectedLog && (
						<DialogContent
							className="sm:max-w-2xl max-h-[85vh] flex flex-col"
							showCloseButton={false}
						>
							<DialogHeader>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<DialogTitle>Log Detail</DialogTitle>
										<Badge
											variant={
												LEVEL_BADGE_VARIANTS[
													store.selectedLog.level
												] || "outline"
											}
										>
											{store.selectedLog.level}
										</Badge>
									</div>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => store.setSelectedLog(null)}
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							</DialogHeader>

							<div className="flex-1 overflow-y-auto py-4 border-t border-[var(--border-subtle)] space-y-4">
								<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
									<div>
										<p className="text-xs text-[var(--text-secondary)]">
											Timestamp
										</p>
										<p className="text-sm font-mono">
											{format(
												new Date(
													store.selectedLog.timestamp,
												),
												"yyyy-MM-dd HH:mm:ss.SSS",
											)}
										</p>
									</div>
									<div>
										<p className="text-xs text-[var(--text-secondary)]">
											Logger
										</p>
										<p className="text-sm font-mono">
											{store.selectedLog.loggerName}
										</p>
									</div>
									<div>
										<p className="text-xs text-[var(--text-secondary)]">
											Location
										</p>
										<p className="text-sm font-mono">
											{store.selectedLog.module}:
											{store.selectedLog.function}:
											{store.selectedLog.line}
										</p>
									</div>
									{store.selectedLog.requestId && (
										<div>
											<p className="text-xs text-[var(--text-secondary)]">
												Request ID
											</p>
											<p className="text-sm font-mono">
												{store.selectedLog.requestId}
											</p>
										</div>
									)}
									{store.selectedLog.userId && (
										<div>
											<p className="text-xs text-[var(--text-secondary)]">
												User ID
											</p>
											<p className="text-sm font-mono">
												{store.selectedLog.userId}
											</p>
										</div>
									)}
								</div>

								<div>
									<p className="text-xs text-[var(--text-secondary)]">
										Message
									</p>
									<div className="bg-[var(--bg-default)] p-4 rounded-lg mt-1">
										<p className="text-sm font-mono whitespace-pre-wrap">
											{store.selectedLog.message}
										</p>
									</div>
								</div>

								{store.selectedLog.traceback && (
									<div>
										<p className="text-xs text-[var(--error)]">
											Traceback
										</p>
										<pre className="p-4 mt-1 rounded-lg bg-black/30 font-mono text-xs whitespace-pre-wrap break-words overflow-auto max-h-[300px]">
											{store.selectedLog.traceback}
										</pre>
									</div>
								)}

								{store.selectedLog.extra && (
									<div>
										<p className="text-xs text-[var(--text-secondary)]">
											Extra Data
										</p>
										<pre className="bg-[var(--bg-default)] p-4 rounded-lg mt-1 overflow-auto text-xs font-mono max-h-[200px]">
											{JSON.stringify(
												store.selectedLog.extra,
												null,
												2,
											)}
										</pre>
									</div>
								)}
							</div>

							<DialogFooter>
								<Button
									variant="outline"
									onClick={() => store.setSelectedLog(null)}
								>
									Close
								</Button>
							</DialogFooter>
						</DialogContent>
					)}
				</Dialog>
			</div>
		</PageTransition>
	);
}
