/**
 * Data Management Admin Page
 * Bulk-clear collection groups with typed confirmation (superuser only)
 */

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import NewspaperIcon from "@mui/icons-material/Newspaper";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import {
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	Grid2 as Grid,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { adminApi } from "@/api/endpoints/admin";
import { adminCollectionsQueryOptions } from "@/api/queryOptions/admin";
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { staggerCascade } from "@/utils/animations/variants";
import { requireAdmin } from "../-guards";

export const Route = createFileRoute("/admin/data-management")({
	beforeLoad: requireAdmin,
	component: DataManagementPage,
});

interface CollectionGroup {
	id: string;
	name: string;
	description: string;
	icon: typeof SmartToyIcon;
	collections: string[];
}

const COLLECTION_GROUPS: CollectionGroup[] = [
	{
		id: "agent",
		name: "Agent",
		description: "Agent sessions and decision history",
		icon: SmartToyIcon,
		collections: ["agent_sessions", "agent_decisions"],
	},
	{
		id: "strategies",
		name: "Strategies",
		description: "Trading strategy definitions",
		icon: AccountBalanceIcon,
		collections: ["strategies"],
	},
	{
		id: "knowledge",
		name: "Knowledge",
		description: "Strategy knowledge, trade lessons, and patterns",
		icon: LibraryBooksIcon,
		collections: ["strategy_knowledge", "trade_lessons", "trading_patterns"],
	},
	{
		id: "memory",
		name: "Memory",
		description: "Agent long-term memory entries",
		icon: PsychologyIcon,
		collections: ["agent_memories"],
	},
	{
		id: "news",
		name: "News",
		description: "News sources, articles, and credibility events",
		icon: NewspaperIcon,
		collections: ["news_sources", "news_articles", "credibility_events"],
	},
	{
		id: "tasks",
		name: "Tasks",
		description: "Scheduled and completed agent tasks",
		icon: ScheduleIcon,
		collections: ["agent_tasks"],
	},
];

function DataManagementPage() {
	const queryClient = useQueryClient();
	const [confirmGroup, setConfirmGroup] = useState<CollectionGroup | null>(
		null,
	);

	const collectionsQuery = useQuery(adminCollectionsQueryOptions());

	const countsByCollection = new Map(
		collectionsQuery.data?.map((c) => [c.name, c.documentCount]) ?? [],
	);

	const clearMutation = useMutation({
		mutationFn: (collections: string[]) =>
			adminApi.bulkClearCollections(collections),
		onSuccess: () => {
			setConfirmGroup(null);
			void queryClient.invalidateQueries({
				queryKey: ["admin-collections"],
			});
			void queryClient.invalidateQueries({ queryKey: ["admin-db-info"] });
		},
		onError: () => {
			setConfirmGroup(null);
		},
	});

	const handleClearGroup = useCallback(
		(group: CollectionGroup) => {
			clearMutation.mutate(group.collections);
		},
		[clearMutation],
	);

	const getGroupTotal = (group: CollectionGroup) =>
		group.collections.reduce(
			(sum, name) => sum + (countsByCollection.get(name) ?? 0),
			0,
		);

	return (
		<PageTransition pageKey="admin-data-management">
			<SectionHeader
				title="Data Management"
				subtitle="Clear collection groups to reset data"
			/>

			<motion.div
				variants={staggerCascade.container}
				initial="hidden"
				animate="visible"
			>
				<Grid container spacing={3} sx={{ mt: 1 }}>
					{COLLECTION_GROUPS.map((group) => {
						const GroupIcon = group.icon;
						const total = getGroupTotal(group);
						const isEmpty = total === 0;
						const isClearing =
							clearMutation.isPending && confirmGroup?.id === group.id;

						return (
							<Grid key={group.id} size={{ xs: 12, sm: 6, md: 4 }}>
								<motion.div variants={staggerCascade.item}>
									<Card
										sx={{
											height: "100%",
											display: "flex",
											flexDirection: "column",
										}}
									>
										<CardContent
											sx={{
												flex: 1,
												display: "flex",
												flexDirection: "column",
												gap: 1.5,
												p: 3,
												"&:last-child": { pb: 3 },
											}}
										>
											{/* Header */}
											<Box
												sx={{
													display: "flex",
													alignItems: "center",
													gap: 1.5,
												}}
											>
												<Box
													sx={{
														width: 40,
														height: 40,
														borderRadius: "50%",
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														bgcolor: "primary.main",
														opacity: 0.15,
														position: "relative",
													}}
												>
													<GroupIcon
														sx={{
															fontSize: 22,
															color: "primary.main",
															position: "absolute",
															opacity: 1,
														}}
													/>
												</Box>
												<Typography
													variant="h6"
													sx={{ flex: 1, fontWeight: 600 }}
												>
													{group.name}
												</Typography>
												{collectionsQuery.isLoading ? (
													<ShimmerSkeleton
														width={60}
														height={24}
														variant="rounded"
													/>
												) : (
													<Chip
														label={`${total} docs`}
														size="small"
														color={isEmpty ? "default" : "error"}
														variant="outlined"
													/>
												)}
											</Box>

											{/* Description */}
											<Typography variant="body2" color="text.secondary">
												{group.description}
											</Typography>

											{/* Collection breakdown */}
											<Box
												sx={{
													flex: 1,
													display: "flex",
													flexDirection: "column",
													gap: 0.5,
													py: 1,
													borderTop: 1,
													borderColor: "divider",
												}}
											>
												{group.collections.map((collName) => (
													<Box
														key={collName}
														sx={{
															display: "flex",
															justifyContent: "space-between",
															alignItems: "center",
														}}
													>
														<Typography
															variant="caption"
															color="text.secondary"
															sx={{ fontFamily: "monospace" }}
														>
															{collName}
														</Typography>
														{collectionsQuery.isLoading ? (
															<ShimmerSkeleton width={30} height={16} />
														) : (
															<Typography
																variant="caption"
																sx={{
																	fontFamily: "monospace",
																	opacity: 0.7,
																}}
															>
																{countsByCollection.get(collName) ?? 0}
															</Typography>
														)}
													</Box>
												))}
											</Box>

											{/* Clear button */}
											<Button
												variant="outlined"
												color="error"
												fullWidth
												startIcon={<DeleteSweepIcon />}
												disabled={
													isEmpty ||
													collectionsQuery.isLoading ||
													clearMutation.isPending
												}
												onClick={() => setConfirmGroup(group)}
												sx={{ mt: "auto", transition: "all 0.2s" }}
											>
												{isClearing
													? "Clearing..."
													: isEmpty
														? "Empty"
														: `Clear All ${group.name} Data`}
											</Button>
										</CardContent>
									</Card>
								</motion.div>
							</Grid>
						);
					})}
				</Grid>
			</motion.div>

			{/* Destructive confirm dialog */}
			<DestructiveConfirmDialog
				open={!!confirmGroup}
				title={`Clear All ${confirmGroup?.name ?? ""} Data`}
				message={
					<Box
						component="span"
						sx={{ display: "flex", flexDirection: "column", gap: 1 }}
					>
						<Typography variant="body2" component="span">
							This action cannot be undone. The following collections will be
							permanently cleared:
						</Typography>
						<Box component="ul" sx={{ m: 0, pl: 2 }}>
							{confirmGroup?.collections.map((name) => (
								<Typography
									key={name}
									component="li"
									variant="body2"
									sx={{ fontFamily: "monospace" }}
								>
									{name} — {countsByCollection.get(name) ?? 0} documents
								</Typography>
							))}
						</Box>
						<Typography
							variant="body2"
							component="span"
							sx={{ fontWeight: 600 }}
						>
							Total: {confirmGroup ? getGroupTotal(confirmGroup) : 0} documents
							will be deleted
						</Typography>
					</Box>
				}
				confirmLabel="Delete All"
				loading={clearMutation.isPending}
				onConfirm={() => confirmGroup && handleClearGroup(confirmGroup)}
				onCancel={() => setConfirmGroup(null)}
			/>
		</PageTransition>
	);
}
