/**
 * Admin — Agentic Strategy Auto-Discovery
 *
 * Lists past discovery cycles with links into each Explorer/Extractor
 * AgentSession. Also provides a "Run now" button that blocks until the
 * orchestrator completes and then deep-links the user into the Explorer
 * session so they can inspect the chat.
 */

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	Collapse,
	LinearProgress,
	Stack,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { strategyDiscoveryApi } from "@/api/endpoints/strategyDiscovery";
import { strategyDiscoveryCyclesQueryOptions } from "@/api/queryOptions/admin";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useAgentStore } from "@/store/agentStore";
import { listStagger } from "@/utils/animations/variants";
import { requireAdmin } from "../-guards";

export const Route = createFileRoute("/admin/strategy-discovery")({
	beforeLoad: requireAdmin,
	component: StrategyDiscoveryAdminPage,
});

function StrategyDiscoveryAdminPage() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { setSelectedSessionId } = useAgentStore();
	const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);

	const cyclesQuery = useQuery(
		strategyDiscoveryCyclesQueryOptions({ pageSize: 30 }),
	);

	const runMutation = useMutation({
		mutationFn: () => strategyDiscoveryApi.runCycle(),
		onSuccess: (result) => {
			void queryClient.invalidateQueries({
				queryKey: ["admin-strategy-discovery-cycles"],
			});
			if (result.explorerSessionId) {
				setSelectedSessionId(result.explorerSessionId);
				void navigate({ to: "/agent" });
			}
		},
	});

	const openSession = useCallback(
		(sessionId: string | null | undefined) => {
			if (!sessionId) return;
			setSelectedSessionId(sessionId);
			void navigate({ to: "/agent" });
		},
		[navigate, setSelectedSessionId],
	);

	return (
		<PageTransition>
			<Box sx={{ p: 3, maxWidth: 1100, mx: "auto" }}>
				<SectionHeader
					title="Strategy Auto-Discovery"
					subtitle="Agentic Explorer picks Brave queries, delegates per-article extraction to parallel subagents, and saves surviving strategies. Each session is viewable in the agent chat."
				/>

				<Stack direction="row" spacing={2} sx={{ mb: 3 }}>
					<Button
						variant="contained"
						startIcon={<PlayArrowIcon />}
						disabled={runMutation.isPending}
						onClick={() => runMutation.mutate()}
					>
						{runMutation.isPending ? "Running cycle..." : "Run cycle now"}
					</Button>
					{runMutation.isPending && (
						<Box sx={{ flex: 1, display: "flex", alignItems: "center" }}>
							<LinearProgress sx={{ flex: 1 }} />
						</Box>
					)}
				</Stack>

				{runMutation.isError && (
					<Alert severity="error" sx={{ mb: 3 }}>
						Failed to run cycle:{" "}
						{runMutation.error instanceof Error
							? runMutation.error.message
							: "unknown error"}
					</Alert>
				)}

				{cyclesQuery.isLoading ? (
					<LinearProgress />
				) : cyclesQuery.data?.cycles.length ? (
					<motion.div
						variants={listStagger.container}
						initial="hidden"
						animate="visible"
					>
						<Stack spacing={1.5}>
							{cyclesQuery.data.cycles.map((cycle) => {
								const expanded = expandedCycleId === cycle.id;
								return (
									<motion.div key={cycle.id} variants={listStagger.item}>
										<Card variant="outlined">
											<CardContent sx={{ pb: "16px !important" }}>
												<Stack
													direction="row"
													alignItems="center"
													spacing={1.5}
													sx={{ mb: 1 }}
												>
													<StatusChip status={cycle.status} />
													<Typography variant="caption" color="text.secondary">
														{new Date(cycle.startedAt).toLocaleString()}
													</Typography>
													{cycle.manual && (
														<Chip
															size="small"
															label="manual"
															variant="outlined"
														/>
													)}
													<Box sx={{ flex: 1 }} />
													<Button
														size="small"
														onClick={() => openSession(cycle.explorerSessionId)}
														disabled={!cycle.explorerSessionId}
													>
														Open explorer chat
													</Button>
													<Button
														size="small"
														onClick={() =>
															setExpandedCycleId(expanded ? null : cycle.id)
														}
													>
														{expanded
															? "Hide extractors"
															: `Extractors (${cycle.extractorSessionIds.length})`}
													</Button>
												</Stack>

												<Stack direction="row" spacing={2} flexWrap="wrap">
													<StatLabel
														label="candidates"
														value={cycle.candidatesFound}
													/>
													<StatLabel
														label="saved"
														value={cycle.strategiesSaved}
														tone="success"
													/>
													<StatLabel
														label="skipped"
														value={cycle.strategiesSkippedLowConfidence}
													/>
													<StatLabel
														label="failed"
														value={cycle.strategiesFailed}
														tone={
															cycle.strategiesFailed > 0 ? "error" : undefined
														}
													/>
												</Stack>

												{cycle.error && (
													<Alert severity="error" sx={{ mt: 1.5 }}>
														{cycle.error}
													</Alert>
												)}

												<Collapse in={expanded} unmountOnExit>
													<Box sx={{ mt: 2 }}>
														{cycle.extractorSessionIds.length === 0 ? (
															<Typography
																variant="body2"
																color="text.secondary"
															>
																No extractor sessions recorded.
															</Typography>
														) : (
															<Stack spacing={0.5}>
																{cycle.extractorSessionIds.map((id) => (
																	<Button
																		key={id}
																		size="small"
																		variant="text"
																		onClick={() => openSession(id)}
																		sx={{
																			justifyContent: "flex-start",
																			fontFamily: "monospace",
																		}}
																	>
																		{id}
																	</Button>
																))}
															</Stack>
														)}
													</Box>
												</Collapse>
											</CardContent>
										</Card>
									</motion.div>
								);
							})}
						</Stack>
					</motion.div>
				) : (
					<Alert severity="info">
						No cycles yet. Click "Run cycle now" to trigger the first discovery.
					</Alert>
				)}
			</Box>
		</PageTransition>
	);
}

function StatusChip({ status }: { status: "running" | "ok" | "failed" }) {
	if (status === "running") {
		return (
			<Chip
				size="small"
				icon={<HourglassTopIcon />}
				label="running"
				color="info"
				variant="outlined"
			/>
		);
	}
	if (status === "failed") {
		return (
			<Chip
				size="small"
				icon={<ErrorOutlineIcon />}
				label="failed"
				color="error"
				variant="outlined"
			/>
		);
	}
	return (
		<Chip
			size="small"
			icon={<CheckCircleIcon />}
			label="ok"
			color="success"
			variant="outlined"
		/>
	);
}

function StatLabel({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone?: "success" | "error";
}) {
	const color =
		tone === "success"
			? "success.main"
			: tone === "error"
				? "error.main"
				: "text.secondary";
	return (
		<Stack direction="row" spacing={0.5} alignItems="baseline">
			<Typography variant="body2" sx={{ fontWeight: 600, color }}>
				{value}
			</Typography>
			<Typography variant="caption" color="text.secondary">
				{label}
			</Typography>
		</Stack>
	);
}
