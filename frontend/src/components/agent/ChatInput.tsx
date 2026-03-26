/**
 * Chat Input Component
 */

import { Lightbulb, LineChart, Loader2, Send } from "lucide-react";
import { type KeyboardEvent, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ChatInputProps {
	onSendMessage: (message: string) => void;
	onRequestAnalysis?: (symbol?: string) => void;
	onRequestRecommendation?: () => void;
	isThinking?: boolean;
	disabled?: boolean;
}

export function ChatInput({
	onSendMessage,
	onRequestAnalysis,
	onRequestRecommendation,
	isThinking = false,
	disabled = false,
}: ChatInputProps) {
	const [message, setMessage] = useState("");

	const handleSend = useCallback(() => {
		if (message.trim() && !isThinking && !disabled) {
			onSendMessage(message.trim());
			setMessage("");
		}
	}, [message, isThinking, disabled, onSendMessage]);

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	return (
		<div>
			{/* Quick Actions */}
			<div className="mb-4 flex gap-2">
				{onRequestAnalysis && (
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									variant="outline"
									size="sm"
									onClick={() => onRequestAnalysis()}
									disabled={isThinking || disabled}
								>
									<LineChart data-icon="inline-start" />
									Analyze
								</Button>
							}
						/>
						<TooltipContent>Request market analysis</TooltipContent>
					</Tooltip>
				)}
				{onRequestRecommendation && (
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									variant="outline"
									size="sm"
									onClick={onRequestRecommendation}
									disabled={isThinking || disabled}
								>
									<Lightbulb data-icon="inline-start" />
									Recommend
								</Button>
							}
						/>
						<TooltipContent>Get trading recommendation</TooltipContent>
					</Tooltip>
				)}
			</div>

			{/* Input Field */}
			<div className="flex items-end gap-2">
				<Textarea
					className="min-h-10 max-h-32 flex-1 resize-none rounded-lg"
					placeholder={
						isThinking ? "Agent is thinking..." : "Type your message..."
					}
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					onKeyDown={handleKeyDown}
					disabled={isThinking || disabled}
					rows={1}
				/>
				<Button
					size="icon"
					onClick={handleSend}
					disabled={!message.trim() || isThinking || disabled}
					className={cn(
						"shrink-0",
						!message.trim() || isThinking || disabled
							? "opacity-50"
							: "",
					)}
				>
					{isThinking ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Send className="size-4" />
					)}
				</Button>
			</div>
		</div>
	);
}

export default ChatInput;
