import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import {
	Box,
	Card,
	CardContent,
	Typography,
} from "@mui/material";
import { motion } from "framer-motion";

import { CoinIcon } from "@/components/common/CoinIcon";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import type { CurrencyBalance } from "@/types";
import { listStagger } from "@/utils/animations/variants";
import { formatCrypto, formatUSD } from "@/utils/formatters";

interface HoldingsCardProps {
	currencies: CurrencyBalance[];
	isLoading: boolean;
	error: string | null;
	onSelectSymbol?: (symbol: string) => void;
}

export function HoldingsCard({
	currencies,
	isLoading,
	error,
	onSelectSymbol,
}: HoldingsCardProps) {
	const sorted = [...currencies].sort((a, b) => b.equity - a.equity);

	return (
		<Card>
			<CardContent>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						mb: 1.5,
					}}
				>
					<AccountBalanceWalletIcon
						fontSize="small"
						color="primary"
					/>
					<Typography variant="h6">Holdings</Typography>
				</Box>

				{error && (
					<Typography variant="body2" color="error.main">
						{error}
					</Typography>
				)}

				{isLoading && (
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							gap: 1.5,
						}}
					>
						{Array.from({ length: 3 }, (_, i) => (
							<Box
								key={i}
								sx={{
									display: "flex",
									alignItems: "center",
									gap: 1.5,
								}}
							>
								<ShimmerSkeleton
									variant="circular"
									width={32}
									height={32}
								/>
								<Box sx={{ flex: 1 }}>
									<ShimmerSkeleton width="40%" height={18} />
									<ShimmerSkeleton width="60%" height={14} />
								</Box>
								<ShimmerSkeleton width={80} height={18} />
							</Box>
						))}
					</Box>
				)}

				{!isLoading && !error && sorted.length === 0 && (
					<Typography variant="body2" color="text.secondary">
						No holdings found.
					</Typography>
				)}

				{!isLoading && sorted.length > 0 && (
					<motion.div
						variants={listStagger.container}
						initial="hidden"
						animate="visible"
					>
						<Box
							sx={{
								display: "flex",
								flexDirection: "column",
								gap: 1,
							}}
						>
							{sorted.map((c) => (
								<motion.div
									key={c.currency}
									variants={listStagger.item}
								>
									<Box
										onClick={() =>
											onSelectSymbol?.(
												`${c.currency}-USDT`,
											)
										}
										sx={{
											display: "flex",
											alignItems: "center",
											gap: 1.5,
											py: 0.75,
											px: 1,
											borderRadius: 1,
											cursor: onSelectSymbol
												? "pointer"
												: "default",
											transition: "background-color 0.2s",
											"&:hover": onSelectSymbol
												? {
														bgcolor:
															"action.hover",
													}
												: undefined,
										}}
									>
										<CoinIcon
											symbol={c.currency}
											size={32}
										/>
										<Box sx={{ flex: 1, minWidth: 0 }}>
											<Typography
												variant="body2"
												fontWeight={600}
											>
												{c.currency}
											</Typography>
											<Typography
												variant="caption"
												color="text.secondary"
											>
												Avail:{" "}
												{formatCrypto(c.available)}
											</Typography>
										</Box>
										<Box sx={{ textAlign: "right" }}>
											<Typography
												variant="body2"
												fontWeight={500}
												sx={{
													fontFamily: (theme) =>
														theme.trading.mono,
												}}
											>
												{formatCrypto(c.equity)}
											</Typography>
											{c.upl !== 0 && (
												<Typography
													variant="caption"
													sx={{
														color:
															c.upl >= 0
																? "success.main"
																: "error.main",
													}}
												>
													{c.upl >= 0 ? "+" : ""}
													{formatUSD(c.upl)}
												</Typography>
											)}
										</Box>
									</Box>
								</motion.div>
							))}
						</Box>
					</motion.div>
				)}
			</CardContent>
		</Card>
	);
}
