/**
 * Decision History Panel Component
 * Filterable list of agent decisions with expandable details
 */

import AnalyticsIcon from "@mui/icons-material/Analytics";
import ArticleIcon from "@mui/icons-material/Article";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FilterListIcon from "@mui/icons-material/FilterList";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import NotificationsIcon from "@mui/icons-material/Notifications";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TuneIcon from "@mui/icons-material/Tune";
import WarningIcon from "@mui/icons-material/Warning";
import {
	Badge,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	type ChipProps,
	Collapse,
	Divider,
	FormControl,
	IconButton,
	InputLabel,
	LinearProgress,
	MenuItem,
	Skeleton,
	Stack,
	Typography,
} from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import type {
	AgentDecisionSummary,
	DecisionAction,
	DecisionFilters,
	DecisionStatus,
	DecisionType,
} from "@/types/session";

// Icon mappings
const actionIcons: Record<DecisionAction, React.ElementType> = {
	buy: TrendingUpIcon,
	sell: TrendingDownIcon,
	hold: PauseCircleIcon,
	wait: HourglassEmptyIcon,
	close: CloseIcon,
};

const typeIcons: Record<DecisionType, React.ElementType> = {
	analysis: AnalyticsIcon,
	recommendation: LightbulbIcon,
	trade_execution: SwapHorizIcon,
	risk_alert: WarningIcon,
	news_insight: ArticleIcon,
	monitoring_alert: NotificationsIcon,
	task_modification: TuneIcon,
};

interface DecisionHistoryPanelProps {
	decisions: AgentDecisionSummary[];
	symbols: string[];
	isLoading?: boolean;
	onLoadMore?: () => void;
	hasMore?: boolean;
	onDecisionClick?: (decisionId: string) => void;
	onConfirmDecision?: (decisionId: string) => void;
	onRejectDecision?: (decisionId: string) => void;
	onFeedback?: (
		decisionId: string,
		feedback: "thumbs_up" | "thumbs_down",
	) => void;
	filters: DecisionFilters;
	onFiltersChange: (filters: DecisionFilters) => void;
}

interface DecisionCardProps {
	decision: AgentDecisionSummary;
	onExpand?: () => void;
	onConfirm?: () => void;
	onReject?: () => void;
	onFeedback?: (feedback: "thumbs_up" | "thumbs_down") => void;
}

function DecisionHistoryCard({
	decision,
	onExpand,
	onConfirm,
	onReject,
	onFeedback,
}: DecisionCardProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	const TypeIcon = typeIcons[decision.decisionType] || AnalyticsIcon;
	const ActionIcon = decision.action ? actionIcons[decision.action] : null;

	// Color based on action
	const getActionColor = (action?: DecisionAction): ChipProps["color"] => {
		switch (action) {
			case "buy":
				return "success";
			case "sell":
				return "error";
			case "hold":
				return "info";
			case "wait":
				return "warning";
			case "close":
				return "secondary";
			default:
				return "default";
		}
	};

	const getStatusColor = (status: DecisionStatus): ChipProps["color"] => {
		switch (status) {
			case "pending":
				return "warning";
			case "confirmed":
				return "info";
			case "executed":
				return "success";
			case "rejected":
				return "error";
			case "expired":
				return "default";
			default:
				return "default";
		}
	};

	const actionColor = getActionColor(decision.action);
	const isPending = decision.status === "pending";

	return (
		<Card
			component={motion.div}
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			sx={{
				mb: 1.5,
				border: isPending ? 2 : 1,
				borderColor: isPending ? "warning.main" : "divider",
				bgcolor: isPending
					? (theme) => `rgba(${theme.trading.semanticRgb.warning}, 0.05)`
					: "background.paper",
			}}
		>
			<CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
				{/* Header Row */}
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
					<TypeIcon fontSize="small" color="action" />

					{decision.symbol && (
						<Chip label={decision.symbol} size="small" variant="outlined" />
					)}

					{decision.action && ActionIcon && (
						<Chip
							icon={<ActionIcon fontSize="small" />}
							label={decision.action.toUpperCase()}
							size="small"
							color={actionColor}
							variant="filled"
						/>
					)}

					<Chip
						label={decision.status}
						size="small"
						color={getStatusColor(decision.status)}
						variant="outlined"
						sx={{ ml: "auto" }}
					/>

					<IconButton size="small" onClick={() => setIsExpanded(!isExpanded)}>
						{isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
					</IconButton>
				</Box>

				{/* Summary */}
				<Typography variant="body2" color="text.primary" sx={{ mb: 1 }}>
					{decision.summary}
				</Typography>

				{/* Confidence Bar */}
				{decision.confidence != null && (
					<Box sx={{ mb: 1 }}>
						<Box
							sx={{
								display: "flex",
								justifyContent: "space-between",
								mb: 0.25,
							}}
						>
							<Typography variant="caption" color="text.secondary">
								Confidence
							</Typography>
							<Typography
								variant="caption"
								fontWeight={600}
								color={
									decision.confidence >= 70
										? "success.main"
										: decision.confidence >= 40
											? "warning.main"
											: "error.main"
								}
							>
								{decision.confidence.toFixed(0)}%
							</Typography>
						</Box>
						<LinearProgress
							variant="determinate"
							value={decision.confidence}
							color={
								decision.confidence >= 70
									? "success"
									: decision.confidence >= 40
										? "warning"
										: "error"
							}
							sx={{ height: 4, borderRadius: 2 }}
						/>
					</Box>
				)}

				{/* Timestamp */}
				<Typography variant="caption" color="text.disabled">
					{new Date(decision.createdAt).toLocaleString()}
				</Typography>

				{/* Expanded Details */}
				<Collapse in={isExpanded}>
					<Divider sx={{ my: 1.5 }} />

					{/* Action buttons for pending decisions */}
					{isPending && (
						<Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
							<Button
								variant="contained"
								color="success"
								size="small"
								onClick={onConfirm}
								fullWidth
							>
								Confirm
							</Button>
							<Button
								variant="outlined"
								color="error"
								size="small"
								onClick={onReject}
								fullWidth
							>
								Reject
							</Button>
						</Stack>
					)}

					{/* Feedback buttons */}
					{decision.status === "executed" && onFeedback && (
						<Box sx={{ display: "flex", gap: 1, mb: 1 }}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ alignSelf: "center" }}
							>
								Was this helpful?
							</Typography>
							<IconButton
								size="small"
								onClick={() => onFeedback("thumbs_up")}
								color="success"
							>
								<ThumbUpIcon fontSize="small" />
							</IconButton>
							<IconButton
								size="small"
								onClick={() => onFeedback("thumbs_down")}
								color="error"
							>
								<ThumbDownIcon fontSize="small" />
							</IconButton>
						</Box>
					)}

					{/* View full details link */}
					<Button
						size="small"
						endIcon={<OpenInNewIcon fontSize="small" />}
						onClick={onExpand}
						sx={{ mt: 0.5 }}
					>
						View Full Details
					</Button>
				</Collapse>
			</CardContent>
		</Card>
	);
}

function DecisionHistorySkeleton() {
	return (
		<>
			{[1, 2, 3].map((i) => (
				<Card key={i} sx={{ mb: 1.5 }}>
					<CardContent sx={{ py: 1.5 }}>
						<Box sx={{ display: "flex", gap: 1, mb: 1 }}>
							<Skeleton variant="circular" width={24} height={24} />
							<Skeleton variant="rounded" width={60} height={24} />
							<Skeleton variant="rounded" width={50} height={24} />
							<Skeleton
								variant="rounded"
								width={70}
								height={24}
								sx={{ ml: "auto" }}
							/>
						</Box>
						<Skeleton variant="text" width="90%" />
						<Skeleton variant="text" width="60%" />
						<Skeleton variant="rounded" height={4} sx={{ mt: 1 }} />
					</CardContent>
				</Card>
			))}
		</>
	);
}

export function DecisionHistoryPanel({
	decisions,
	symbols,
	isLoading = false,
	onLoadMore,
	hasMore = false,
	onDecisionClick,
	onConfirmDecision,
	onRejectDecision,
	onFeedback,
	filters,
	onFiltersChange,
}: DecisionHistoryPanelProps) {
	const [showFilters, setShowFilters] = useState(false);

	const activeFilterCount = Object.values(filters).filter(Boolean).length;

	const handleFilterChange = (
		key: keyof DecisionFilters,
		value: string | undefined,
	) => {
		onFiltersChange({
			...filters,
			[key]: value || undefined,
		});
	};

	const clearFilters = () => {
		onFiltersChange({});
	};

	return (
		<Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
			{/* Header */}
			<Box
				sx={{
					p: 2,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					borderBottom: 1,
					borderColor: "divider",
				}}
			>
				<Typography variant="subtitle1" fontWeight={600}>
					Decision History
				</Typography>
				<Badge badgeContent={activeFilterCount} color="primary">
					<IconButton size="small" onClick={() => setShowFilters(!showFilters)}>
						<FilterListIcon />
					</IconButton>
				</Badge>
			</Box>

			{/* Filters */}
			<Collapse in={showFilters}>
				<Box sx={{ p: 2, bgcolor: "action.hover" }}>
					<Stack spacing={2}>
						<FormControl size="small" fullWidth>
							<InputLabel>Type</InputLabel>
							<ZoomAwareSelect
								value={filters.decisionType || ""}
								label="Type"
								onChange={(e) =>
									handleFilterChange(
										"decisionType",
										e.target.value as DecisionType,
									)
								}
							>
								<MenuItem value="">All Types</MenuItem>
								<MenuItem value="analysis">Analysis</MenuItem>
								<MenuItem value="recommendation">Recommendation</MenuItem>
								<MenuItem value="trade_execution">Trade</MenuItem>
								<MenuItem value="risk_alert">Risk Alert</MenuItem>
								<MenuItem value="news_insight">News</MenuItem>
								<MenuItem value="monitoring_alert">Alert</MenuItem>
							</ZoomAwareSelect>
						</FormControl>

						<FormControl size="small" fullWidth>
							<InputLabel>Symbol</InputLabel>
							<ZoomAwareSelect
								value={filters.symbol || ""}
								label="Symbol"
								onChange={(e) => handleFilterChange("symbol", e.target.value)}
							>
								<MenuItem value="">All Symbols</MenuItem>
								{symbols.map((symbol) => (
									<MenuItem key={symbol} value={symbol}>
										{symbol}
									</MenuItem>
								))}
							</ZoomAwareSelect>
						</FormControl>

						<FormControl size="small" fullWidth>
							<InputLabel>Action</InputLabel>
							<ZoomAwareSelect
								value={filters.action || ""}
								label="Action"
								onChange={(e) =>
									handleFilterChange("action", e.target.value as DecisionAction)
								}
							>
								<MenuItem value="">All Actions</MenuItem>
								<MenuItem value="buy">Buy</MenuItem>
								<MenuItem value="sell">Sell</MenuItem>
								<MenuItem value="hold">Hold</MenuItem>
								<MenuItem value="wait">Wait</MenuItem>
								<MenuItem value="close">Close</MenuItem>
							</ZoomAwareSelect>
						</FormControl>

						<FormControl size="small" fullWidth>
							<InputLabel>Status</InputLabel>
							<ZoomAwareSelect
								value={filters.status || ""}
								label="Status"
								onChange={(e) =>
									handleFilterChange("status", e.target.value as DecisionStatus)
								}
							>
								<MenuItem value="">All Statuses</MenuItem>
								<MenuItem value="pending">Pending</MenuItem>
								<MenuItem value="confirmed">Confirmed</MenuItem>
								<MenuItem value="executed">Executed</MenuItem>
								<MenuItem value="rejected">Rejected</MenuItem>
								<MenuItem value="expired">Expired</MenuItem>
							</ZoomAwareSelect>
						</FormControl>

						{activeFilterCount > 0 && (
							<Button size="small" onClick={clearFilters}>
								Clear Filters
							</Button>
						)}
					</Stack>
				</Box>
				<Divider />
			</Collapse>

			{/* Decision List */}
			<Box sx={{ flexGrow: 1, overflow: "auto", p: 2 }}>
				{isLoading ? (
					<DecisionHistorySkeleton />
				) : decisions.length === 0 ? (
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							height: "100%",
							color: "text.secondary",
						}}
					>
						<AnalyticsIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
						<Typography variant="body2" textAlign="center">
							No decisions found
						</Typography>
						{activeFilterCount > 0 && (
							<Typography
								variant="caption"
								textAlign="center"
								color="text.disabled"
							>
								Try adjusting your filters
							</Typography>
						)}
					</Box>
				) : (
					<AnimatePresence>
						{decisions.map((decision) => (
							<DecisionHistoryCard
								key={decision.id}
								decision={decision}
								onExpand={() => onDecisionClick?.(decision.id)}
								onConfirm={() => onConfirmDecision?.(decision.id)}
								onReject={() => onRejectDecision?.(decision.id)}
								onFeedback={(feedback) => onFeedback?.(decision.id, feedback)}
							/>
						))}
					</AnimatePresence>
				)}

				{/* Load More */}
				{hasMore && !isLoading && (
					<Box sx={{ textAlign: "center", mt: 2 }}>
						<Button variant="outlined" size="small" onClick={onLoadMore}>
							Load More
						</Button>
					</Box>
				)}
			</Box>
		</Box>
	);
}

export default DecisionHistoryPanel;
