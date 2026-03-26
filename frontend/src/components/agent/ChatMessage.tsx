/**
 * Chat Message Component
 */

import { Bot, Info, User } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatRelativeTime } from "@/utils/formatters";
import type { AgentMessage } from "@/api/websocket/useAgentSocket";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DecisionCard } from "./DecisionCard";

interface ChatMessageProps {
	message: AgentMessage;
	showThinkingContent?: boolean;
	isStreaming?: boolean;
}

export function ChatMessage({
	message,
	showThinkingContent = true,
	isStreaming = false,
}: ChatMessageProps) {
	const [showReasoning, setShowReasoning] = useState(false);
	const isUser = message.role === "user";
	const isSystem = message.role === "system";
	const hasThinking =
		!isUser && !isSystem && !!message.thinkingContent && showThinkingContent;

	const getAvatar = () => {
		if (isUser) return <User className="size-4" />;
		if (isSystem) return <Info className="size-4" />;
		return <Bot className="size-4" />;
	};

	const getAvatarBg = () => {
		if (isUser) return "bg-[var(--primary)]";
		if (isSystem) return "bg-amber-500";
		return "bg-[var(--secondary)]";
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
		>
			<div
				className={cn(
					"mb-4 flex gap-3",
					isUser ? "flex-row-reverse" : "flex-row",
				)}
			>
				<Avatar size="sm" className={cn("shrink-0", getAvatarBg())}>
					<AvatarFallback className={cn(getAvatarBg(), "text-white")}>
						{getAvatar()}
					</AvatarFallback>
				</Avatar>

				<div className="max-w-[80%] min-w-0">
					<div
						className={cn(
							"mb-1 flex items-center gap-2",
							isUser ? "flex-row-reverse" : "flex-row",
						)}
					>
						<span className="text-xs font-semibold">
							{isUser ? "You" : isSystem ? "System" : "Agent"}
						</span>
						<span className="text-xs text-muted-foreground">
							{formatRelativeTime(new Date(message.timestamp))}
						</span>
					</div>

					<div
						className={cn(
							"rounded-lg p-4",
							isUser
								? "rounded-tr-[4px] rounded-tl-2xl bg-[var(--primary)] text-white"
								: isSystem
									? "rounded-tl-[4px] rounded-tr-2xl bg-[rgba(var(--trading-warning-rgb),0.1)]"
									: "rounded-tl-[4px] rounded-tr-2xl border-l-2 border-l-[var(--secondary)] bg-card",
						)}
					>
						{/* Persistent thinking / reasoning block */}
						{hasThinking && (
							<div className="mb-3">
								<button
									type="button"
									className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
									onClick={() => setShowReasoning((v) => !v)}
								>
									{showReasoning
										? "Hide reasoning"
										: "Show reasoning"}
								</button>

								<AnimatePresence>
									{showReasoning && (
										<motion.div
											initial={{ height: 0, opacity: 0 }}
											animate={{
												height: "auto",
												opacity: 1,
											}}
											exit={{ height: 0, opacity: 0 }}
											transition={{ duration: 0.2 }}
											style={{ overflow: "hidden" }}
										>
											<div className="mt-2 max-h-[200px] overflow-auto rounded bg-muted p-3">
												<p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
													{message.thinkingContent}
												</p>
											</div>
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						)}

						<p className="whitespace-pre-wrap break-words text-sm">
							{message.content}
							{isStreaming && (
								<span
									className="ml-0.5 inline-block h-[1.2em] w-1.5 animate-blink bg-[var(--primary)] align-text-bottom"
								/>
							)}
						</p>

						{/* Tool Calls */}
						{message.toolCalls && message.toolCalls.length > 0 && (
							<div className="mt-4">
								<p className="mb-1 text-xs text-muted-foreground">
									Tools Used:
								</p>
								<div className="flex flex-wrap gap-1">
									{message.toolCalls.map((tool) => (
										<Badge
											key={tool.id}
											variant="outline"
											className="text-[0.7rem]"
										>
											{tool.name}
										</Badge>
									))}
								</div>
							</div>
						)}
					</div>

					{/* Decision Card */}
					{message.decision && (
						<div className="mt-2">
							<DecisionCard decision={message.decision} />
						</div>
					)}
				</div>
			</div>
		</motion.div>
	);
}

export default ChatMessage;
