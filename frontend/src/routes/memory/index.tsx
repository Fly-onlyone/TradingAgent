/**
 * Agent Memory Page
 */

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import PsychologyIcon from "@mui/icons-material/Psychology";
import SearchIcon from "@mui/icons-material/Search";
import TimerIcon from "@mui/icons-material/Timer";
import {
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Grid2 as Grid,
	IconButton,
	InputAdornment,
	MenuItem,
	Pagination,
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
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { memoryApi } from "@/api/endpoints/memory";
import {
	memoryListQueryOptions,
	memoryStatsQueryOptions,
} from "@/api/queryOptions/memory";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { useDebounce } from "@/hooks/useDebounce";
import { notify } from "@/store/uiStore";
import type {
	AgentMemory,
	MemoryCategory,
	MemoryCreate,
	MemoryUpdate,
} from "@/types/memory";
import { MEMORY_CATEGORY_CONFIG } from "@/types/memory";
import { staggerCascade } from "@/utils/animations/variants";
import { formatRelativeTime } from "@/utils/formatters";
import { requireAuth } from "../-guards";

export const Route = createFileRoute("/memory/")({
	beforeLoad: requireAuth,
	component: MemoryPage,
});

const PAGE_SIZE = 20;

const ALL_CATEGORIES: MemoryCategory[] = [
	"preference",
	"watchlist",
	"trading_context",
	"market_observation",
	"decision_rationale",
	"lesson",
	"general",
];

const SKELETON_KEYS = Array.from(
	{ length: 6 },
	(_, i) => `memory-skeleton-${i}`,
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function MemoryPage() {
	const queryClient = useQueryClient();

	// Filters
	const [selectedCategory, setSelectedCategory] =
		useState<MemoryCategory | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedQuery = useDebounce(searchQuery, 300);
	const [page, setPage] = useState(1);

	// Dialogs
	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<AgentMemory | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<AgentMemory | null>(null);

	// Queries
	const filter = selectedCategory ? { category: selectedCategory } : undefined;
	const { data: listData, isLoading: listLoading } = useQuery({
		...memoryListQueryOptions(filter, page, PAGE_SIZE),
		placeholderData: keepPreviousData,
		enabled: !debouncedQuery,
	});

	const { data: stats } = useQuery(memoryStatsQueryOptions());

	const { data: searchData, isLoading: searchLoading } = useQuery({
		queryKey: ["agent-memories-search", debouncedQuery, selectedCategory],
		queryFn: () =>
			memoryApi.searchMemories(
				debouncedQuery,
				selectedCategory ?? undefined,
				20,
			),
		enabled: debouncedQuery.length > 0,
		placeholderData: keepPreviousData,
	});

	const isSearchMode = debouncedQuery.length > 0;
	const memories = isSearchMode
		? (searchData?.memories ?? [])
		: (listData?.memories ?? []);
	const totalPages = isSearchMode
		? 1
		: Math.ceil((listData?.total ?? 0) / PAGE_SIZE);
	const isLoading = isSearchMode ? searchLoading : listLoading;

	// Mutations
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["agent-memories"] });
		queryClient.invalidateQueries({ queryKey: ["agent-memory-stats"] });
		queryClient.invalidateQueries({ queryKey: ["agent-memories-search"] });
	};

	const deleteMutation = useMutation({
		mutationFn: (id: string) => memoryApi.deleteMemory(id),
		onSuccess: () => {
			notify.success("Memory deleted");
			setDeleteTarget(null);
			invalidate();
		},
		onError: () => notify.error("Failed to delete memory"),
	});

	return (
		<PageTransition pageKey="memory">
			<Box>
				<SectionHeader
					title="Agent Memory"
					subtitle="What your agent remembers across sessions"
					action={
						<Button
							variant="contained"
							startIcon={<AddIcon />}
							onClick={() => setCreateOpen(true)}
						>
							Add Memory
						</Button>
					}
				/>

				{/* Stats bar */}
				{stats && (
					<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
						<Chip
							label={`${stats.total} total`}
							size="small"
							variant="outlined"
						/>
						{stats.permanentCount > 0 && (
							<Chip
								label={`${stats.permanentCount} permanent`}
								size="small"
								color="success"
								variant="outlined"
							/>
						)}
						{stats.expiringSoonCount > 0 && (
							<Chip
								icon={<TimerIcon />}
								label={`${stats.expiringSoonCount} expiring soon`}
								size="small"
								color="warning"
								variant="outlined"
							/>
						)}
						{Object.entries(stats.byCategory).map(([cat, count]) => (
							<Chip
								key={cat}
								label={`${MEMORY_CATEGORY_CONFIG[cat as MemoryCategory]?.label ?? cat}: ${count}`}
								size="small"
								variant="outlined"
								sx={{ opacity: 0.8 }}
							/>
						))}
					</Box>
				)}

				{/* Search + Category filter */}
				<Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
					<TextField
						placeholder="Search memories..."
						value={searchQuery}
						onChange={(e) => {
							setSearchQuery(e.target.value);
							setPage(1);
						}}
						size="small"
						sx={{ minWidth: 260 }}
						slotProps={{
							input: {
								startAdornment: (
									<InputAdornment position="start">
										<SearchIcon />
									</InputAdornment>
								),
								endAdornment:
									isSearchMode && searchLoading ? (
										<InputAdornment position="end">
											<CircularProgress size={16} />
										</InputAdornment>
									) : undefined,
							},
						}}
					/>
					<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
						<Chip
							label="All"
							size="small"
							variant={selectedCategory === null ? "filled" : "outlined"}
							color={selectedCategory === null ? "primary" : "default"}
							onClick={() => {
								setSelectedCategory(null);
								setPage(1);
							}}
						/>
						{ALL_CATEGORIES.map((cat) => {
							const cfg = MEMORY_CATEGORY_CONFIG[cat];
							return (
								<Chip
									key={cat}
									label={cfg.label}
									size="small"
									variant={selectedCategory === cat ? "filled" : "outlined"}
									color={selectedCategory === cat ? cfg.color : "default"}
									onClick={() => {
										setSelectedCategory(selectedCategory === cat ? null : cat);
										setPage(1);
									}}
								/>
							);
						})}
					</Box>
				</Box>

				{/* Content */}
				{isLoading && !memories.length ? (
					<Grid container spacing={2}>
						{SKELETON_KEYS.map((key) => (
							<Grid key={key} size={{ xs: 12, md: 6, lg: 4 }}>
								<ShimmerSkeleton shimmerVariant="card" sx={{ height: 160 }} />
							</Grid>
						))}
					</Grid>
				) : memories.length === 0 ? (
					<EmptyState
						icon={<PsychologyIcon sx={{ fontSize: 48 }} />}
						title="No memories yet"
						description={
							isSearchMode
								? "No memories match your search"
								: "Memories will appear here as the agent learns from conversations"
						}
						action={
							!isSearchMode
								? {
										label: "Add Memory",
										onClick: () => setCreateOpen(true),
									}
								: undefined
						}
					/>
				) : (
					<motion.div
						variants={staggerCascade.container}
						initial="hidden"
						animate="visible"
					>
						<Grid container spacing={2}>
							{memories.map((memory) => (
								<Grid key={memory.id} size={{ xs: 12, md: 6, lg: 4 }}>
									<motion.div variants={staggerCascade.item}>
										<MemoryCard
											memory={memory}
											onEdit={() => setEditTarget(memory)}
											onDelete={() => setDeleteTarget(memory)}
										/>
									</motion.div>
								</Grid>
							))}
						</Grid>
					</motion.div>
				)}

				{/* Pagination */}
				{!isSearchMode && totalPages > 1 && (
					<Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
						<Pagination
							count={totalPages}
							page={page}
							onChange={(_, p) => setPage(p)}
							color="primary"
						/>
					</Box>
				)}

				{/* Dialogs */}
				<MemoryFormDialog
					open={createOpen}
					onClose={() => setCreateOpen(false)}
					onSaved={invalidate}
				/>
				<MemoryFormDialog
					open={!!editTarget}
					memory={editTarget}
					onClose={() => setEditTarget(null)}
					onSaved={invalidate}
				/>
				<ConfirmDialog
					open={!!deleteTarget}
					title="Delete Memory"
					message={`Delete this ${deleteTarget?.category.replace("_", " ")} memory? This cannot be undone.`}
					confirmLabel="Delete"
					destructive
					loading={deleteMutation.isPending}
					onConfirm={() => {
						if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
					}}
					onCancel={() => setDeleteTarget(null)}
				/>
			</Box>
		</PageTransition>
	);
}

// ---------------------------------------------------------------------------
// Memory Card
// ---------------------------------------------------------------------------

function MemoryCard({
	memory,
	onEdit,
	onDelete,
}: {
	memory: AgentMemory;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const cfg = MEMORY_CATEGORY_CONFIG[memory.category];
	const isLong = memory.content.length > 200;

	return (
		<Card
			sx={{
				height: "100%",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<CardContent sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
				{/* Header */}
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						mb: 1,
					}}
				>
					<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
						<Chip label={cfg.label} size="small" color={cfg.color} />
						<ExpiryChip expiresAt={memory.expiresAt} />
					</Box>
					<Box sx={{ display: "flex", ml: 1, flexShrink: 0 }}>
						<Tooltip title="Edit">
							<IconButton size="small" onClick={onEdit}>
								<EditIcon fontSize="small" />
							</IconButton>
						</Tooltip>
						<Tooltip title="Delete">
							<IconButton size="small" onClick={onDelete}>
								<DeleteOutlineIcon fontSize="small" />
							</IconButton>
						</Tooltip>
					</Box>
				</Box>

				{/* Content */}
				<Typography
					variant="body2"
					sx={{
						mb: 1,
						flex: 1,
						whiteSpace: "pre-wrap",
						...(!expanded &&
							isLong && {
								display: "-webkit-box",
								WebkitLineClamp: 3,
								WebkitBoxOrient: "vertical",
								overflow: "hidden",
							}),
					}}
				>
					{memory.content}
				</Typography>
				{isLong && (
					<Typography
						variant="caption"
						color="primary"
						sx={{ cursor: "pointer", mb: 1 }}
						onClick={() => setExpanded(!expanded)}
					>
						{expanded ? "Show less" : "Show more"}
					</Typography>
				)}

				{/* Tags */}
				{memory.tags.length > 0 && (
					<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1 }}>
						{memory.tags.map((tag) => (
							<Chip
								key={tag}
								label={tag}
								size="small"
								variant="outlined"
								sx={{ fontSize: "0.7rem", height: 20 }}
							/>
						))}
					</Box>
				)}

				{/* Footer */}
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						mt: "auto",
					}}
				>
					<Typography variant="caption" color="text.secondary">
						Updated {formatRelativeTime(memory.updatedAt)}
					</Typography>
					{memory.accessCount > 0 && (
						<Typography variant="caption" color="text.secondary">
							Used {memory.accessCount}x
						</Typography>
					)}
				</Box>
			</CardContent>
		</Card>
	);
}

// ---------------------------------------------------------------------------
// Expiry Chip
// ---------------------------------------------------------------------------

function ExpiryChip({ expiresAt }: { expiresAt: string | null }) {
	if (!expiresAt) {
		return (
			<Chip
				label="Permanent"
				size="small"
				color="success"
				variant="outlined"
				sx={{ fontSize: "0.7rem", height: 20 }}
			/>
		);
	}

	const now = Date.now();
	const exp = new Date(expiresAt).getTime();
	const hoursLeft = (exp - now) / (1000 * 60 * 60);

	if (hoursLeft <= 0) {
		return (
			<Chip
				label="Expired"
				size="small"
				color="error"
				variant="outlined"
				sx={{ fontSize: "0.7rem", height: 20 }}
			/>
		);
	}

	if (hoursLeft <= 24) {
		const h = Math.ceil(hoursLeft);
		return (
			<Chip
				label={`${h}h left`}
				size="small"
				color="warning"
				variant="outlined"
				sx={{ fontSize: "0.7rem", height: 20 }}
			/>
		);
	}

	const daysLeft = Math.ceil(hoursLeft / 24);
	return (
		<Chip
			label={`${daysLeft}d left`}
			size="small"
			variant="outlined"
			sx={{ fontSize: "0.7rem", height: 20 }}
		/>
	);
}

// ---------------------------------------------------------------------------
// Form Dialog (Create / Edit)
// ---------------------------------------------------------------------------

function MemoryFormDialog({
	open,
	memory,
	onClose,
	onSaved,
}: {
	open: boolean;
	memory?: AgentMemory | null;
	onClose: () => void;
	onSaved: () => void;
}) {
	const isEdit = !!memory;
	const [content, setContent] = useState("");
	const [category, setCategory] = useState<MemoryCategory>("general");
	const [tagsInput, setTagsInput] = useState("");

	// Reset form when dialog opens
	const handleEnter = () => {
		if (memory) {
			setContent(memory.content);
			setCategory(memory.category);
			setTagsInput(memory.tags.join(", "));
		} else {
			setContent("");
			setCategory("general");
			setTagsInput("");
		}
	};

	const createMutation = useMutation({
		mutationFn: (data: MemoryCreate) => memoryApi.createMemory(data),
		onSuccess: () => {
			notify.success("Memory saved");
			onClose();
			onSaved();
		},
		onError: () => notify.error("Failed to save memory"),
	});

	const updateMutation = useMutation({
		mutationFn: (data: MemoryUpdate) =>
			memoryApi.updateMemory(memory?.id ?? "", data),
		onSuccess: () => {
			notify.success("Memory updated");
			onClose();
			onSaved();
		},
		onError: () => notify.error("Failed to update memory"),
	});

	const handleSubmit = () => {
		const tags = tagsInput
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);

		if (isEdit) {
			updateMutation.mutate({ content, category, tags });
		} else {
			createMutation.mutate({ content, category, tags });
		}
	};

	const isPending = createMutation.isPending || updateMutation.isPending;

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="sm"
			fullWidth
			TransitionProps={{ onEnter: handleEnter }}
		>
			<DialogTitle>{isEdit ? "Edit Memory" : "Add Memory"}</DialogTitle>
			<DialogContent
				sx={{
					display: "flex",
					flexDirection: "column",
					gap: 2,
					pt: "8px !important",
				}}
			>
				<TextField
					label="Content"
					multiline
					rows={4}
					value={content}
					onChange={(e) => setContent(e.target.value)}
					slotProps={{ htmlInput: { maxLength: 2000 } }}
					helperText={`${content.length} / 2000`}
					fullWidth
				/>
				<ZoomAwareSelect
					label="Category"
					value={category}
					onChange={(e) => setCategory(e.target.value as MemoryCategory)}
					fullWidth
				>
					{ALL_CATEGORIES.map((cat) => (
						<MenuItem key={cat} value={cat}>
							{MEMORY_CATEGORY_CONFIG[cat].label} (
							{MEMORY_CATEGORY_CONFIG[cat].ttlLabel})
						</MenuItem>
					))}
				</ZoomAwareSelect>
				<TextField
					label="Tags (comma-separated)"
					value={tagsInput}
					onChange={(e) => setTagsInput(e.target.value)}
					placeholder="e.g. BTC, risk, daily"
					fullWidth
				/>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cancel</Button>
				<Button
					variant="contained"
					onClick={handleSubmit}
					disabled={!content.trim() || isPending}
					startIcon={isPending ? <CircularProgress size={16} /> : undefined}
				>
					{isEdit ? "Update" : "Save"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
