/**
 * Ticker Card Component
 */

import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
	Box,
	Card,
	CardContent,
	IconButton,
	Typography,
	useTheme,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import type { MouseEvent } from "react";

import { marketTickerQueryOptions } from "@/api/queryOptions/market";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { useMarketStore } from "@/store/marketStore";
import type { Ticker } from "@/types";
import { formatPercent, formatPrice, formatVolume } from "@/utils/formatters";

interface TickerCardProps {
	symbol?: string;
	ticker?: Ticker;
	loading?: boolean;
	compact?: boolean;
	onClick?: () => void;
}

export function TickerCard({
	symbol,
	ticker,
	loading = false,
	compact = false,
	onClick,
}: TickerCardProps) {
	const watchlist = useMarketStore((state) => state.watchlist);
	const addToWatchlist = useMarketStore((state) => state.addToWatchlist);
	const removeFromWatchlist = useMarketStore(
		(state) => state.removeFromWatchlist,
	);
	const liveTicker = useMarketStore((state) =>
		symbol ? state.tickers[symbol] : undefined,
	);
	const theme = useTheme();

	const tickerQuery = useQuery({
		...marketTickerQueryOptions(symbol as string),
		enabled: Boolean(symbol && !ticker && !liveTicker),
		staleTime: 30_000,
		refetchInterval: liveTicker ? false : 45_000,
		retry: 1,
	});

	const resolvedTicker = ticker ?? liveTicker ?? tickerQuery.data;
	const isLoading =
		loading || (!!symbol && !resolvedTicker && tickerQuery.isPending);

	if (isLoading) {
		return (
			<Card sx={{ height: compact ? 80 : 120 }}>
				<CardContent>
					<Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
						<ShimmerSkeleton variant="text" width={80} />
						<ShimmerSkeleton variant="text" width={60} />
					</Box>
					<ShimmerSkeleton variant="text" width={120} height={32} />
					{!compact && <ShimmerSkeleton variant="text" width={100} />}
				</CardContent>
			</Card>
		);
	}

	if (!resolvedTicker) {
		return (
			<Card sx={{ height: compact ? 80 : 120 }}>
				<CardContent>
					<Typography
						variant={compact ? "body2" : "subtitle1"}
						fontWeight={600}
					>
						{symbol ? symbol.replace("-", "/") : "Ticker"}
					</Typography>
					<Typography variant={compact ? "body2" : "h6"} color="text.secondary">
						Unavailable
					</Typography>
				</CardContent>
			</Card>
		);
	}

	const isInWatchlist = watchlist.includes(resolvedTicker.symbol);
	const isPositive = resolvedTicker.priceChangePercent >= 0;
	const priceColor = isPositive ? "success.main" : "error.main";
	const bullishRgb = theme.trading.colors.bullishRgb;
	const bearishRgb = theme.trading.colors.bearishRgb;

	const handleWatchlistToggle = (e: MouseEvent) => {
		e.stopPropagation();

		if (isInWatchlist) {
			removeFromWatchlist(resolvedTicker.symbol);
		} else {
			addToWatchlist(resolvedTicker.symbol);
		}
	};

	return (
		<Card
			component={motion.div}
			whileHover={{ y: -2 }}
			onClick={onClick}
			sx={{
				cursor: onClick ? "pointer" : "default",
				height: compact ? "auto" : 120,
				backdropFilter: "blur(12px)",
				transition: "all 0.2s ease",
				"&:hover": {
					borderColor: isPositive ? "success.main" : "error.main",
					boxShadow: (theme) =>
						isPositive
							? `0 0 12px rgba(${theme.trading.colors.bullishRgb}, 0.15)`
							: `0 0 12px rgba(${theme.trading.colors.bearishRgb}, 0.15)`,
				},
			}}
		>
			<CardContent sx={{ p: compact ? 1.5 : 2 }}>
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						mb: 1,
					}}
				>
					<Box>
						<Typography
							variant={compact ? "body2" : "subtitle1"}
							fontWeight={600}
						>
							{resolvedTicker.symbol.replace("-", "/")}
						</Typography>
					</Box>
					<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
						<AnimatePresence mode="wait">
							<motion.div
								key={resolvedTicker.priceChangePercent}
								initial={{ opacity: 0, y: -5 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 5 }}
							>
								<Typography
									variant="body2"
									fontWeight={600}
									sx={{ color: priceColor }}
								>
									{formatPercent(resolvedTicker.priceChangePercent)}
								</Typography>
							</motion.div>
						</AnimatePresence>
						<IconButton
							size="small"
							onClick={handleWatchlistToggle}
							component={motion.button}
							whileTap={{ scale: 1.4, rotate: 15 }}
							sx={{ ml: 0.5, p: 0.25 }}
						>
							{isInWatchlist ? (
								<StarIcon sx={{ fontSize: 18, color: "warning.main" }} />
							) : (
								<StarBorderIcon
									sx={{ fontSize: 18, color: "text.secondary" }}
								/>
							)}
						</IconButton>
					</Box>
				</Box>

				<AnimatePresence mode="wait">
					<motion.div
						key={resolvedTicker.lastPrice}
						initial={{
							backgroundColor: isPositive
								? `rgba(${bullishRgb}, 0.2)`
								: `rgba(${bearishRgb}, 0.2)`,
							boxShadow: isPositive
								? `inset 0 0 12px rgba(${bullishRgb}, 0.3)`
								: `inset 0 0 12px rgba(${bearishRgb}, 0.3)`,
						}}
						animate={{
							backgroundColor: "transparent",
							boxShadow: "inset 0 0 0px transparent",
						}}
						transition={{ duration: 0.6 }}
					>
						<Typography
							variant={compact ? "h6" : "h5"}
							fontWeight={700}
							sx={{
								fontFamily: (theme) => theme.trading.mono,
								color: priceColor,
							}}
						>
							${formatPrice(resolvedTicker.lastPrice)}
						</Typography>
					</motion.div>
				</AnimatePresence>

				{!compact && (
					<Box sx={{ display: "flex", gap: 2, mt: 1 }}>
						<Typography variant="caption" color="text.secondary">
							Vol: {formatVolume(resolvedTicker.volume24h)}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							H: ${formatPrice(resolvedTicker.high24h)}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							L: ${formatPrice(resolvedTicker.low24h)}
						</Typography>
					</Box>
				)}
			</CardContent>
		</Card>
	);
}

export default TickerCard;
