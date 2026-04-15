/**
 * Expandable tool call block — shows tool name, key arguments,
 * execution time, and (on expand) full arguments + result summary.
 *
 * Special-case renderer: `delegate_to_extractor` tool calls emitted by the
 * strategy auto-discovery orchestrator render as an "Open extractor session"
 * card instead of a generic expandable row.
 */

import BuildIcon from "@mui/icons-material/Build";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SubdirectoryArrowRightIcon from "@mui/icons-material/SubdirectoryArrowRight";
import { Box, Chip, Collapse, Divider, Typography } from "@mui/material";
import { useState } from "react";
import type { ToolCall } from "@/api/websocket/useAgentSocket";
import { StatusChip } from "@/components/common/StatusChip";

/** Strip MCP prefix and convert snake_case tool names to human labels. */
export function humanizeToolName(name: string): string {
	const TOOL_LABELS: Record<string, string> = {
		get_ticker: "Fetching price",
		get_technical_indicators: "Analyzing indicators",
		get_orderbook: "Reading order book",
		get_candlesticks: "Loading candles",
		detect_chart_patterns: "Detecting patterns",
		get_onchain_metrics: "On-chain metrics",
		get_macro_indicators: "Macro indicators",
		get_latest_news: "Fetching news",
		get_news_sentiment: "Analyzing sentiment",
		search_strategies: "Searching strategies",
		search_lessons: "Searching lessons",
		search_patterns: "Searching patterns",
		list_user_strategies: "Listing strategies",
		toggle_strategy: "Toggling strategy",
		get_account_balance: "Checking balance",
		get_open_orders: "Loading orders",
		place_order: "Placing order",
		cancel_order: "Cancelling order",
		submit_recommendation: "Submitting recommendation",
		modify_task: "Modifying task",
		ask_user: "Asking user",
		search_web: "Searching web",
		search_news: "Searching news",
		fetch_article: "Fetching article",
		list_configured_sources: "Listing sources",
		has_been_extracted: "Checking dedup memory",
		submit_candidates: "Submitting candidates",
		delegate_to_extractor: "Delegating extraction",
	};

	const stripped = name
		.replace(/^mcp__trading__/, "")
		.replace(/^mcp__strategy_explorer__/, "");
	return TOOL_LABELS[stripped] || stripped.replaceAll("_", " ");
}

function isDelegationTool(name: string): boolean {
	const stripped = name
		.replace(/^mcp__trading__/, "")
		.replace(/^mcp__strategy_explorer__/, "");
	return stripped === "delegate_to_extractor";
}

interface DelegationResult {
	session_id?: string | null;
	article_url?: string;
	article_title?: string;
	status?: "running" | "ok" | "failed" | "skipped" | "skipped_low_confidence";
}

function DelegationCard({ toolCall }: { toolCall: ToolCall }) {
	const result = (toolCall.result ?? {}) as DelegationResult;
	const args = toolCall.arguments as {
		article_title?: string;
		article_url?: string;
	};

	const title = result.article_title || args.article_title || "extraction";
	const url = result.article_url || args.article_url || "";
	const status = result.status ?? "running";

	return (
		<Box
			sx={{
				border: "1px solid",
				borderColor: "primary.main",
				borderRadius: 1,
				px: 1.5,
				py: 1,
				bgcolor: "action.hover",
			}}
		>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
				<SubdirectoryArrowRightIcon
					sx={{ fontSize: 16, color: "primary.main" }}
				/>
				<Typography variant="caption" fontWeight={600}>
					Delegating extraction
				</Typography>
				<StatusChip status={status} />
			</Box>
			<Typography variant="body2" sx={{ mb: 0.25, fontWeight: 500 }}>
				{title}
			</Typography>
			{url && (
				<Typography
					variant="caption"
					color="text.secondary"
					sx={(theme) => ({
						fontFamily: theme.trading.mono,
						fontSize: "0.7rem",
						display: "block",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					})}
				>
					{url}
				</Typography>
			)}
		</Box>
	);
}

/** Pick the most meaningful argument to display inline. */
function getKeyArgument(args: Record<string, unknown>): string | null {
	if (args.symbol) return `${args.symbol}`;
	if (args.query) return String(args.query).slice(0, 50);
	if (args.assets && Array.isArray(args.assets))
		return (args.assets as string[]).join(", ");
	if (args.strategy_id) return `strategy: ${args.strategy_id}`;
	if (args.order_id) return `order: ${args.order_id}`;

	const firstKey = Object.keys(args)[0];
	if (firstKey) {
		const val = args[firstKey];
		return `${firstKey}: ${String(val).slice(0, 30)}`;
	}
	return null;
}

interface ToolCallBlockProps {
	toolCall: ToolCall;
	forceExpanded?: boolean;
}

export function ToolCallBlock({ toolCall, forceExpanded }: ToolCallBlockProps) {
	const [localExpanded, setLocalExpanded] = useState(false);
	const expanded = forceExpanded ?? localExpanded;

	if (isDelegationTool(toolCall.name)) {
		return <DelegationCard toolCall={toolCall} />;
	}

	const keyArg = getKeyArgument(toolCall.arguments);
	const hasError = toolCall.resultSummary?.startsWith("Error:");
	const hasResult = Boolean(toolCall.resultSummary);

	return (
		<Box
			sx={{
				border: "1px solid",
				borderColor: "divider",
				borderRadius: 1,
				overflow: "hidden",
				bgcolor: "background.default",
			}}
		>
			{/* Collapsed header row */}
			<Box
				onClick={() => setLocalExpanded((prev) => !prev)}
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 0.75,
					px: 1.5,
					py: 0.75,
					cursor: "pointer",
					"&:hover": { bgcolor: "action.hover" },
					transition: "background-color 0.15s",
				}}
			>
				{hasError ? (
					<ErrorOutlineIcon
						sx={{ fontSize: 16, color: "error.main", flexShrink: 0 }}
					/>
				) : hasResult ? (
					<CheckCircleOutlineIcon
						sx={{ fontSize: 16, color: "success.main", flexShrink: 0 }}
					/>
				) : (
					<BuildIcon
						sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }}
					/>
				)}

				<Typography variant="caption" fontWeight={600} sx={{ flexShrink: 0 }}>
					{humanizeToolName(toolCall.name)}
				</Typography>

				{keyArg && (
					<Typography
						variant="caption"
						color="text.secondary"
						sx={(theme) => ({
							fontFamily: theme.trading.mono,
							fontSize: "0.7rem",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						})}
					>
						{keyArg}
					</Typography>
				)}

				<Box sx={{ flex: 1 }} />

				{toolCall.executionTimeMs != null && (
					<Chip
						label={`${toolCall.executionTimeMs}ms`}
						size="small"
						variant="outlined"
						sx={{
							fontSize: "0.65rem",
							height: 20,
							"& .MuiChip-label": { px: 0.75 },
						}}
					/>
				)}

				{expanded ? (
					<ExpandLessIcon sx={{ fontSize: 18, color: "text.secondary" }} />
				) : (
					<ExpandMoreIcon sx={{ fontSize: 18, color: "text.secondary" }} />
				)}
			</Box>

			{/* Expanded details */}
			<Collapse in={expanded}>
				<Divider />
				<Box sx={{ px: 1.5, py: 1 }}>
					{/* Arguments */}
					{Object.keys(toolCall.arguments).length > 0 && (
						<>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: "block", mb: 0.5 }}
							>
								Arguments
							</Typography>
							<Box
								component="pre"
								sx={(theme) => ({
									fontSize: "0.72rem",
									fontFamily: theme.trading.mono,
									bgcolor: "action.hover",
									p: 1,
									borderRadius: 1,
									overflow: "auto",
									maxHeight: 200,
									m: 0,
									whiteSpace: "pre-wrap",
									wordBreak: "break-word",
								})}
							>
								{JSON.stringify(toolCall.arguments, null, 2)}
							</Box>
						</>
					)}

					{/* Result summary */}
					{toolCall.resultSummary && (
						<Box sx={{ mt: 1 }}>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: "block", mb: 0.25 }}
							>
								Result
							</Typography>
							<Typography
								variant="body2"
								sx={{
									fontSize: "0.8rem",
									color: hasError ? "error.main" : "text.primary",
								}}
							>
								{toolCall.resultSummary}
							</Typography>
						</Box>
					)}
				</Box>
			</Collapse>
		</Box>
	);
}

export default ToolCallBlock;
