/**
 * Position Card Component
 */

import { motion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Position } from "@/types";
import { formatPercent, formatPrice, formatUSD } from "@/utils/formatters";

interface PositionCardProps {
	position: Position;
	onClose?: () => void;
	isClosing?: boolean;
}

export function PositionCard({
	position,
	onClose,
	isClosing = false,
}: PositionCardProps) {
	const isLong = position.side === "long";
	const isProfitable = position.unrealizedPnl >= 0;

	// Calculate percentage to liquidation
	const liquidationDistance = position.liquidationPrice
		? Math.abs(
				((position.currentPrice - position.liquidationPrice) /
					position.currentPrice) *
					100,
			)
		: 100;

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -20 }}
		>
			<Card className="backdrop-blur-xl">
				<CardContent>
					{/* Header */}
					<div className="mb-4 flex items-center justify-between">
						<div className="flex items-center gap-2">
							<h3 className="text-lg font-semibold">
								{position.symbol.replace("-", "/")}
							</h3>
							<Badge variant="outline" className={cn(
								isLong
									? "border-[var(--trading-bullish)] text-[var(--trading-bullish)]"
									: "border-[var(--trading-bearish)] text-[var(--trading-bearish)]",
							)}>
								{isLong ? "Long" : "Short"} {position.leverage}x
							</Badge>
						</div>
						<div
							className={cn(
								"rounded-md p-2 text-right",
								isProfitable
									? "bg-[rgba(var(--trading-bullish-rgb),0.15)]"
									: "bg-[rgba(var(--trading-bearish-rgb),0.15)]",
							)}
						>
							<p
								className={cn(
									"text-lg font-bold font-mono",
									isProfitable
										? "text-[var(--trading-bullish)]"
										: "text-[var(--trading-bearish)]",
								)}
							>
								{formatUSD(position.unrealizedPnl)}
							</p>
							<span
								className={cn(
									"text-xs",
									isProfitable
										? "text-[var(--trading-bullish)]"
										: "text-[var(--trading-bearish)]",
								)}
							>
								{formatPercent(position.unrealizedPnlPercent)}
							</span>
						</div>
					</div>

					{/* Position Details */}
					<div className="mb-4 grid grid-cols-2 gap-4">
						<div>
							<span className="text-xs text-muted-foreground">
								Entry Price
							</span>
							<p className="text-sm font-medium font-mono">
								${formatPrice(position.entryPrice)}
							</p>
						</div>
						<div>
							<span className="text-xs text-muted-foreground">
								Current Price
							</span>
							<p className="text-sm font-medium font-mono">
								${formatPrice(position.currentPrice)}
							</p>
						</div>
						<div>
							<span className="text-xs text-muted-foreground">Quantity</span>
							<p className="text-sm font-medium">{position.quantity}</p>
						</div>
						<div>
							<span className="text-xs text-muted-foreground">Margin</span>
							<p className="text-sm font-medium">
								{formatUSD(position.margin)}
							</p>
						</div>
					</div>

					{/* Liquidation Warning */}
					{position.liquidationPrice && liquidationDistance < 50 && (
						<div className="mb-4">
							<div className="mb-1 flex justify-between">
								<span className="text-xs text-muted-foreground">
									Distance to Liquidation
								</span>
								<span
									className={cn(
										"text-xs",
										liquidationDistance < 20
											? "text-[var(--trading-bearish)]"
											: "text-yellow-500",
									)}
								>
									{liquidationDistance.toFixed(1)}%
								</span>
							</div>
							<Tooltip>
								<TooltipTrigger asChild>
									<div>
										<Progress
											value={100 - liquidationDistance}
											className={cn(
												"h-1.5",
												liquidationDistance < 20
													? "[&_[data-slot=progress-indicator]]:bg-[var(--trading-bearish)]"
													: "[&_[data-slot=progress-indicator]]:bg-yellow-500",
											)}
										/>
									</div>
								</TooltipTrigger>
								<TooltipContent>
									Liquidation at ${formatPrice(position.liquidationPrice)}
								</TooltipContent>
							</Tooltip>
						</div>
					)}

					{/* Close Button */}
					{onClose && (
						<Button
							variant="destructive"
							className="w-full"
							onClick={onClose}
							disabled={isClosing}
						>
							{isClosing ? "Closing..." : "Close Position"}
						</Button>
					)}
				</CardContent>
			</Card>
		</motion.div>
	);
}

export default PositionCard;
