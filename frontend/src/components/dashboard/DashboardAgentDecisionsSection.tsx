import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import {
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	Typography,
} from "@mui/material";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/common/EmptyState";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { MagneticButton } from "@/components/effects/MagneticButton";
import type { AgentDecisionSummary } from "@/types";
import { formatRelativeTime } from "@/utils/formatters";

export default function DashboardAgentDecisionsSection({
	decisions,
	loading,
	onOpenAgent,
}: {
	decisions: AgentDecisionSummary[];
	loading: boolean;
	onOpenAgent: () => void;
}) {
	return (
		<Card sx={{ height: "100%" }}>
			<CardContent>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						mb: 2,
					}}
				>
					<AutoAwesomeIcon sx={{ color: "secondary.main", fontSize: 20 }} />
					<Typography variant="h6">Agent Decisions</Typography>
					<MagneticButton
						size="small"
						onClick={onOpenAgent}
						sx={{ ml: "auto", fontSize: "0.75rem" }}
					>
						Open Agent
					</MagneticButton>
				</Box>

				{loading ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
						{[0, 1, 2].map((index) => (
							<ShimmerSkeleton
								key={`dashboard-decision-${String(index)}`}
								variant="text"
								height={64}
							/>
						))}
					</Box>
				) : decisions.length ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
						{decisions.map((decision) => (
							<Box
								key={decision.id}
								sx={{
									p: 1.5,
									borderRadius: 2,
									border: (theme) => `1px solid ${theme.trading.border.subtle}`,
									background: (theme) => theme.trading.cardTint,
									"&:hover": {
										background: (theme) =>
											`rgba(${theme.trading.primaryRgb}, 0.06)`,
									},
									transition: "background 0.2s ease",
								}}
							>
								<Box
									sx={{
										display: "flex",
										justifyContent: "space-between",
										mb: 0.5,
									}}
								>
									<Chip
										label={decision.action}
										size="small"
										color={
											decision.action === "buy"
												? "success"
												: decision.action === "sell"
													? "error"
													: "default"
										}
										sx={{
											fontWeight: 700,
											textTransform: "uppercase",
											fontSize: "0.65rem",
										}}
									/>
									<Typography variant="caption" color="text.secondary">
										{decision.symbol} · {formatRelativeTime(decision.createdAt)}
									</Typography>
								</Box>
								{decision.summary && (
									<Typography
										variant="caption"
										color="text.secondary"
										sx={{
											display: "block",
											lineHeight: 1.4,
											mt: 0.5,
										}}
									>
										{decision.summary.length > 120
											? `${decision.summary.slice(0, 120)}…`
											: decision.summary}
									</Typography>
								)}
							</Box>
						))}
						<Button
							component={Link}
							to="/agent"
							size="small"
							sx={{ alignSelf: "flex-start", mt: 0.5 }}
						>
							View all →
						</Button>
					</Box>
				) : (
					<EmptyState
						icon={<SmartToyIcon />}
						title="No recent decisions"
						description="The agent hasn't made any decisions yet."
						sx={{ py: 4 }}
					/>
				)}
			</CardContent>
		</Card>
	);
}
