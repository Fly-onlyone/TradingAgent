/**
 * Thinking Indicator -- shown inline while the agent processes a request.
 *
 * Displays animated dots, collapsible reasoning text, and tool-call chips
 * that animate in as tools are invoked.
 */

import { Bot, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { ToolCall } from "@/api/websocket/useAgentSocket";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
			<div className="mb-4 flex gap-3">
				<Avatar size="sm" className="shrink-0 bg-[var(--secondary)]">
					<AvatarFallback className="bg-[var(--secondary)] text-white">
						<Bot className="size-4" />
					</AvatarFallback>
				</Avatar>

				<div className="max-w-[80%] min-w-0">
					<div className="mb-1 flex items-center gap-2">
						<span className="text-xs font-semibold">Agent</span>
					</div>

					<div className="rounded-lg rounded-tl-[4px] rounded-tr-2xl bg-card p-4">
						{/* Animated dots */}
						<div
							className={
								"flex items-end gap-1" +
								(thinkingContent || toolCalls.length > 0
									? " mb-3"
									: "")
							}
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
									<div className="size-2 rounded-full bg-[var(--primary)]" />
								</motion.div>
							))}
							<span className="ml-2 text-xs text-muted-foreground">
								Thinking...
							</span>
						</div>

						{/* Shimmer bar */}
						<div
							className={
								"h-0.5 rounded-full" +
								(thinkingContent || toolCalls.length > 0
									? " mb-2"
									: "")
							}
							style={{
								background:
									"linear-gradient(90deg, transparent 0%, rgba(var(--primary-rgb), 0.4) 50%, transparent 100%)",
								backgroundSize: "200% 100%",
								animation:
									"shimmerSlide 1.5s ease-in-out infinite",
							}}
						/>

						{/* Thinking / reasoning text */}
						{thinkingContent && showThinkingContent && (
							<div
								className={
									toolCalls.length > 0 ? "mb-3" : ""
								}
							>
								<button
									type="button"
									className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
									onClick={() =>
										setShowReasoning((v) => !v)
									}
								>
									{showReasoning
										? "Hide reasoning"
										: "Show reasoning"}
								</button>

								<AnimatePresence>
									{showReasoning && (
										<motion.div
											initial={{
												height: 0,
												opacity: 0,
											}}
											animate={{
												height: "auto",
												opacity: 1,
											}}
											exit={{
												height: 0,
												opacity: 0,
											}}
											transition={{ duration: 0.2 }}
											style={{ overflow: "hidden" }}
										>
											<div className="mt-2 max-h-[200px] overflow-auto rounded bg-muted p-3">
												<p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
													{thinkingContent}
												</p>
											</div>
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						)}

						{/* Tool call chips */}
						{toolCalls.length > 0 && (
							<div className="flex flex-wrap gap-1">
								<AnimatePresence>
									{toolCalls.map((tc) => (
										<motion.div
											key={tc.id}
											initial={{
												opacity: 0,
												scale: 0.5,
												x: -20,
											}}
											animate={{
												opacity: 1,
												scale: 1,
												x: 0,
											}}
											transition={spring.bouncy}
										>
											<Badge
												variant="secondary"
												className="gap-1 text-[0.7rem]"
											>
												<Wrench className="size-3" />
												{humanizeToolName(tc.name)}
											</Badge>
										</motion.div>
									))}
								</AnimatePresence>
							</div>
						)}
					</div>
				</div>
			</div>
		</motion.div>
	);
}

export default ThinkingIndicator;
