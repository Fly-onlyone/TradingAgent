/**
 * Sentiment Badge Component
 */

import { Frown, Laugh, Meh, Annoyed, Smile } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SentimentBadgeProps {
	score: number; // -1 to 1
	showScore?: boolean;
	size?: "sm" | "default";
	variant?: "default" | "secondary" | "outline";
}

type SentimentLevel =
	| "very_bullish"
	| "bullish"
	| "neutral"
	| "bearish"
	| "very_bearish";

const getSentimentLevel = (score: number): SentimentLevel => {
	if (score >= 0.5) return "very_bullish";
	if (score >= 0.2) return "bullish";
	if (score >= -0.2) return "neutral";
	if (score >= -0.5) return "bearish";
	return "very_bearish";
};

const sentimentConfig: Record<
	SentimentLevel,
	{
		label: string;
		className: string;
		Icon: LucideIcon;
		description: string;
	}
> = {
	very_bullish: {
		label: "Very Bullish",
		className:
			"border-trading-bullish/30 bg-trading-bullish/10 text-trading-bullish",
		Icon: Laugh,
		description: "Strong positive sentiment (>0.5)",
	},
	bullish: {
		label: "Bullish",
		className:
			"border-trading-bullish/30 bg-trading-bullish/10 text-trading-bullish",
		Icon: Smile,
		description: "Positive sentiment (0.2 to 0.5)",
	},
	neutral: {
		label: "Neutral",
		className:
			"border-muted-foreground/30 bg-muted/50 text-muted-foreground",
		Icon: Meh,
		description: "Neutral sentiment (-0.2 to 0.2)",
	},
	bearish: {
		label: "Bearish",
		className:
			"border-trading-bearish/30 bg-trading-bearish/10 text-trading-bearish",
		Icon: Annoyed,
		description: "Negative sentiment (-0.5 to -0.2)",
	},
	very_bearish: {
		label: "Very Bearish",
		className:
			"border-trading-bearish/30 bg-trading-bearish/10 text-trading-bearish",
		Icon: Frown,
		description: "Strong negative sentiment (<-0.5)",
	},
};

export function SentimentBadge({
	score,
	showScore = false,
	size = "sm",
	variant = "default",
}: SentimentBadgeProps) {
	const level = getSentimentLevel(score);
	const config = sentimentConfig[level];
	const Icon = config.Icon;

	const label = showScore
		? `${config.label} (${(score * 100).toFixed(0)}%)`
		: config.label;

	return (
		<Tooltip>
			<TooltipTrigger>
				<Badge
					variant={variant === "default" ? "secondary" : variant}
					className={cn(
						"gap-1 border font-medium",
						size === "sm" && "h-4 text-[10px]",
						config.className,
					)}
				>
					<Icon
						className={cn(
							"shrink-0",
							size === "sm" ? "size-3" : "size-3.5",
						)}
					/>
					{label}
				</Badge>
			</TooltipTrigger>
			<TooltipContent>
				{config.description} - Score: {score.toFixed(2)}
			</TooltipContent>
		</Tooltip>
	);
}

export default SentimentBadge;
