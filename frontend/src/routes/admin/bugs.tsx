/**
 * Bug Tracker Page (admin only)
 */

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Checkbox,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Grid2 as Grid,
	IconButton,
	InputAdornment,
	MenuItem,
	Paper,
	Skeleton,
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
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { format } from "date-fns";
import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import { bugsApi } from "@/api/endpoints/bugs";
import {
	adminBugStatsQueryOptions,
	adminBugsQueryOptions,
} from "@/api/queryOptions/admin";
import { PageTransition } from "@/components/common/PageTransition";
import { useAuthStore } from "@/store/authStore";
import { useBugStore } from "@/store/bugStore";
import type { BugCreateRequest, BugEntry, BugUpdateRequest } from "@/types/bug";

export const Route = createFileRoute("/admin/bugs")({
	component: BugTrackerPage,
});

const SEVERITY_OPTIONS = ["", "low", "medium", "high", "critical"];
const STATUS_OPTIONS = ["", "open", "in_progress", "resolved"];

const SEVERITY_COLORS: Record<
	string,
	"default" | "info" | "warning" | "error"
> = {
	low: "default",
	medium: "info",
	high: "warning",
	critical: "error",
};

const STATUS_COLORS: Record<string, "error" | "warning" | "success"> = {
	open: "error",
	in_progress: "warning",
	resolved: "success",
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

const emptyForm: BugCreateRequest = {
	title: "",
	description: "",
	severity: "medium",
	status: "open",
	category: "",
};

function BugTrackerPage() {
	const { user } = useAuthStore();
	const store = useBugStore();
	const queryClient = useQueryClient();

	const [formData, setFormData] = useState<BugCreateRequest>(emptyForm);
	const [deleteTarget, setDeleteTarget] = useState<BugEntry | null>(null);

	const bugsQuery = useQuery({
		...adminBugsQueryOptions(store.filters),
		placeholderData: keepPreviousData,
	});

	const statsQuery = useQuery(adminBugStatsQueryOptions());

	useEffect(() => {
		if (bugsQuery.data) {
			store.setBugs(bugsQuery.data.bugs, bugsQuery.data.total);
		}
	}, [bugsQuery.data, store.setBugs]);

	useEffect(() => {
		if (statsQuery.data) {
			store.setStats(statsQuery.data);
		}
	}, [statsQuery.data, store.setStats]);

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: ["admin-bugs"] });
		void queryClient.invalidateQueries({ queryKey: ["admin-bugs-stats"] });
	};

	const createMutation = useMutation({
		mutationFn: (data: BugCreateRequest) => bugsApi.createBug(data),
		onSuccess: () => {
			store.setAddDialogOpen(false);
			setFormData(emptyForm);
			invalidate();
		},
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: BugUpdateRequest }) =>
			bugsApi.updateBug(id, data),
		onSuccess: () => {
			store.setSelectedBug(null);
			invalidate();
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => bugsApi.deleteBug(id),
		onSuccess: () => {
			setDeleteTarget(null);
			invalidate();
		},
	});

	if (!user?.isSuperuser && !import.meta.env.DEV) {
		return <Navigate to="/" />;
	}

	const handleCheckboxToggle = (bug: BugEntry) => {
		const newStatus = bug.status === "resolved" ? "open" : "resolved";
		updateMutation.mutate({ id: bug.id, data: { status: newStatus } });
	};

	const handleOpenEdit = (bug: BugEntry) => {
		setFormData({
			title: bug.title,
			description: bug.description || "",
			severity: bug.severity,
			status: bug.status,
			category: bug.category || "",
		});
		store.setSelectedBug(bug);
	};

	const handleSaveEdit = () => {
		if (!store.selectedBug) return;
		updateMutation.mutate({
			id: store.selectedBug.id,
			data: {
				title: formData.title,
				description: formData.description || undefined,
				severity: formData.severity,
				status: formData.status,
				category: formData.category || undefined,
			},
		});
	};

	const handleOpenAdd = () => {
		setFormData(emptyForm);
		store.setAddDialogOpen(true);
	};

	const handleSaveAdd = () => {
		createMutation.mutate({
			title: formData.title,
			description: formData.description || undefined,
			severity: formData.severity,
			status: formData.status,
			category: formData.category || undefined,
		});
	};

	const handleSearch = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			store.setFilters({
				search: (event.target as HTMLInputElement).value || undefined,
				page: 1,
			});
		}
	};

	const stats = store.stats;
	const isDialogOpen = store.isAddDialogOpen || !!store.selectedBug;
	const isEditing = !!store.selectedBug;

	return (
		<PageTransition pageKey="admin-bugs">
			<Box>
				{/* Header */}
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						mb: 3,
					}}
				>
					<Typography variant="h4" fontWeight={700}>
						Bug Tracker
					</Typography>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
						<Tooltip title="Refresh">
							<IconButton
								onClick={() => {
									void bugsQuery.refetch();
									void statsQuery.refetch();
								}}
								size="small"
							>
								<RefreshIcon />
							</IconButton>
						</Tooltip>
						<Button
							variant="contained"
							startIcon={<AddIcon />}
							onClick={handleOpenAdd}
						>
							Add Bug
						</Button>
					</Box>
				</Box>

				{bugsQuery.error && (
					<Alert severity="error" sx={{ mb: 3 }}>
						Failed to load bugs. You may not have admin privileges.
					</Alert>
				)}

				{/* Stats Cards */}
				<Grid container spacing={2} sx={{ mb: 3 }}>
					<Grid size={{ xs: 6, sm: 3 }}>
						<StatCard label="Total" value={stats?.total ?? 0} />
					</Grid>
					<Grid size={{ xs: 6, sm: 3 }}>
						<StatCard
							label="Open"
							value={stats?.statusCounts?.open ?? 0}
							color="error.main"
						/>
					</Grid>
					<Grid size={{ xs: 6, sm: 3 }}>
						<StatCard
							label="In Progress"
							value={stats?.statusCounts?.in_progress ?? 0}
							color="warning.main"
						/>
					</Grid>
					<Grid size={{ xs: 6, sm: 3 }}>
						<StatCard
							label="Resolved"
							value={stats?.statusCounts?.resolved ?? 0}
							color="success.main"
						/>
					</Grid>
				</Grid>

				{/* Filters */}
				<Paper sx={{ p: 2, mb: 2 }}>
					<Box
						sx={{
							display: "flex",
							gap: 2,
							flexWrap: "wrap",
							alignItems: "center",
						}}
					>
						<TextField
							size="small"
							select
							label="Status"
							value={store.filters.status || ""}
							onChange={(e) =>
								store.setFilters({
									status: e.target.value || undefined,
									page: 1,
								})
							}
							sx={{ minWidth: 140 }}
						>
							<MenuItem value="">All Statuses</MenuItem>
							{STATUS_OPTIONS.filter(Boolean).map((s) => (
								<MenuItem key={s} value={s}>
									{s.replace("_", " ")}
								</MenuItem>
							))}
						</TextField>

						<TextField
							size="small"
							select
							label="Severity"
							value={store.filters.severity || ""}
							onChange={(e) =>
								store.setFilters({
									severity: e.target.value || undefined,
									page: 1,
								})
							}
							sx={{ minWidth: 140 }}
						>
							<MenuItem value="">All Severities</MenuItem>
							{SEVERITY_OPTIONS.filter(Boolean).map((s) => (
								<MenuItem key={s} value={s}>
									{s}
								</MenuItem>
							))}
						</TextField>

						<TextField
							size="small"
							placeholder="Search bugs..."
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

						{(store.filters.status ||
							store.filters.severity ||
							store.filters.search) && (
							<Button size="small" onClick={() => store.resetFilters()}>
								Clear Filters
							</Button>
						)}
					</Box>
				</Paper>

				{/* Bug Table */}
				<Paper>
					<TableContainer>
						<Table size="small">
							<TableHead>
								<TableRow>
									<TableCell width={50} />
									<TableCell>Title</TableCell>
									<TableCell width={100}>Severity</TableCell>
									<TableCell width={110}>Status</TableCell>
									<TableCell width={110}>Category</TableCell>
									<TableCell width={140}>Created</TableCell>
									<TableCell width={100}>Actions</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{bugsQuery.isLoading
									? [...Array(5)].map((_, i) => (
											<TableRow key={`skeleton-row-${i}`}>
												{[...Array(7)].map((_, j) => (
													<TableCell key={`skeleton-cell-${i}-${j}`}>
														<Skeleton />
													</TableCell>
												))}
											</TableRow>
										))
									: store.bugs.map((bug) => (
											<TableRow key={bug.id} hover>
												<TableCell padding="checkbox">
													<Checkbox
														checked={bug.status === "resolved"}
														onChange={() => handleCheckboxToggle(bug)}
														size="small"
														color="success"
													/>
												</TableCell>
												<TableCell>
													<Typography
														variant="body2"
														sx={{
															textDecoration:
																bug.status === "resolved"
																	? "line-through"
																	: "none",
															color:
																bug.status === "resolved"
																	? "text.secondary"
																	: "text.primary",
														}}
													>
														{bug.title}
													</Typography>
												</TableCell>
												<TableCell>
													<Chip
														label={bug.severity}
														size="small"
														color={SEVERITY_COLORS[bug.severity] || "default"}
														variant="outlined"
													/>
												</TableCell>
												<TableCell>
													<Chip
														label={bug.status.replace("_", " ")}
														size="small"
														color={STATUS_COLORS[bug.status] || "default"}
														variant="filled"
													/>
												</TableCell>
												<TableCell>
													<Typography
														variant="body2"
														color="text.secondary"
														fontSize="0.8rem"
													>
														{bug.category || "-"}
													</Typography>
												</TableCell>
												<TableCell>
													<Typography
														variant="body2"
														fontSize="0.75rem"
														fontFamily="monospace"
													>
														{format(new Date(bug.createdAt), "MMM dd HH:mm")}
													</Typography>
												</TableCell>
												<TableCell>
													<Tooltip title="Edit">
														<IconButton
															size="small"
															onClick={() => handleOpenEdit(bug)}
														>
															<EditIcon fontSize="small" />
														</IconButton>
													</Tooltip>
													<Tooltip title="Delete">
														<IconButton
															size="small"
															onClick={() => setDeleteTarget(bug)}
															color="error"
														>
															<DeleteIcon fontSize="small" />
														</IconButton>
													</Tooltip>
												</TableCell>
											</TableRow>
										))}
							</TableBody>
						</Table>
					</TableContainer>

					{bugsQuery.data && (
						<TablePagination
							component="div"
							count={store.total}
							page={store.page - 1}
							onPageChange={(_, newPage) => store.setPage(newPage + 1)}
							rowsPerPage={store.pageSize}
							onRowsPerPageChange={(e) =>
								store.setPageSize(parseInt(e.target.value, 10))
							}
							rowsPerPageOptions={[25, 50, 100]}
						/>
					)}
				</Paper>

				{/* Add / Edit Dialog */}
				<Dialog
					open={isDialogOpen}
					onClose={() => {
						store.setAddDialogOpen(false);
						store.setSelectedBug(null);
					}}
					maxWidth="sm"
					fullWidth
				>
					<DialogTitle>{isEditing ? "Edit Bug" : "Add Bug"}</DialogTitle>
					<DialogContent
						sx={{
							display: "flex",
							flexDirection: "column",
							gap: 2,
							pt: "16px !important",
						}}
					>
						<TextField
							label="Title"
							value={formData.title}
							onChange={(e) =>
								setFormData((prev) => ({ ...prev, title: e.target.value }))
							}
							fullWidth
							required
						/>
						<TextField
							label="Description"
							value={formData.description}
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									description: e.target.value,
								}))
							}
							fullWidth
							multiline
							rows={3}
						/>
						<TextField
							label="Severity"
							value={formData.severity}
							onChange={(e) =>
								setFormData((prev) => ({ ...prev, severity: e.target.value }))
							}
							select
							fullWidth
						>
							{SEVERITY_OPTIONS.filter(Boolean).map((s) => (
								<MenuItem key={s} value={s}>
									{s}
								</MenuItem>
							))}
						</TextField>
						<TextField
							label="Status"
							value={formData.status}
							onChange={(e) =>
								setFormData((prev) => ({ ...prev, status: e.target.value }))
							}
							select
							fullWidth
						>
							{STATUS_OPTIONS.filter(Boolean).map((s) => (
								<MenuItem key={s} value={s}>
									{s.replace("_", " ")}
								</MenuItem>
							))}
						</TextField>
						<TextField
							label="Category"
							value={formData.category}
							onChange={(e) =>
								setFormData((prev) => ({ ...prev, category: e.target.value }))
							}
							fullWidth
							placeholder="e.g. security, api, logging"
						/>
					</DialogContent>
					<DialogActions>
						<Button
							onClick={() => {
								store.setAddDialogOpen(false);
								store.setSelectedBug(null);
							}}
						>
							Cancel
						</Button>
						<Button
							variant="contained"
							onClick={isEditing ? handleSaveEdit : handleSaveAdd}
							disabled={
								!formData.title.trim() ||
								createMutation.isPending ||
								updateMutation.isPending
							}
						>
							{isEditing ? "Save" : "Create"}
						</Button>
					</DialogActions>
				</Dialog>

				{/* Delete Confirmation Dialog */}
				<Dialog
					open={!!deleteTarget}
					onClose={() => setDeleteTarget(null)}
					maxWidth="xs"
					fullWidth
				>
					<DialogTitle>Delete Bug</DialogTitle>
					<DialogContent>
						<Typography>
							Are you sure you want to delete &quot;{deleteTarget?.title}&quot;?
							This action cannot be undone.
						</Typography>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
						<Button
							variant="contained"
							color="error"
							onClick={() =>
								deleteTarget && deleteMutation.mutate(deleteTarget.id)
							}
							disabled={deleteMutation.isPending}
						>
							Delete
						</Button>
					</DialogActions>
				</Dialog>
			</Box>
		</PageTransition>
	);
}
