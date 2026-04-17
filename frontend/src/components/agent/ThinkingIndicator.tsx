/**
 * Thinking Indicator — shown inline while the agent processes a request.
 *
 * Displays animated dots, collapsible reasoning text, and tool-call chips
 * that animate in as tools are invoked.
 */

import BuildIcon from "@mui/icons-material/Build";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import {
	Avatar,
	Box,
	Chip,
	Paper,
	type Theme,
	Typography,
} from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import type { ToolCall } from "@/api/websocket/useAgentSocket";
import { spring } from "@/utils/animations/variants";
import { humanizeToolName } from "./ToolCallBlock";
import { ToolCallList } from "./ToolCallList";

interface ThinkingIndicatorProps {
	toolCalls: ToolCall[];
	thinkingContent: string;
	showThinkingContent?: boolean;
	expandAllTools?: boolean;
}

export function ThinkingIndicator({
	toolCalls,
	thinkingContent,
	showThinkingContent = true,
	expandAllTools,
}: ThinkingIndicatorProps) {
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
							<Box
								sx={{
									mb: toolCalls.length > 0 ? 1.5 : 0,
									p: 1.5,
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
						)}

						{/* Live tool activity */}
						{toolCalls.length > 0 && (
							<Box sx={{ mt: 0.5 }}>
								<Box
									sx={{
										display: "flex",
										gap: 0.5,
										flexWrap: "wrap",
										mb: 1,
									}}
								>
									<AnimatePresence>
										{toolCalls.map((tc) => {
											const isDone = Boolean(tc.resultSummary);
											const label =
												isDone && tc.executionTimeMs != null
													? `${humanizeToolName(tc.name)} (${tc.executionTimeMs}ms)`
													: humanizeToolName(tc.name);
											return (
												<motion.div
													key={tc.id}
													initial={{ opacity: 0, scale: 0.5, x: -20 }}
													animate={{ opacity: 1, scale: 1, x: 0 }}
													transition={spring.bouncy}
												>
													<Chip
														icon={
															isDone ? (
																<CheckCircleOutlineIcon
																	sx={{ fontSize: "0.85rem !important" }}
																/>
															) : (
																<BuildIcon
																	sx={{ fontSize: "0.85rem !important" }}
																/>
															)
														}
														label={label}
														size="small"
														color={isDone ? "success" : "secondary"}
														variant="outlined"
														sx={{ fontSize: "0.7rem" }}
													/>
												</motion.div>
											);
										})}
									</AnimatePresence>
								</Box>
								<ToolCallList
									toolCalls={toolCalls}
									expandAllTools={expandAllTools}
								/>
							</Box>
						)}
					</Paper>
				</Box>
			</Box>
		</motion.div>
	);
}

export default ThinkingIndicator;
