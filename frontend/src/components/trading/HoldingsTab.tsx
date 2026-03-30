/**
 * Holdings Tab — full-width holdings grid replacing the sidebar HoldingsCard.
 */

import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";

import { CoinIcon } from "@/components/common/CoinIcon";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import type { CurrencyBalance } from "@/types";
import { listStagger } from "@/utils/animations/variants";
import { formatCrypto, formatUSD } from "@/utils/formatters";

interface HoldingsTabProps {
	currencies: CurrencyBalance[];
	isLoading: boolean;
	error: string | null;
	onSelectSymbol?: (symbol: string) => void;
}

export function HoldingsTab({
	currencies,
	isLoading,
	error,
	onSelectSymbol,
}: HoldingsTabProps) {
	const sorted = [...currencies].sort((a, b) => b.equity - a.equity);

	if (error) {
		return (
			<Typography variant="body2" color="error.main">
				{error}
			</Typography>
		);
	}

	if (isLoading) {
		return (
			<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
				{Array.from(
					{ length: 5 },
					(_, index) => `holdings-tab-skeleton-${String(index)}`,
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
						<ShimmerSkeleton variant="circular" width={32} height={32} />
						<Box sx={{ flex: 1 }}>
							<ShimmerSkeleton width="30%" height={18} />
						</Box>
						<ShimmerSkeleton width={100} height={18} />
						<ShimmerSkeleton width={80} height={18} />
						<ShimmerSkeleton width={80} height={18} />
					</Box>
				))}
			</Box>
		);
	}

	if (sorted.length === 0) {
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
				<AccountBalanceWalletIcon
					sx={{ fontSize: 48, color: "text.disabled" }}
				/>
				<Typography variant="body1" color="text.secondary">
					No holdings found.
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
				<Box sx={{ width: 32 }} />
				<Typography
					variant="caption"
					color="text.secondary"
					fontWeight={600}
					sx={{ flex: 1, minWidth: 80 }}
				>
					Currency
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					fontWeight={600}
					sx={{ width: 120, textAlign: "right" }}
				>
					Equity
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					fontWeight={600}
					sx={{ width: 120, textAlign: "right" }}
				>
					Available
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
					fontWeight={600}
					sx={{ width: 100, textAlign: "right" }}
				>
					UPL
				</Typography>
			</Box>

			{sorted.map((c) => (
				<motion.div key={c.currency} variants={listStagger.item}>
					<Box
						onClick={() => onSelectSymbol?.(`${c.currency}-USDT`)}
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 2,
							py: 1,
							px: 1.5,
							borderRadius: 1,
							cursor: onSelectSymbol ? "pointer" : "default",
							transition: "background-color 0.2s",
							"&:hover": onSelectSymbol
								? { bgcolor: "action.hover" }
								: undefined,
						}}
					>
						<CoinIcon symbol={c.currency} size={32} />
						<Typography
							variant="body2"
							fontWeight={600}
							sx={{ flex: 1, minWidth: 80 }}
						>
							{c.currency}
						</Typography>
						<Typography
							variant="body2"
							fontWeight={500}
							sx={{
								width: 120,
								textAlign: "right",
								fontFamily: (theme) => theme.trading.mono,
							}}
						>
							{formatCrypto(c.equity)}
						</Typography>
						<Typography
							variant="body2"
							color="text.secondary"
							sx={{
								width: 120,
								textAlign: "right",
								fontFamily: (theme) => theme.trading.mono,
							}}
						>
							{formatCrypto(c.available)}
						</Typography>
						<Typography
							variant="body2"
							sx={{
								width: 100,
								textAlign: "right",
								fontFamily: (theme) => theme.trading.mono,
								color:
									c.upl === 0
										? "text.secondary"
										: c.upl > 0
											? "success.main"
											: "error.main",
							}}
						>
							{c.upl === 0 ? "-" : `${c.upl > 0 ? "+" : ""}${formatUSD(c.upl)}`}
						</Typography>
					</Box>
				</motion.div>
			))}
		</motion.div>
	);
}
