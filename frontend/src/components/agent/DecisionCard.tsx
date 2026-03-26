/**
 * Decision Card Component
 */

import {
	Hourglass,
	PauseCircle,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import type { AgentDecision } from "@/api/websocket/useAgentSocket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface DecisionCardProps {
	decision: AgentDecision;
	onExecute?: () => void;
	isExecuting?: boolean;
}

const actionConfig = {
	buy: {
		label: "BUY",
		colorClass: "text-emerald-500",
		bgClass: "bg-emerald-500/15 border-emerald-500",
		buttonVariant: "default" as const,
		buttonClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
		icon: TrendingUp,
	},
	sell: {
		label: "SELL",
		colorClass: "text-red-500",
		bgClass: "bg-red-500/15 border-red-500",
		buttonVariant: "destructive" as const,
		buttonClass: "",
		icon: TrendingDown,
	},
	hold: {
		label: "HOLD",
		colorClass: "text-sky-500",
		bgClass: "bg-sky-500/15 border-sky-500",
		buttonVariant: "default" as const,
		buttonClass: "",
		icon: PauseCircle,
	},
	wait: {
		label: "WAIT",
		colorClass: "text-amber-500",
		bgClass: "bg-amber-500/15 border-amber-500",
		buttonVariant: "default" as const,
		buttonClass: "",
		icon: Hourglass,
	},
};

export function DecisionCard({
	decision,
	onExecute,
	isExecuting = false,
}: DecisionCardProps) {
	const config = actionConfig[decision.action];
	const Icon = config.icon;

	const confidenceColorClass =
		decision.confidence >= 0.7
			? "text-emerald-500"
			: decision.confidence >= 0.4
				? "text-amber-500"
				: "text-red-500";

	const progressColorClass =
		decision.confidence >= 0.7
			? "[&_[data-slot=progress-indicator]]:bg-emerald-500"
			: decision.confidence >= 0.4
				? "[&_[data-slot=progress-indicator]]:bg-amber-500"
				: "[&_[data-slot=progress-indicator]]:bg-red-500";

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
		>
			<Card className={cn("border", config.bgClass)}>
				<CardContent className="space-y-4">
					{/* Header */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Icon className={cn("size-7", config.colorClass)} />
							<span
								className={cn(
									"text-lg font-bold",
									config.colorClass,
								)}
							>
								{config.label}
							</span>
							{decision.symbol && (
								<Badge variant="outline">{decision.symbol}</Badge>
							)}
						</div>
					</div>

					{/* Confidence */}
					<div>
						<div className="mb-1 flex justify-between">
							<span className="text-sm text-muted-foreground">
								Confidence
							</span>
							<span
								className={cn(
									"text-sm font-semibold",
									confidenceColorClass,
								)}
							>
								{(decision.confidence * 100).toFixed(0)}%
							</span>
						</div>
						<Progress
							value={decision.confidence * 100}
							className={cn(
								"[&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:rounded-full",
								progressColorClass,
							)}
						/>
					</div>

					<Separator />

					{/* Reasoning */}
					<div>
						<h4 className="mb-1 text-sm font-semibold">Reasoning</h4>
						<p className="text-sm text-muted-foreground">
							{decision.reasoning}
						</p>
					</div>

					{/* Risk Assessment */}
					{decision.riskAssessment && (
						<div>
							<h4 className="mb-1 text-sm font-semibold">
								Risk Assessment
							</h4>
							<p className="text-sm text-muted-foreground">
								{decision.riskAssessment}
							</p>
						</div>
					)}

					{/* Execute Button */}
					{onExecute &&
						(decision.action === "buy" ||
							decision.action === "sell") && (
							<Button
								className={cn("mt-2 w-full", config.buttonClass)}
								variant={config.buttonVariant}
								onClick={onExecute}
								disabled={isExecuting}
							>
								{isExecuting
									? "Executing..."
									: `Execute ${config.label}`}
							</Button>
						)}
				</CardContent>
			</Card>
		</motion.div>
	);
}

export default DecisionCard;
