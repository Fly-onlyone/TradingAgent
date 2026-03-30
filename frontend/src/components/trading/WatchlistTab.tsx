/**
 * Watchlist Tab — responsive grid of compact TickerCards with add/remove controls.
 */

import AddIcon from "@mui/icons-material/Add";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
	Box,
	Button,
	CircularProgress,
	Grid2 as Grid,
	TextField,
	Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useState } from "react";

import type { SymbolOption } from "@/api/endpoints/market";
import { CoinIcon } from "@/components/common/CoinIcon";
import { ZoomAwareAutocomplete } from "@/components/common/ZoomAwareAutocomplete";
import { useSymbolOptions } from "@/hooks/useSymbolOptions";
import { useMarketStore } from "@/store/marketStore";
import { staggerCascade } from "@/utils/animations/variants";

import { TickerCard } from "./TickerCard";

interface WatchlistTabProps {
	onSelectSymbol?: (symbol: string) => void;
}

export function WatchlistTab({ onSelectSymbol }: WatchlistTabProps) {
	const watchlist = useMarketStore((state) => state.watchlist);
	const addToWatchlist = useMarketStore((state) => state.addToWatchlist);

	const [showAdd, setShowAdd] = useState(false);
	const { symbolOptions, isLoading: symbolsLoading } = useSymbolOptions();

	// Filter out symbols already in watchlist
	const availableOptions = symbolOptions.filter(
		(o) => !watchlist.includes(o.symbol),
	);

	return (
		<Box>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					mb: 2,
				}}
			>
				<Typography variant="subtitle1" fontWeight={600}>
					Tracked Symbols
				</Typography>
				<Button
					size="small"
					startIcon={<AddIcon />}
					onClick={() => setShowAdd((prev) => !prev)}
					variant={showAdd ? "contained" : "outlined"}
				>
					Add Symbol
				</Button>
			</Box>

			{showAdd && (
				<Box sx={{ mb: 2, maxWidth: 400 }}>
					<ZoomAwareAutocomplete<SymbolOption, false, false, false>
						value={null}
						onChange={(_, newValue) => {
							if (newValue) {
								addToWatchlist(newValue.symbol);
								setShowAdd(false);
							}
						}}
						options={availableOptions}
						groupBy={(option) => option.group}
						getOptionLabel={(option) => option.symbol}
						renderOption={(props, option) => (
							<li {...props} key={`${option.group}-${option.symbol}`}>
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 1.5,
									}}
								>
									<CoinIcon symbol={option.base} size={24} />
									<Box>
										<Typography variant="body2" fontWeight={600}>
											{option.symbol}
										</Typography>
										<Typography variant="caption" color="text.secondary">
											{option.base} / {option.quote}
										</Typography>
									</Box>
								</Box>
							</li>
						)}
						isOptionEqualToValue={(option, value) =>
							option.symbol === value.symbol && option.group === value.group
						}
						loading={symbolsLoading}
						renderInput={(params) => (
							<TextField
								{...params}
								label="Search symbol"
								size="small"
								placeholder="e.g. DOGE-USDT"
								slotProps={{
									input: {
										...params.InputProps,
										endAdornment: (
											<>
												{symbolsLoading ? (
													<CircularProgress size={18} />
												) : null}
												{params.InputProps.endAdornment}
											</>
										),
									},
								}}
							/>
						)}
					/>
				</Box>
			)}

			{watchlist.length === 0 ? (
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						py: 6,
						gap: 1,
					}}
				>
					<StarBorderIcon
						sx={{ fontSize: 48, color: "text.disabled" }}
					/>
					<Typography variant="body1" color="text.secondary">
						No symbols in your watchlist yet.
					</Typography>
					<Typography variant="body2" color="text.disabled">
						Click "Add Symbol" to start tracking prices.
					</Typography>
				</Box>
			) : (
				<motion.div
					variants={staggerCascade.container}
					initial="hidden"
					animate="visible"
				>
					<Grid container spacing={2}>
						{watchlist.map((symbol) => (
							<Grid
								key={symbol}
								size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
							>
								<motion.div variants={staggerCascade.item}>
									<TickerCard
										symbol={symbol}
										compact
										onClick={() => onSelectSymbol?.(symbol)}
									/>
								</motion.div>
							</Grid>
						))}
					</Grid>
				</motion.div>
			)}
		</Box>
	);
}
