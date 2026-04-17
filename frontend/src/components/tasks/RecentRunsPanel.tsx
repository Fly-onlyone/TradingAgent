import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import HistoryIcon from "@mui/icons-material/History";
import {
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	Skeleton,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { decisionsApi } from "@/api/endpoints/decisions";
import { CoinIcon } from "@/components/common/CoinIcon";

interface RecentRunsPanelProps {
	taskId: string | null;
	onViewHistory: () => void;
	onViewLastChat: () => void;
	hasRuns: boolean;
	hasLastSession: boolean;
}

const ACTION_COLORS: Record<string, "success" | "error" | "default"> = {
	BUY: "success",
	SELL: "error",
	HOLD: "default",
};

export function RecentRunsPanel({
	taskId,
	onViewHistory,
	onViewLastChat,
	hasRuns,
	hasLastSession,
}: RecentRunsPanelProps) {
	const { data, isLoading } = useQuery({
		queryKey: ["tasks", "decisions", taskId],
		queryFn: () =>
			decisionsApi.getDecisions({ taskId: taskId as string, pageSize: 10 }),
		enabled: !!taskId,
		staleTime: 30_000,
	});

	const decisions = data?.decisions ?? [];

	return (
		<Card
			sx={{
				background: (t) => t.trading.glass.card.background,
				backdropFilter: (t) => t.trading.glass.card.backdropFilter,
				border: (t) => t.trading.glass.card.border,
			}}
		>
			<CardContent>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						mb: 1.5,
					}}
				>
					<Typography variant="h6" sx={{ fontSize: "1rem" }}>
						Recent Runs
					</Typography>
					{hasRuns && (
						<Stack direction="row" spacing={1}>
							{hasLastSession && (
								<Button
									size="small"
									variant="outlined"
									startIcon={<ChatBubbleOutlineIcon />}
									onClick={onViewLastChat}
								>
									Last Chat
								</Button>
							)}
							<Button
								size="small"
								variant="outlined"
								startIcon={<HistoryIcon />}
								onClick={onViewHistory}
							>
								All History
							</Button>
						</Stack>
					)}
				</Box>

				{isLoading ? (
					<Stack spacing={1}>
						{["skel-a", "skel-b", "skel-c"].map((key) => (
							<Skeleton
								key={key}
								variant="rectangular"
								height={36}
								sx={{ borderRadius: 1 }}
							/>
						))}
					</Stack>
				) : decisions.length === 0 ? (
					<Box
						sx={{
							py: 4,
							textAlign: "center",
							color: "text.secondary",
						}}
					>
						<Typography variant="body2">
							No runs yet. Click <strong>Run Now</strong> to start.
						</Typography>
					</Box>
				) : (
					<Table size="small">
						<TableHead>
							<TableRow>
								<TableCell>Symbol</TableCell>
								<TableCell>Action</TableCell>
								<TableCell align="right">Confidence</TableCell>
								<TableCell align="right">Time</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{decisions.map((d) => {
								const base = d.symbol?.split("-")[0] ?? "";
								return (
									<TableRow key={d.id}>
										<TableCell>
											<Box
												sx={{
													display: "flex",
													alignItems: "center",
													gap: 0.75,
												}}
											>
												<CoinIcon symbol={base} size={18} />
												<Typography variant="body2" fontWeight={500}>
													{d.symbol}
												</Typography>
											</Box>
										</TableCell>
										<TableCell>
											<Chip
												label={d.action ?? "\u2014"}
												size="small"
												color={
													d.action
														? (ACTION_COLORS[d.action] ?? "default")
														: "default"
												}
												variant="outlined"
											/>
										</TableCell>
										<TableCell align="right">
											<Typography
												variant="body2"
												fontFamily="JetBrains Mono, monospace"
											>
												{d.confidence != null
													? `${Math.round(d.confidence)}%`
													: "\u2014"}
											</Typography>
										</TableCell>
										<TableCell align="right">
											<Typography variant="caption" color="text.secondary">
												{d.createdAt
													? formatDistanceToNowStrict(new Date(d.createdAt), {
															addSuffix: true,
														})
													: "\u2014"}
											</Typography>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
