/**
 * Sentiment Badge Component
 */

import SentimentDissatisfiedIcon from "@mui/icons-material/SentimentDissatisfied";
import SentimentNeutralIcon from "@mui/icons-material/SentimentNeutral";
import SentimentSatisfiedIcon from "@mui/icons-material/SentimentSatisfied";
import SentimentVeryDissatisfiedIcon from "@mui/icons-material/SentimentVeryDissatisfied";
import SentimentVerySatisfiedIcon from "@mui/icons-material/SentimentVerySatisfied";
import { Chip, type ChipProps, Tooltip } from "@mui/material";

interface SentimentBadgeProps {
	score: number; // -1 to 1
	showScore?: boolean;
	size?: ChipProps["size"];
	variant?: ChipProps["variant"];
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
		color: "success" | "info" | "default" | "warning" | "error";
		Icon: typeof SentimentNeutralIcon;
		description: string;
	}
> = {
	very_bullish: {
		label: "Very Bullish",
		color: "success",
		Icon: SentimentVerySatisfiedIcon,
		description: "Strong positive sentiment (>0.5)",
	},
	bullish: {
		label: "Bullish",
		color: "success",
		Icon: SentimentSatisfiedIcon,
		description: "Positive sentiment (0.2 to 0.5)",
	},
	neutral: {
		label: "Neutral",
		color: "default",
		Icon: SentimentNeutralIcon,
		description: "Neutral sentiment (-0.2 to 0.2)",
	},
	bearish: {
		label: "Bearish",
		color: "error",
		Icon: SentimentDissatisfiedIcon,
		description: "Negative sentiment (-0.5 to -0.2)",
	},
	very_bearish: {
		label: "Very Bearish",
		color: "error",
		Icon: SentimentVeryDissatisfiedIcon,
		description: "Strong negative sentiment (<-0.5)",
	},
};

export function SentimentBadge({
	score,
	showScore = false,
	size = "small",
	variant = "filled",
}: SentimentBadgeProps) {
	const level = getSentimentLevel(score);
	const config = sentimentConfig[level];
	const Icon = config.Icon;

	const label = showScore
		? `${config.label} (${(score * 100).toFixed(0)}%)`
		: config.label;

	return (
		<Tooltip title={`${config.description} - Score: ${score.toFixed(2)}`}>
			<Chip
				icon={<Icon />}
				label={label}
				color={config.color}
				size={size}
				variant={variant}
				sx={{
					fontWeight: 500,
					"& .MuiChip-icon": {
						fontSize: size === "small" ? 16 : 20,
					},
				}}
			/>
		</Tooltip>
	);
}

export default SentimentBadge;
