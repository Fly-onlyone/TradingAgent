/**
 * Strategies List Page — sidebar discovery panel + refreshed card grid.
 */

import AddIcon from "@mui/icons-material/Add";
import ChatIcon from "@mui/icons-material/Chat";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import InfoIcon from "@mui/icons-material/Info";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
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
	Menu,
	MenuItem,
	Switch,
	Tab,
	Tabs,
	TextField,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { strategiesApi } from "@/api/endpoints/strategies";
import { PerformanceGauge } from "@/components/charts/PerformanceGauge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { StrategyDiscoveryCard } from "@/components/strategies/StrategyDiscoveryCard";
import { useZoomAwareMenu } from "@/hooks/useZoomAwareMenu";
import { useAuthStore } from "@/store/authStore";
import { notify } from "@/store/uiStore";
import type {
	ExtractionMessage,
	Strategy,
	StrategyRiskParams,
	StrategyUpdate,
} from "@/types";
import { staggerCascade } from "@/utils/animations/variants";
import { formatPercent } from "@/utils/formatters";
import { requireAuth } from "../-guards";

export const Route = createFileRoute("/strategies/")({
	beforeLoad: requireAuth,
	component: StrategiesPage,
});

const STRATEGY_CARD_SKELETON_KEYS = Array.from(
	{ length: 4 },
	(_, index) => `strategy-card-skeleton-${index}`,
);

type SortOption = "name" | "performance" | "winRate" | "newest";

function StrategiesPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isSuperuser = useAuthStore((s) => s.user?.isSuperuser);
	const {
		data: strategies,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["strategies"],
		queryFn: () => strategiesApi.getStrategies(),
	});

	const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
	const [search, setSearch] = useState("");
	const [sort] = useState<SortOption>("performance");
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [detailsTarget, setDetailsTarget] = useState<Strategy | null>(null);

	const deleteMutation = useMutation({
		mutationFn: (strategyId: string) =>
			strategiesApi.deleteStrategy(strategyId),
		onSuccess: async () => {
			notify.success("Strategy deleted");
			await queryClient.invalidateQueries({ queryKey: ["strategies"] });
		},
		onError: () => {
			notify.error("Failed to delete strategy");
		},
	});

	const filteredStrategies = useMemo(() => {
		if (!strategies) return [];
		let result = strategies;

		// Filter by status
		if (filter === "active") result = result.filter((s) => s.isActive);
		if (filter === "inactive") result = result.filter((s) => !s.isActive);

		// Search by name
		if (search.trim()) {
			const q = search.toLowerCase();
			result = result.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.description?.toLowerCase().includes(q),
			);
		}

		// Sort
		result = [...result].sort((a, b) => {
			switch (sort) {
				case "name":
					return a.name.localeCompare(b.name);
				case "performance":
					return (
						(b.backtestResults?.totalPnlPercent ?? 0) -
						(a.backtestResults?.totalPnlPercent ?? 0)
					);
				case "winRate":
					return (
						(b.backtestResults?.winRate ?? 0) -
						(a.backtestResults?.winRate ?? 0)
					);
				case "newest":
					return (
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
					);
				default:
					return 0;
			}
		});

		return result;
	}, [strategies, filter, search, sort]);

	const handleToggleActive = async (strategy: Strategy) => {
		try {
			await strategiesApi.toggleStrategy(strategy.id, !strategy.isActive);
			void refetch();
			notify.success(
				strategy.isActive ? "Strategy deactivated" : "Strategy activated",
				strategy.name,
			);
		} catch (_error) {
			notify.error("Failed to update strategy");
		}
	};

	const counts = useMemo(() => {
		if (!strategies) return { all: 0, active: 0, inactive: 0 };
		return {
			all: strategies.length,
			active: strategies.filter((s) => s.isActive).length,
			inactive: strategies.filter((s) => !s.isActive).length,
		};
	}, [strategies]);

	// Use 2-column grid when sidebar visible, 3-column when not
	const cardGridSize = isSuperuser
		? { xs: 12, md: 6 }
		: { xs: 12, md: 6, lg: 4 };

	return (
		<PageTransition pageKey="strategies">
			<Box
				sx={{
					display: "flex",
					flexDirection: "column",
					height: "calc(100vh - 64px)",
					overflow: "hidden",
				}}
			>
				{/* ====== PINNED HEADER — single compact row ====== */}
				<Box
					sx={{
						flexShrink: 0,
						display: "flex",
						alignItems: "center",
						gap: 1.5,
						flexWrap: "wrap",
						py: 1.5,
						borderBottom: 1,
						borderColor: "divider",
					}}
				>
					<Typography variant="h5" fontWeight={700} sx={{ mr: 1 }}>
						Strategies
					</Typography>

					<Chip
						label={`All (${counts.all})`}
						variant={filter === "all" ? "filled" : "outlined"}
						color={filter === "all" ? "primary" : "default"}
						onClick={() => setFilter("all")}
						size="small"
					/>
					<Chip
						label={`Active (${counts.active})`}
						color={filter === "active" ? "success" : "default"}
						variant={filter === "active" ? "filled" : "outlined"}
						onClick={() => setFilter("active")}
						size="small"
					/>
					<Chip
						label={`Inactive (${counts.inactive})`}
						variant={filter === "inactive" ? "filled" : "outlined"}
						onClick={() => setFilter("inactive")}
						size="small"
					/>

					<Box sx={{ flex: 1 }} />

					<TextField
						size="small"
						placeholder="Search..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						slotProps={{
							input: {
								startAdornment: (
									<InputAdornment position="start">
										<Typography color="text.secondary" variant="body2">
											&#x1F50D;
										</Typography>
									</InputAdornment>
								),
							},
						}}
						sx={{ width: 180 }}
					/>

					<Button
						component={Link}
						to="/strategies/create"
						variant="contained"
						size="small"
						startIcon={<AddIcon />}
					>
						Import
					</Button>
				</Box>

				{/* ====== SCROLLABLE CONTENT AREA ====== */}
				<Box
					sx={{
						display: "flex",
						gap: 3,
						flexDirection: { xs: "column", md: "row" },
						flex: 1,
						minHeight: 0,
						pt: 2,
					}}
				>
					{/* Left sidebar: Auto-Discovery (scrolls independently) */}
					{isSuperuser && (
						<Box
							sx={{
								width: { xs: "100%", md: 300 },
								flexShrink: 0,
								overflowY: { md: "auto" },
							}}
						>
							<StrategyDiscoveryCard />
						</Box>
					)}

					{/* Right: scrollable strategy cards */}
					<Box
						sx={{
							flex: 1,
							minWidth: 0,
							overflowY: "auto",
							pb: 2,
						}}
					>
						{isLoading ? (
							<Grid container spacing={3}>
								{STRATEGY_CARD_SKELETON_KEYS.map((key) => (
									<Grid key={key} size={cardGridSize}>
										<ShimmerSkeleton
											shimmerVariant="card"
											sx={{ height: 320 }}
										/>
									</Grid>
								))}
							</Grid>
						) : filteredStrategies.length > 0 ? (
							<motion.div
								variants={staggerCascade.container}
								initial="hidden"
								animate="visible"
							>
								<Grid container spacing={3}>
									{filteredStrategies.map((strategy) => (
										<Grid key={strategy.id} size={cardGridSize}>
											<motion.div variants={staggerCascade.item}>
												<StrategyCard
													strategy={strategy}
													onToggle={() => handleToggleActive(strategy)}
													onDelete={() => setDeleteTarget(strategy.id)}
													onViewDetails={() => setDetailsTarget(strategy)}
												/>
											</motion.div>
										</Grid>
									))}
								</Grid>
							</motion.div>
						) : (
							<EmptyState
								title="No strategies yet"
								description="Create your first automated trading strategy to get started"
								action={{
									label: "Import Strategy",
									onClick: () => navigate({ to: "/strategies/create" }),
								}}
							/>
						)}
					</Box>
				</Box>

				<ConfirmDialog
					open={!!deleteTarget}
					title="Delete Strategy"
					message="Are you sure you want to delete this strategy? This action cannot be undone."
					confirmLabel="Delete"
					destructive
					loading={deleteMutation.isPending}
					onConfirm={() => {
						if (deleteTarget) {
							deleteMutation.mutate(deleteTarget);
							setDeleteTarget(null);
						}
					}}
					onCancel={() => setDeleteTarget(null)}
				/>

				<StrategyDetailDialog
					strategy={detailsTarget}
					onClose={() => setDetailsTarget(null)}
				/>
			</Box>
		</PageTransition>
	);
}

/** Formats a rules/params object as a JSON string for editing. */
function rulesAsText(
	rules: Record<string, unknown> | StrategyRiskParams,
): string {
	return JSON.stringify(rules, null, 2);
}

/** Safely parses JSON text back to a Record. Returns null on invalid JSON. */
function parseRulesText<T extends object>(text: string): T | null {
	try {
		const parsed = JSON.parse(text);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed))
			return parsed as T;
		return null;
	} catch {
		return null;
	}
}

function StrategyDetailDialog({
	strategy,
	onClose,
}: {
	strategy: Strategy | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState(false);
	const [dialogTab, setDialogTab] = useState(0);

	// Edit form state
	const [editName, setEditName] = useState("");
	const [editDescription, setEditDescription] = useState("");
	const [editEntryRules, setEditEntryRules] = useState("");
	const [editExitRules, setEditExitRules] = useState("");
	const [editRiskParams, setEditRiskParams] = useState("");

	// JSON validation
	const [entryError, setEntryError] = useState(false);
	const [exitError, setExitError] = useState(false);
	const [riskError, setRiskError] = useState(false);

	// Fetch knowledge data (extraction chat) when the chat tab is selected
	const { data: knowledge, isLoading: knowledgeLoading } = useQuery({
		queryKey: ["strategy-knowledge", strategy?.id],
		queryFn: () => strategiesApi.getStrategyKnowledge(strategy?.id ?? ""),
		enabled: !!strategy && dialogTab === 1,
	});

	const populateForm = useCallback((s: Strategy) => {
		setEditName(s.name);
		setEditDescription(s.description || "");
		setEditEntryRules(rulesAsText(s.entryRules));
		setEditExitRules(rulesAsText(s.exitRules));
		setEditRiskParams(rulesAsText(s.riskParams));
		setEntryError(false);
		setExitError(false);
		setRiskError(false);
	}, []);

	// Reset edit state when dialog opens with a new strategy
	useEffect(() => {
		if (strategy) {
			populateForm(strategy);
			setEditing(false);
			setDialogTab(0);
		}
	}, [strategy, populateForm]);

	const updateMutation = useMutation({
		mutationFn: ({
			strategyId,
			data,
		}: {
			strategyId: string;
			data: StrategyUpdate;
		}) => strategiesApi.updateStrategy(strategyId, data),
		onSuccess: async () => {
			notify.success("Strategy updated");
			await queryClient.invalidateQueries({ queryKey: ["strategies"] });
			setEditing(false);
		},
		onError: () => {
			notify.error("Failed to update strategy");
		},
	});

	const handleStartEdit = () => {
		if (strategy) populateForm(strategy);
		setEditing(true);
	};

	const handleCancelEdit = () => {
		if (strategy) populateForm(strategy);
		setEditing(false);
	};

	const handleSave = () => {
		if (!strategy) {
			return;
		}

		const entry = parseRulesText<Record<string, unknown>>(editEntryRules);
		const exit = parseRulesText<Record<string, unknown>>(editExitRules);
		const risk = parseRulesText<StrategyRiskParams>(editRiskParams);

		let hasError = false;
		if (!entry) {
			setEntryError(true);
			hasError = true;
		} else {
			setEntryError(false);
		}
		if (!exit) {
			setExitError(true);
			hasError = true;
		} else {
			setExitError(false);
		}
		if (!risk) {
			setRiskError(true);
			hasError = true;
		} else {
			setRiskError(false);
		}
		if (hasError || !entry || !exit || !risk) return;

		updateMutation.mutate({
			strategyId: strategy.id,
			data: {
				name: editName,
				description: editDescription,
				entryRules: entry,
				exitRules: exit,
				riskParams: risk,
			},
		});
	};

	const handleClose = () => {
		setEditing(false);
		setDialogTab(0);
		onClose();
	};

	return (
		<Dialog open={!!strategy} onClose={handleClose} maxWidth="sm" fullWidth>
			{strategy && (
				<>
					<DialogTitle
						sx={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							pr: 1,
						}}
					>
						{editing ? (
							<TextField
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
								variant="standard"
								fullWidth
								sx={{
									mr: 2,
									"& .MuiInputBase-input": {
										fontSize: "1.25rem",
										fontWeight: 600,
									},
								}}
							/>
						) : (
							<Typography variant="h6" component="span">
								{strategy.name}
							</Typography>
						)}
						<Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
							{!editing && dialogTab === 0 && (
								<IconButton size="small" onClick={handleStartEdit} title="Edit">
									<EditIcon fontSize="small" />
								</IconButton>
							)}
							<IconButton size="small" onClick={handleClose} title="Close">
								<CloseIcon fontSize="small" />
							</IconButton>
						</Box>
					</DialogTitle>

					{!editing && (
						<Tabs
							value={dialogTab}
							onChange={(_, v) => setDialogTab(v)}
							sx={{ px: 3, borderBottom: 1, borderColor: "divider" }}
						>
							<Tab label="Details" />
							<Tab
								label="Extraction Chat"
								icon={<ChatIcon sx={{ fontSize: 16 }} />}
								iconPosition="start"
							/>
						</Tabs>
					)}

					<DialogContent>
						{dialogTab === 0 &&
							(editing ? (
								<Box
									sx={{
										display: "flex",
										flexDirection: "column",
										gap: 2,
										mt: 1,
									}}
								>
									<TextField
										label="Description"
										value={editDescription}
										onChange={(e) => setEditDescription(e.target.value)}
										multiline
										minRows={2}
										fullWidth
										size="small"
									/>
									<TextField
										label="Entry Rules (JSON)"
										value={editEntryRules}
										onChange={(e) => {
											setEditEntryRules(e.target.value);
											setEntryError(false);
										}}
										multiline
										minRows={3}
										fullWidth
										size="small"
										error={entryError}
										helperText={entryError ? "Invalid JSON" : undefined}
										slotProps={{
											htmlInput: {
												style: { fontFamily: "monospace", fontSize: 13 },
											},
										}}
									/>
									<TextField
										label="Exit Rules (JSON)"
										value={editExitRules}
										onChange={(e) => {
											setEditExitRules(e.target.value);
											setExitError(false);
										}}
										multiline
										minRows={3}
										fullWidth
										size="small"
										error={exitError}
										helperText={exitError ? "Invalid JSON" : undefined}
										slotProps={{
											htmlInput: {
												style: { fontFamily: "monospace", fontSize: 13 },
											},
										}}
									/>
									<TextField
										label="Risk Parameters (JSON)"
										value={editRiskParams}
										onChange={(e) => {
											setEditRiskParams(e.target.value);
											setRiskError(false);
										}}
										multiline
										minRows={3}
										fullWidth
										size="small"
										error={riskError}
										helperText={riskError ? "Invalid JSON" : undefined}
										slotProps={{
											htmlInput: {
												style: { fontFamily: "monospace", fontSize: 13 },
											},
										}}
									/>
								</Box>
							) : (
								<>
									<Typography
										variant="body2"
										color="text.secondary"
										gutterBottom
									>
										{strategy.description || "No description"}
									</Typography>

									<Box
										sx={{
											display: "flex",
											gap: 1,
											flexWrap: "wrap",
											mt: 1,
										}}
									>
										<Chip
											label={strategy.isActive ? "Active" : "Inactive"}
											color={strategy.isActive ? "success" : "default"}
											size="small"
										/>
										{strategy.autoDiscovered && (
											<Chip
												label="Auto-discovered"
												size="small"
												color="info"
												variant="outlined"
											/>
										)}
									</Box>

									{strategy.symbols?.length > 0 && (
										<Box sx={{ mt: 2 }}>
											<Typography variant="subtitle2" gutterBottom>
												Symbols
											</Typography>
											<Box
												sx={{
													display: "flex",
													gap: 0.5,
													flexWrap: "wrap",
												}}
											>
												{strategy.symbols.map((s) => (
													<Chip
														key={s}
														label={s}
														size="small"
														variant="outlined"
													/>
												))}
											</Box>
										</Box>
									)}

									{strategy.timeframes?.length > 0 && (
										<Box sx={{ mt: 2 }}>
											<Typography variant="subtitle2" gutterBottom>
												Timeframes
											</Typography>
											<Box
												sx={{
													display: "flex",
													gap: 0.5,
													flexWrap: "wrap",
												}}
											>
												{strategy.timeframes.map((t) => (
													<Chip
														key={t}
														label={t}
														size="small"
														variant="outlined"
													/>
												))}
											</Box>
										</Box>
									)}

									{strategy.entryRules &&
										Object.keys(strategy.entryRules).length > 0 && (
											<Box sx={{ mt: 2 }}>
												<Typography variant="subtitle2" gutterBottom>
													Entry Rules
												</Typography>
												{Object.entries(strategy.entryRules).map(
													([key, val]) => (
														<Typography
															key={key}
															variant="body2"
															sx={{ ml: 1 }}
														>
															<strong>{key}:</strong> {String(val)}
														</Typography>
													),
												)}
											</Box>
										)}

									{strategy.exitRules &&
										Object.keys(strategy.exitRules).length > 0 && (
											<Box sx={{ mt: 2 }}>
												<Typography variant="subtitle2" gutterBottom>
													Exit Rules
												</Typography>
												{Object.entries(strategy.exitRules).map(
													([key, val]) => (
														<Typography
															key={key}
															variant="body2"
															sx={{ ml: 1 }}
														>
															<strong>{key}:</strong> {String(val)}
														</Typography>
													),
												)}
											</Box>
										)}

									{strategy.riskParams &&
										Object.keys(strategy.riskParams).length > 0 && (
											<Box sx={{ mt: 2 }}>
												<Typography variant="subtitle2" gutterBottom>
													Risk Parameters
												</Typography>
												{Object.entries(strategy.riskParams).map(
													([key, val]) => (
														<Typography
															key={key}
															variant="body2"
															sx={{ ml: 1 }}
														>
															<strong>{key}:</strong> {String(val)}
														</Typography>
													),
												)}
											</Box>
										)}

									{strategy.sourceUrl && (
										<Typography
											variant="body2"
											color="text.secondary"
											sx={{ mt: 2 }}
										>
											<strong>Source:</strong>{" "}
											<a
												href={strategy.sourceUrl}
												target="_blank"
												rel="noopener noreferrer"
											>
												{strategy.sourceUrl}
											</a>
										</Typography>
									)}

									{strategy.backtestResults && (
										<Box sx={{ mt: 2 }}>
											<Typography variant="subtitle2" gutterBottom>
												Backtest Results
											</Typography>
											<Typography variant="body2">
												Win Rate:{" "}
												{formatPercent(strategy.backtestResults.winRate)}
											</Typography>
											<Typography variant="body2">
												Total Trades: {strategy.backtestResults.totalTrades}
											</Typography>
											<Typography variant="body2">
												P&L:{" "}
												{formatPercent(
													strategy.backtestResults.totalPnlPercent,
												)}
											</Typography>
											<Typography variant="body2">
												Max Drawdown:{" "}
												{formatPercent(-strategy.backtestResults.maxDrawdown)}
											</Typography>
										</Box>
									)}
								</>
							))}

						{dialogTab === 1 && (
							<ExtractionChatTab
								messages={knowledge?.extractionMessages ?? []}
								sourceUrl={knowledge?.sourceUrl}
								createdAt={knowledge?.createdAt}
								isLoading={knowledgeLoading}
							/>
						)}
					</DialogContent>
					{editing && (
						<DialogActions sx={{ px: 3, pb: 2 }}>
							<Button
								onClick={handleCancelEdit}
								disabled={updateMutation.isPending}
							>
								Cancel
							</Button>
							<Button
								variant="contained"
								onClick={handleSave}
								disabled={updateMutation.isPending || !editName.trim()}
							>
								{updateMutation.isPending ? "Saving..." : "Save"}
							</Button>
						</DialogActions>
					)}
				</>
			)}
		</Dialog>
	);
}

function ExtractionChatTab({
	messages,
	sourceUrl,
	createdAt,
	isLoading,
}: {
	messages: ExtractionMessage[];
	sourceUrl?: string;
	createdAt?: string;
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<Box
				sx={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					py: 6,
				}}
			>
				<CircularProgress size={28} />
			</Box>
		);
	}

	if (messages.length === 0) {
		return (
			<Box sx={{ py: 4, textAlign: "center" }}>
				<ChatIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
				<Typography variant="body2" color="text.secondary">
					No extraction data available.
				</Typography>
				<Typography variant="caption" color="text.disabled">
					This strategy was not imported via AI extraction.
				</Typography>
			</Box>
		);
	}

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 1 }}>
			{sourceUrl && (
				<Typography variant="caption" color="text.secondary">
					Source:{" "}
					<a href={sourceUrl} target="_blank" rel="noopener noreferrer">
						{sourceUrl}
					</a>
				</Typography>
			)}
			{createdAt && (
				<Typography variant="caption" color="text.disabled">
					Extracted: {new Date(createdAt).toLocaleString()}
				</Typography>
			)}

			{messages.map((msg, idx) => (
				<Box
					key={`extraction-msg-${msg.role}-${idx}`}
					sx={{
						display: "flex",
						justifyContent: msg.role === "assistant" ? "flex-start" : "center",
					}}
				>
					{msg.role === "system" ? (
						<Chip
							label={msg.content}
							size="small"
							variant="outlined"
							sx={{
								maxWidth: "90%",
								height: "auto",
								"& .MuiChip-label": {
									whiteSpace: "normal",
									py: 0.5,
								},
								color: "text.secondary",
								borderColor: "divider",
								fontSize: "0.75rem",
							}}
						/>
					) : (
						<Box
							sx={{
								bgcolor: "action.hover",
								borderRadius: 2,
								px: 2,
								py: 1,
								maxWidth: "90%",
							}}
						>
							<Typography
								variant="caption"
								color="primary"
								sx={{ fontWeight: 600, mb: 0.5, display: "block" }}
							>
								AI Assistant
							</Typography>
							<Typography variant="body2">{msg.content}</Typography>
						</Box>
					)}
				</Box>
			))}
		</Box>
	);
}

function StrategyCard({
	strategy,
	onToggle,
	onDelete,
	onViewDetails,
}: {
	strategy: Strategy;
	onToggle: () => void;
	onDelete: () => void;
	onViewDetails: () => void;
}) {
	const { anchorRef, handleClose, handleOpen, menuProps, open } =
		useZoomAwareMenu();

	const backtest = strategy.backtestResults;
	const winRate = backtest?.winRate || 0;
	const isProfitable = (backtest?.totalPnlPercent ?? 0) >= 0;

	// Accent color: green for profitable active, red for losing active, muted for inactive
	const accentColor = !strategy.isActive
		? "text.disabled"
		: isProfitable
			? "success.main"
			: "error.main";

	// Source label
	const sourceLabel = strategy.autoDiscovered
		? "AI Extracted"
		: strategy.sourceUrl
			? "URL Import"
			: "Manual";

	return (
		<Card
			component={motion.div}
			whileHover={{
				y: -4,
				transition: { type: "spring", stiffness: 400, damping: 30 },
			}}
			whileTap={{ scale: 0.98 }}
			sx={{
				height: "100%",
				borderTop: "3px solid",
				borderColor: accentColor,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<CardContent
				sx={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					p: 2.5,
					"&:last-child": { pb: 2 },
				}}
			>
				{/* Header: Name + menu */}
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						mb: 1,
					}}
				>
					<Typography variant="subtitle1" fontWeight={700} sx={{ pr: 1 }}>
						{strategy.name}
					</Typography>
					<Box ref={anchorRef}>
						<IconButton size="small" onClick={handleOpen}>
							<MoreVertIcon fontSize="small" />
						</IconButton>
					</Box>
					<Menu open={open} onClose={handleClose} {...menuProps}>
						<MenuItem
							onClick={() => {
								handleClose();
								onViewDetails();
							}}
						>
							<InfoIcon sx={{ mr: 1, fontSize: 18 }} /> View Details
						</MenuItem>
						<MenuItem
							onClick={() => {
								handleClose();
								onToggle();
							}}
						>
							{strategy.isActive ? (
								<>
									<StopIcon sx={{ mr: 1, fontSize: 18 }} /> Deactivate
								</>
							) : (
								<>
									<PlayArrowIcon sx={{ mr: 1, fontSize: 18 }} /> Activate
								</>
							)}
						</MenuItem>
						<MenuItem
							sx={{ color: "error.main" }}
							onClick={() => {
								handleClose();
								onDelete();
							}}
						>
							<DeleteIcon sx={{ mr: 1, fontSize: 18 }} /> Delete
						</MenuItem>
					</Menu>
				</Box>

				{/* Status + source chips */}
				<Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 1.5 }}>
					<Chip
						label={strategy.isActive ? "Active" : "Inactive"}
						size="small"
						color={strategy.isActive ? "success" : "default"}
					/>
					<Chip label={sourceLabel} size="small" variant="outlined" />
				</Box>

				{/* Description */}
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{
						mb: 1.5,
						minHeight: 36,
						display: "-webkit-box",
						WebkitLineClamp: 2,
						WebkitBoxOrient: "vertical",
						overflow: "hidden",
					}}
				>
					{strategy.description || "No description"}
				</Typography>

				{/* Symbol + timeframe chips */}
				<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>
					{strategy.symbols?.slice(0, 3).map((s) => (
						<Chip key={s} label={s} size="small" variant="outlined" />
					))}
					{strategy.timeframes?.slice(0, 2).map((t) => (
						<Chip
							key={t}
							label={t}
							size="small"
							variant="outlined"
							color="primary"
						/>
					))}
				</Box>

				{/* Performance section */}
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 2,
						flex: 1,
					}}
				>
					{/* Win Rate gauge */}
					<PerformanceGauge
						value={winRate}
						label="Win Rate"
						size={64}
						thickness={5}
					/>

					{/* Metrics grid */}
					{backtest && (
						<Box
							sx={{
								display: "grid",
								gridTemplateColumns: "repeat(3, 1fr)",
								gap: 1,
								flex: 1,
							}}
						>
							<Box>
								<Typography variant="caption" color="text.secondary">
									Trades
								</Typography>
								<Typography variant="body2" fontWeight={700}>
									{backtest.totalTrades}
								</Typography>
							</Box>
							<Box>
								<Typography variant="caption" color="text.secondary">
									P&L
								</Typography>
								<Typography
									variant="body2"
									fontWeight={700}
									color={isProfitable ? "success.main" : "error.main"}
								>
									{formatPercent(backtest.totalPnlPercent)}
								</Typography>
							</Box>
							<Box>
								<Typography variant="caption" color="text.secondary">
									Max DD
								</Typography>
								<Typography variant="body2" fontWeight={700} color="error.main">
									{formatPercent(-backtest.maxDrawdown)}
								</Typography>
							</Box>
							{backtest.sharpeRatio != null && (
								<Box>
									<Typography variant="caption" color="text.secondary">
										Sharpe
									</Typography>
									<Typography
										variant="body2"
										fontWeight={700}
										color={
											backtest.sharpeRatio >= 1.5
												? "success.main"
												: "text.primary"
										}
									>
										{backtest.sharpeRatio.toFixed(2)}
									</Typography>
								</Box>
							)}
							<Box>
								<Typography variant="caption" color="text.secondary">
									Profit Factor
								</Typography>
								<Typography
									variant="body2"
									fontWeight={700}
									color={
										backtest.profitFactor >= 2 ? "success.main" : "text.primary"
									}
								>
									{backtest.profitFactor.toFixed(1)}
								</Typography>
							</Box>
						</Box>
					)}
				</Box>

				{/* Bottom: toggle + view */}
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						mt: 2,
						pt: 1.5,
						borderTop: 1,
						borderColor: "divider",
					}}
				>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
						<Switch
							checked={strategy.isActive}
							onChange={onToggle}
							size="small"
							color="success"
						/>
						<Typography
							variant="caption"
							color={strategy.isActive ? "success.main" : "text.secondary"}
							fontWeight={500}
						>
							{strategy.isActive ? "Active" : "Inactive"}
						</Typography>
					</Box>
					<Typography
						variant="body2"
						color="primary"
						sx={{
							cursor: "pointer",
							"&:hover": { textDecoration: "underline" },
						}}
						onClick={onViewDetails}
					>
						View
					</Typography>
				</Box>
			</CardContent>
		</Card>
	);
}
