/**
 * Positions Tab — full-width display of all open positions.
 */

import ShowChartIcon from "@mui/icons-material/ShowChart";
import { Box, Chip, Typography } from "@mui/material";
import { motion } from "framer-motion";

import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { useOrderStore } from "@/store/orderStore";
import { listStagger } from "@/utils/animations/variants";
import { formatPercent, formatPrice, formatUSD } from "@/utils/formatters";

interface PositionsTabProps {
	onSelectSymbol?: (symbol: string) => void;
}

export function PositionsTab({ onSelectSymbol }: PositionsTabProps) {
	const positions = useOrderStore((state) => state.positions);
	const isLoading = useOrderStore((state) => state.isLoadingPositions);

	if (isLoading) {
		return (
			<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
				{Array.from(
					{ length: 3 },
					(_, index) => `positions-tab-skeleton-${String(index)}`,
				).map((skeletonId) => (
					<Box
						key={skeletonId}
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 2,
							py: 1,
							px: 1.5,
						}}
					>
						<ShimmerSkeleton width={100} height={18} />
						<ShimmerSkeleton width={60} height={24} />
						<Box sx={{ flex: 1 }} />
						<ShimmerSkeleton width={80} height={18} />
						<ShimmerSkeleton width={80} height={18} />
						<ShimmerSkeleton width={80} height={18} />
						<ShimmerSkeleton width={50} height={18} />
					</Box>
				))}
			</Box>
		);
	}

	if (positions.length === 0) {
		return (
			<Box
				sx={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					py: 6,
					gap: 1,
				}}
			>
				<ShowChartIcon sx={{ fontSize: 48, color: "text.disabled" }} />
				<Typography variant="body1" color="text.secondary">
					No open positions.
				</Typography>
				<Typography variant="body2" color="text.disabled">
					Positions opened by the agent will appear here.
				</Typography>
			</Box>
		);
	}

	return (
		<motion.div
			variants={listStagger.container}
			initial="hidden"
			animate="visible"
		>
			{/* Header row */}
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 2,
					py: 1,
					px: 1.5,
					borderBottom: 1,
					borderColor: "divider",
					mb: 0.5,
				}}
			>
				<Typography
					variant="caption"
					color="text.secondary"
					fontWeight={600}
					sx={{ width: 120 }}
				>
					Symbol
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					fontWeight={600}
					sx={{ width: 80 }}
				>
					Side
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					fontWeight={600}
					sx={{ width: 110, textAlign: "right" }}
				>
					Entry Price
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					fontWeight={600}
					sx={{ width: 110, textAlign: "right" }}
				>
					Current Price
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					fontWeight={600}
					sx={{ flex: 1, textAlign: "right" }}
				>
					PnL
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					fontWeight={600}
					sx={{ width: 60, textAlign: "right" }}
				>
					Leverage
				</Typography>
			</Box>

			{positions.map((pos) => {
				const isLong = pos.side === "long";
				const isProfitable = pos.unrealizedPnl >= 0;

				return (
					<motion.div key={pos.id} variants={listStagger.item}>
						<Box
							onClick={() => onSelectSymbol?.(pos.symbol)}
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 2,
								py: 1.25,
								px: 1.5,
								borderRadius: 1,
								cursor: onSelectSymbol ? "pointer" : "default",
								transition: "background-color 0.2s",
								"&:hover": onSelectSymbol
									? { bgcolor: "action.hover" }
									: undefined,
							}}
						>
							<Typography variant="body2" fontWeight={600} sx={{ width: 120 }}>
								{pos.symbol.replace("-", "/")}
							</Typography>

							<Box sx={{ width: 80 }}>
								<Chip
									label={isLong ? "Long" : "Short"}
									size="small"
									color={isLong ? "success" : "error"}
									variant="outlined"
								/>
							</Box>

							<Typography
								variant="body2"
								sx={{
									width: 110,
									textAlign: "right",
									fontFamily: (theme) => theme.trading.mono,
								}}
							>
								${formatPrice(pos.entryPrice)}
							</Typography>

							<Typography
								variant="body2"
								sx={{
									width: 110,
									textAlign: "right",
									fontFamily: (theme) => theme.trading.mono,
								}}
							>
								${formatPrice(pos.currentPrice)}
							</Typography>

							<Box sx={{ flex: 1, textAlign: "right" }}>
								<Typography
									variant="body2"
									fontWeight={600}
									sx={{
										fontFamily: (theme) => theme.trading.mono,
										color: isProfitable ? "success.main" : "error.main",
									}}
								>
									{formatUSD(pos.unrealizedPnl)}
								</Typography>
								<Typography
									variant="caption"
									sx={{
										color: isProfitable ? "success.main" : "error.main",
									}}
								>
									{formatPercent(pos.unrealizedPnlPercent)}
								</Typography>
							</Box>

							<Typography
								variant="body2"
								fontWeight={500}
								sx={{ width: 60, textAlign: "right" }}
							>
								{pos.leverage}x
							</Typography>
						</Box>
					</motion.div>
				);
			})}
		</motion.div>
	);
}
