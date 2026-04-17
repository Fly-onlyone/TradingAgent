/**
 * Chat Message Component
 *
 * Renders agent/user/system messages with markdown (GFM tables, code blocks)
 * and optional inline candlestick charts from tool results.
 */

import InfoIcon from "@mui/icons-material/Info";
import PersonIcon from "@mui/icons-material/Person";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import {
	Avatar,
	Box,
	Card,
	CardContent,
	Link,
	Paper,
	Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentMessage } from "@/api/websocket/useAgentSocket";
import { formatRelativeTime } from "@/utils/formatters";
import { AgentChart } from "./AgentChart";
import { MdTable, MdTbody, MdTd, MdTh, MdThead, MdTr } from "./AgentTable";
import { DecisionCard } from "./DecisionCard";
import { ToolCallList } from "./ToolCallList";

/** Format a full model ID like "claude-opus-4-6" → "Opus 4.6" */
function formatModelName(modelId: string): string {
	const normalized = modelId.toLowerCase();
	const family = normalized.includes("opus")
		? "Opus"
		: normalized.includes("sonnet")
			? "Sonnet"
			: null;
	if (!family) return modelId;

	const versionMatch = normalized.match(/claude-\w+-(\d+(?:-\d+)*)/);
	const version = versionMatch ? versionMatch[1].replace(/-/g, ".") : "";
	const suffix = normalized.includes("[1m]") ? " 1M" : "";
	return `${family} ${version}${suffix}`.trim();
}

/** Markdown component overrides -- MUI tables + themed code blocks. */
const markdownComponents = {
	table: MdTable,
	thead: MdThead,
	tbody: MdTbody,
	tr: MdTr,
	th: MdTh,
	td: MdTd,
	p: ({ children, ...props }: React.ComponentPropsWithoutRef<"p">) => (
		<Typography
			variant="body2"
			component="p"
			sx={{ mb: 1, "&:last-child": { mb: 0 } }}
			{...props}
		>
			{children}
		</Typography>
	),
	h1: ({ children, ...props }: React.ComponentPropsWithoutRef<"h1">) => (
		<Typography
			variant="h6"
			component="h1"
			sx={{ mt: 1.5, mb: 0.5 }}
			{...props}
		>
			{children}
		</Typography>
	),
	h2: ({ children, ...props }: React.ComponentPropsWithoutRef<"h2">) => (
		<Typography
			variant="subtitle1"
			component="h2"
			fontWeight={700}
			sx={{ mt: 1.5, mb: 0.5 }}
			{...props}
		>
			{children}
		</Typography>
	),
	h3: ({ children, ...props }: React.ComponentPropsWithoutRef<"h3">) => (
		<Typography
			variant="subtitle2"
			component="h3"
			fontWeight={700}
			sx={{ mt: 1, mb: 0.5 }}
			{...props}
		>
			{children}
		</Typography>
	),
	ul: ({ children, ...props }: React.ComponentPropsWithoutRef<"ul">) => (
		<Box
			component="ul"
			sx={{ pl: 2.5, my: 0.5, "& li": { mb: 0.25 } }}
			{...props}
		>
			{children}
		</Box>
	),
	ol: ({ children, ...props }: React.ComponentPropsWithoutRef<"ol">) => (
		<Box
			component="ol"
			sx={{ pl: 2.5, my: 0.5, "& li": { mb: 0.25 } }}
			{...props}
		>
			{children}
		</Box>
	),
	li: ({ children, ...props }: React.ComponentPropsWithoutRef<"li">) => (
		<Typography variant="body2" component="li" {...props}>
			{children}
		</Typography>
	),
	strong: ({
		children,
		...props
	}: React.ComponentPropsWithoutRef<"strong">) => (
		<Box component="strong" sx={{ fontWeight: 700 }} {...props}>
			{children}
		</Box>
	),
	code: ({
		children,
		className,
		...props
	}: React.ComponentPropsWithoutRef<"code"> & { className?: string }) => {
		const isBlock = className?.startsWith("language-");
		if (isBlock) {
			return (
				<Box
					component="code"
					sx={(theme) => ({
						display: "block",
						fontFamily: theme.trading.mono,
						fontSize: "0.78rem",
						lineHeight: 1.6,
						p: 1.5,
						my: 1,
						bgcolor: "action.hover",
						borderRadius: 1,
						overflowX: "auto",
						whiteSpace: "pre",
					})}
					className={className}
					{...props}
				>
					{children}
				</Box>
			);
		}
		return (
			<Box
				component="code"
				sx={(theme) => ({
					fontFamily: theme.trading.mono,
					fontSize: "0.82em",
					bgcolor: "action.hover",
					px: 0.5,
					py: 0.25,
					borderRadius: 0.5,
				})}
				{...props}
			>
				{children}
			</Box>
		);
	},
	pre: ({ children }: React.ComponentPropsWithoutRef<"pre">) => (
		<Box component="div">{children}</Box>
	),
	blockquote: ({
		children,
		...props
	}: React.ComponentPropsWithoutRef<"blockquote">) => (
		<Box
			component="blockquote"
			sx={{
				borderLeft: "3px solid",
				borderColor: "primary.main",
				pl: 1.5,
				my: 1,
				mx: 0,
				color: "text.secondary",
			}}
			{...props}
		>
			{children}
		</Box>
	),
	hr: (props: React.ComponentPropsWithoutRef<"hr">) => (
		<Box
			component="hr"
			sx={{
				border: "none",
				borderTop: "1px solid",
				borderColor: "divider",
				my: 1.5,
			}}
			{...props}
		/>
	),
	a: ({ children, href, ...props }: React.ComponentPropsWithoutRef<"a">) => (
		<Link href={href} target="_blank" rel="noopener noreferrer" {...props}>
			{children}
		</Link>
	),
} as const;

interface ChatMessageProps {
	message: AgentMessage;
	showThinkingContent?: boolean;
	expandAllTools?: boolean;
	isStreaming?: boolean;
}

export function ChatMessage({
	message,
	showThinkingContent = true,
	expandAllTools,
	isStreaming = false,
}: ChatMessageProps) {
	const isUser = message.role === "user";
	const isSystem = message.role === "system";
	const hasThinking =
		!isUser && !isSystem && !!message.thinkingContent && showThinkingContent;

	const remarkPlugins = useMemo(() => [remarkGfm], []);

	const getAvatar = () => {
		if (isUser) return <PersonIcon />;
		if (isSystem) return <InfoIcon />;
		return <SmartToyIcon />;
	};

	const getAvatarBg = () => {
		if (isUser) return "primary.main";
		if (isSystem) return "warning.main";
		return "secondary.main";
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
		>
			<Box
				sx={{
					display: "flex",
					gap: 1.5,
					mb: 2,
					flexDirection: isUser ? "row-reverse" : "row",
				}}
			>
				<Avatar
					sx={{
						width: 36,
						height: 36,
						bgcolor: getAvatarBg(),
						flexShrink: 0,
					}}
				>
					{getAvatar()}
				</Avatar>

				<Box sx={{ maxWidth: "80%", minWidth: 0 }}>
					<Box
						sx={{
							display: "flex",
							gap: 1,
							mb: 0.5,
							flexDirection: isUser ? "row-reverse" : "row",
							alignItems: "center",
						}}
					>
						<Typography variant="caption" fontWeight={600}>
							{isUser
								? "You"
								: isSystem
									? "System"
									: message.model
										? `Agent · ${formatModelName(message.model)}`
										: "Agent"}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{formatRelativeTime(new Date(message.timestamp))}
						</Typography>
					</Box>

					<Paper
						sx={{
							p: 2,
							bgcolor: isUser
								? (theme) => `rgba(${theme.trading.primaryRgb}, 0.15)`
								: isSystem
									? (theme) => `rgba(${theme.trading.semanticRgb.warning}, 0.1)`
									: "background.paper",
							color: "text.primary",
							borderRadius: 2,
							borderLeft: isUser ? "none" : isSystem ? "none" : "2px solid",
							borderLeftColor: isUser
								? undefined
								: isSystem
									? undefined
									: "secondary.main",
							borderRight: isUser ? "2px solid" : "none",
							borderRightColor: isUser ? "primary.main" : undefined,
							borderTopLeftRadius: isUser ? 16 : 4,
							borderTopRightRadius: isUser ? 4 : 16,
						}}
					>
						{/* Persistent thinking / reasoning block */}
						{hasThinking && (
							<Box
								sx={{
									mb: 1.5,
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
									{message.thinkingContent}
								</Typography>
							</Box>
						)}

						{/* Message content -- markdown for assistant, plain text for user/system */}
						{!isUser ? (
							<Box
								sx={{
									"& > *:first-child": { mt: 0 },
									"& > *:last-child": { mb: 0 },
									wordBreak: "break-word",
								}}
							>
								<Markdown
									remarkPlugins={remarkPlugins}
									components={markdownComponents}
								>
									{message.content}
								</Markdown>
								{isStreaming && (
									<Box
										component="span"
										sx={{
											display: "inline-block",
											width: 6,
											height: "1.2em",
											ml: 0.25,
											bgcolor: "primary.main",
											verticalAlign: "text-bottom",
											animation: "blink 1s step-end infinite",
											"@keyframes blink": {
												"50%": { opacity: 0 },
											},
										}}
									/>
								)}
							</Box>
						) : (
							<Typography
								variant="body2"
								sx={{
									whiteSpace: "pre-wrap",
									wordBreak: "break-word",
								}}
							>
								{message.content}
								{isStreaming && (
									<Box
										component="span"
										sx={{
											display: "inline-block",
											width: 6,
											height: "1.2em",
											ml: 0.25,
											bgcolor: "primary.main",
											verticalAlign: "text-bottom",
											animation: "blink 1s step-end infinite",
											"@keyframes blink": {
												"50%": { opacity: 0 },
											},
										}}
									/>
								)}
							</Typography>
						)}

						{/* Tool Calls */}
						{message.toolCalls && message.toolCalls.length > 0 && (
							<Box sx={{ mt: 2 }}>
								<ToolCallList
									toolCalls={message.toolCalls}
									expandAllTools={expandAllTools}
								/>
							</Box>
						)}
					</Paper>

					{/* Inline Chart from tool results */}
					{message.chartData && message.chartData.candles.length > 0 && (
						<Card
							component={motion.div}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.25, delay: 0.1 }}
							sx={{ mt: 1 }}
						>
							<CardContent sx={{ pb: "12px !important" }}>
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 0.75,
										mb: 1,
									}}
								>
									<ShowChartIcon
										sx={{
											fontSize: 18,
											color: "primary.main",
										}}
									/>
									<Typography variant="caption" fontWeight={600}>
										{message.chartData.symbol}
									</Typography>
									<Typography variant="caption" color="text.secondary">
										{message.chartData.timeframe}
									</Typography>
								</Box>
								<AgentChart
									data={message.chartData.candles}
									indicators={message.chartData.indicators}
								/>
							</CardContent>
						</Card>
					)}

					{/* Decision Card */}
					{message.decision && (
						<Box sx={{ mt: 1 }}>
							<DecisionCard decision={message.decision} />
						</Box>
					)}
				</Box>
			</Box>
		</motion.div>
	);
}

export default ChatMessage;
