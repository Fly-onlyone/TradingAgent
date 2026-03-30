/**
 * Thinking Indicator — shown inline while the agent processes a request.
 *
 * Displays animated dots, collapsible reasoning text, and tool-call chips
 * that animate in as tools are invoked.
 */

import BuildIcon from "@mui/icons-material/Build";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import {
	Avatar,
	Box,
	Chip,
	Link,
	Paper,
	type Theme,
	Typography,
} from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { ToolCall } from "@/api/websocket/useAgentSocket";
import { spring } from "@/utils/animations/variants";

/** Strip MCP prefix and convert snake_case tool names to human labels. */
function humanizeToolName(name: string): string {
	const TOOL_LABELS: Record<string, string> = {
		get_market_price: "Fetching price",
		get_technical_indicators: "Analyzing indicators",
		get_order_book: "Reading order book",
		get_recent_trades: "Checking trades",
		get_klines: "Loading candles",
		place_order: "Placing order",
		get_account_balance: "Checking balance",
		get_positions: "Checking positions",
		cancel_order: "Cancelling order",
		get_open_orders: "Loading orders",
		search_knowledge: "Searching knowledge",
		get_news: "Fetching news",
		analyze_sentiment: "Analyzing sentiment",
	};

	// Strip common MCP prefixes
	const stripped = name.replace(/^mcp__trading__/, "");
	return TOOL_LABELS[stripped] || stripped.replaceAll("_", " ");
}

interface ThinkingIndicatorProps {
	toolCalls: ToolCall[];
	thinkingContent: string;
	showThinkingContent?: boolean;
}

export function ThinkingIndicator({
	toolCalls,
	thinkingContent,
	showThinkingContent = true,
}: ThinkingIndicatorProps) {
	const [showReasoning, setShowReasoning] = useState(false);

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -5 }}
			transition={{ duration: 0.15 }}
		>
			<Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
				<Avatar
					sx={{
						width: 36,
						height: 36,
						bgcolor: "secondary.main",
						flexShrink: 0,
					}}
				>
					<SmartToyIcon />
				</Avatar>

				<Box sx={{ maxWidth: "80%", minWidth: 0 }}>
					<Box sx={{ display: "flex", gap: 1, mb: 0.5, alignItems: "center" }}>
						<Typography variant="caption" fontWeight={600}>
							Agent
						</Typography>
					</Box>

					<Paper
						sx={{
							p: 2,
							bgcolor: "background.paper",
							borderRadius: 2,
							borderTopLeftRadius: 4,
							borderTopRightRadius: 16,
						}}
					>
						{/* Animated dots */}
						<Box
							sx={{
								display: "flex",
								gap: 0.5,
								alignItems: "flex-end",
								mb: thinkingContent || toolCalls.length > 0 ? 1.5 : 0,
							}}
						>
							{[0, 1, 2].map((i) => (
								<motion.div
									key={i}
									animate={{ y: [0, -8, 0] }}
									transition={{
										duration: 0.6,
										repeat: Infinity,
										delay: i * 0.15,
										ease: "easeInOut",
									}}
								>
									<Box
										sx={{
											width: 8,
											height: 8,
											borderRadius: "50%",
											bgcolor: "primary.main",
										}}
									/>
								</motion.div>
							))}
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ ml: 1 }}
							>
								Thinking...
							</Typography>
						</Box>

						{/* Shimmer bar */}
						<Box
							sx={{
								height: 2,
								borderRadius: 1,
								mb: thinkingContent || toolCalls.length > 0 ? 1 : 0,
								background: (theme: Theme) =>
									`linear-gradient(90deg, transparent 0%, ${theme.palette.primary.main}66 50%, transparent 100%)`,
								backgroundSize: "200% 100%",
								animation: "shimmerSlide 1.5s ease-in-out infinite",
								"@keyframes shimmerSlide": {
									"0%": { backgroundPosition: "200% 0" },
									"100%": { backgroundPosition: "-200% 0" },
								},
							}}
						/>

						{/* Thinking / reasoning text */}
						{thinkingContent && showThinkingContent && (
							<Box sx={{ mb: toolCalls.length > 0 ? 1.5 : 0 }}>
								<Link
									component="button"
									variant="caption"
									underline="hover"
									onClick={() => setShowReasoning((v) => !v)}
									sx={{ color: "text.secondary", cursor: "pointer" }}
								>
									{showReasoning ? "Hide reasoning" : "Show reasoning"}
								</Link>

								<AnimatePresence>
									{showReasoning && (
										<motion.div
											initial={{ height: 0, opacity: 0 }}
											animate={{ height: "auto", opacity: 1 }}
											exit={{ height: 0, opacity: 0 }}
											transition={{ duration: 0.2 }}
											style={{ overflow: "hidden" }}
										>
											<Box
												sx={{
													mt: 1,
													p: 1.5,
													maxHeight: 200,
													overflow: "auto",
													bgcolor: "action.hover",
													borderRadius: 1,
												}}
											>
												<Typography
													variant="body2"
													sx={{
														whiteSpace: "pre-wrap",
														color: "text.secondary",
														fontSize: "0.8rem",
														lineHeight: 1.6,
													}}
												>
													{thinkingContent}
												</Typography>
											</Box>
										</motion.div>
									)}
								</AnimatePresence>
							</Box>
						)}

						{/* Tool call chips */}
						{toolCalls.length > 0 && (
							<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
								<AnimatePresence>
									{toolCalls.map((tc) => (
										<motion.div
											key={tc.id}
											initial={{ opacity: 0, scale: 0.5, x: -20 }}
											animate={{ opacity: 1, scale: 1, x: 0 }}
											transition={spring.bouncy}
										>
											<Chip
												icon={
													<BuildIcon sx={{ fontSize: "0.85rem !important" }} />
												}
												label={humanizeToolName(tc.name)}
												size="small"
												color="secondary"
												variant="outlined"
												sx={{ fontSize: "0.7rem" }}
											/>
										</motion.div>
									))}
								</AnimatePresence>
							</Box>
						)}
					</Paper>
				</Box>
			</Box>
		</motion.div>
	);
}

export default ThinkingIndicator;
