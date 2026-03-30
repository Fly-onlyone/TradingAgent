/**
 * Strategies List Page
 */

import AddIcon from "@mui/icons-material/Add";
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
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Grid2 as Grid,
	IconButton,
	Menu,
	MenuItem,
	Switch,
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
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { StrategyDiscoveryCard } from "@/components/strategies/StrategyDiscoveryCard";
import { useZoomAwareMenu } from "@/hooks/useZoomAwareMenu";
import { notify } from "@/store/uiStore";
import type { Strategy, StrategyRiskParams, StrategyUpdate } from "@/types";
import { staggerCascade } from "@/utils/animations/variants";
import { formatPercent } from "@/utils/formatters";
import { requireAuth } from "../-guards";

export const Route = createFileRoute("/strategies/")({
	beforeLoad: requireAuth,
	component: StrategiesPage,
});

const STRATEGY_CARD_SKELETON_KEYS = Array.from(
	{ length: 3 },
	(_, index) => `strategy-card-skeleton-${index}`,
);

function StrategiesPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const {
		data: strategies,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["strategies"],
		queryFn: () => strategiesApi.getStrategies(),
	});

	const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
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
		if (filter === "active") return strategies.filter((s) => s.isActive);
		if (filter === "inactive") return strategies.filter((s) => !s.isActive);
		return strategies;
	}, [strategies, filter]);

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

	return (
		<PageTransition pageKey="strategies">
			<Box>
				<SectionHeader
					title="Strategies"
					subtitle="Manage automated trading strategies for the agent"
					action={
						<Button
							component={Link}
							to="/strategies/create"
							variant="contained"
							startIcon={<AddIcon />}
						>
							Import Strategy
						</Button>
					}
				/>

				<StrategyDiscoveryCard />

				<Box
					sx={{
						display: "flex",
						gap: 2,
						mb: 3,
						flexWrap: "wrap",
						alignItems: "center",
					}}
				>
					<Chip
						label="All"
						variant={filter === "all" ? "filled" : "outlined"}
						onClick={() => setFilter("all")}
					/>
					<Chip
						label="Active"
						color="success"
						variant={filter === "active" ? "filled" : "outlined"}
						onClick={() => setFilter("active")}
					/>
					<Chip
						label="Inactive"
						variant={filter === "inactive" ? "filled" : "outlined"}
						onClick={() => setFilter("inactive")}
					/>
				</Box>

				{isLoading ? (
					<Grid container spacing={3}>
						{STRATEGY_CARD_SKELETON_KEYS.map((key) => (
							<Grid key={key} size={{ xs: 12, md: 6, lg: 4 }}>
								<ShimmerSkeleton shimmerVariant="card" sx={{ height: 250 }} />
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
								<Grid key={strategy.id} size={{ xs: 12, md: 6, lg: 4 }}>
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
							{!editing && (
								<IconButton size="small" onClick={handleStartEdit} title="Edit">
									<EditIcon fontSize="small" />
								</IconButton>
							)}
							<IconButton size="small" onClick={handleClose} title="Close">
								<CloseIcon fontSize="small" />
							</IconButton>
						</Box>
					</DialogTitle>
					<DialogContent>
						{editing ? (
							<Box
								sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
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
								<Typography variant="body2" color="text.secondary" gutterBottom>
									{strategy.description || "No description"}
								</Typography>

								<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
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
										<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
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
										<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
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
											{Object.entries(strategy.entryRules).map(([key, val]) => (
												<Typography key={key} variant="body2" sx={{ ml: 1 }}>
													<strong>{key}:</strong> {String(val)}
												</Typography>
											))}
										</Box>
									)}

								{strategy.exitRules &&
									Object.keys(strategy.exitRules).length > 0 && (
										<Box sx={{ mt: 2 }}>
											<Typography variant="subtitle2" gutterBottom>
												Exit Rules
											</Typography>
											{Object.entries(strategy.exitRules).map(([key, val]) => (
												<Typography key={key} variant="body2" sx={{ ml: 1 }}>
													<strong>{key}:</strong> {String(val)}
												</Typography>
											))}
										</Box>
									)}

								{strategy.riskParams &&
									Object.keys(strategy.riskParams).length > 0 && (
										<Box sx={{ mt: 2 }}>
											<Typography variant="subtitle2" gutterBottom>
												Risk Parameters
											</Typography>
											{Object.entries(strategy.riskParams).map(([key, val]) => (
												<Typography key={key} variant="body2" sx={{ ml: 1 }}>
													<strong>{key}:</strong> {String(val)}
												</Typography>
											))}
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
											{formatPercent(strategy.backtestResults.totalPnlPercent)}
										</Typography>
										<Typography variant="body2">
											Max Drawdown:{" "}
											{formatPercent(-strategy.backtestResults.maxDrawdown)}
										</Typography>
									</Box>
								)}
							</>
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

	const winRate = strategy.backtestResults?.winRate || 0;

	return (
		<Card
			component={motion.div}
			whileHover={{
				y: -6,
				transition: { type: "spring", stiffness: 400, damping: 30 },
			}}
			whileTap={{ scale: 0.98 }}
			sx={{
				height: "100%",
				border: strategy.isActive ? "1px solid" : "none",
				borderColor: "success.main",
				boxShadow: strategy.isActive
					? (theme) =>
							`0 0 12px rgba(${theme.trading.semanticRgb.success}, 0.2)`
					: "none",
			}}
		>
			<CardContent>
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						mb: 2,
					}}
				>
					<Box>
						<Box
							sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}
						>
							<Typography variant="h6" fontWeight={600}>
								{strategy.name}
							</Typography>
							<Chip
								label={strategy.isActive ? "Active" : "Inactive"}
								size="small"
								color={strategy.isActive ? "success" : "default"}
							/>
						</Box>
						{strategy.symbol && (
							<Typography variant="body2" color="text.secondary">
								{strategy.symbol} | {strategy.timeframe}
							</Typography>
						)}
					</Box>
					<Box ref={anchorRef}>
						<IconButton size="small" onClick={handleOpen}>
							<MoreVertIcon />
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

				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ mb: 2, minHeight: 40 }}
				>
					{strategy.description || "No description"}
				</Typography>

				{/* Performance */}
				<Box sx={{ display: "flex", justifyContent: "space-around", mb: 2 }}>
					<PerformanceGauge
						value={winRate}
						label="Win Rate"
						size={80}
						thickness={6}
					/>
				</Box>

				{/* Stats */}
				{strategy.backtestResults && (
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: "repeat(3, 1fr)",
							gap: 1,
							p: 1.5,
							bgcolor: "background.default",
							borderRadius: 1,
						}}
					>
						<Box sx={{ textAlign: "center" }}>
							<Typography variant="caption" color="text.secondary">
								Trades
							</Typography>
							<Typography variant="body2" fontWeight={600}>
								{strategy.backtestResults.totalTrades}
							</Typography>
						</Box>
						<Box sx={{ textAlign: "center" }}>
							<Typography variant="caption" color="text.secondary">
								P&L
							</Typography>
							<Typography
								variant="body2"
								fontWeight={600}
								color={
									strategy.backtestResults.totalPnlPercent >= 0
										? "success.main"
										: "error.main"
								}
							>
								{formatPercent(strategy.backtestResults.totalPnlPercent)}
							</Typography>
						</Box>
						<Box sx={{ textAlign: "center" }}>
							<Typography variant="caption" color="text.secondary">
								Max DD
							</Typography>
							<Typography variant="body2" fontWeight={600} color="error.main">
								{formatPercent(-strategy.backtestResults.maxDrawdown)}
							</Typography>
						</Box>
					</Box>
				)}

				{/* Toggle */}
				<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
					<Switch
						checked={strategy.isActive}
						onChange={onToggle}
						color="success"
					/>
				</Box>
			</CardContent>
		</Card>
	);
}
