import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
	Box,
	Card,
	CardContent,
	Chip,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Typography,
} from "@mui/material";
import { EmptyState } from "@/components/common/EmptyState";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import type { TradeWithPnL } from "@/types";
import {
	formatPrice,
	formatRelativeTime,
	formatSymbol,
	formatUSD,
} from "@/utils/formatters";

export default function DashboardRecentTradesSection({
	trades,
	loading,
}: {
	trades: TradeWithPnL[];
	loading: boolean;
}) {
	return (
		<Card sx={{ height: "100%" }}>
			<CardContent>
				<Typography variant="h6" gutterBottom>
					Recent Agent Trades
				</Typography>

				{loading ? (
					<Box>
						{Array.from({ length: 3 }).map((_, index) => (
							<ShimmerSkeleton
								key={`dashboard-trade-${String(index)}`}
								shimmerVariant="table-row"
							/>
						))}
					</Box>
				) : trades.length ? (
					<TableContainer>
						<Table size="small">
							<TableHead>
								<TableRow>
									<TableCell>Side</TableCell>
									<TableCell>Symbol</TableCell>
									<TableCell align="right">Price</TableCell>
									<TableCell align="right">Quantity</TableCell>
									<TableCell align="right">P&L</TableCell>
									<TableCell align="right">Time</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{trades.map((trade) => (
									<TableRow key={trade.id}>
										<TableCell>
											<Chip
												label={trade.side.toUpperCase()}
												size="small"
												color={trade.side === "buy" ? "success" : "error"}
												sx={{ fontWeight: 600, minWidth: 48 }}
											/>
										</TableCell>
										<TableCell>{formatSymbol(trade.symbol)}</TableCell>
										<TableCell align="right">
											${formatPrice(trade.entryPrice)}
										</TableCell>
										<TableCell align="right">{trade.quantity}</TableCell>
										<TableCell
											align="right"
											sx={{
												color:
													(trade.netPnl ?? 0) >= 0
														? "success.main"
														: "error.main",
												fontWeight: 500,
											}}
										>
											{trade.netPnl !== undefined
												? formatUSD(trade.netPnl)
												: "-"}
										</TableCell>
										<TableCell align="right">
											<Typography variant="body2" color="text.secondary">
												{formatRelativeTime(trade.entryTime)}
											</Typography>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				) : (
					<EmptyState
						icon={<TrendingUpIcon />}
						title="No agent trades yet"
						description="The agent will log trades here as it executes."
						sx={{ py: 4 }}
					/>
				)}
			</CardContent>
		</Card>
	);
}
