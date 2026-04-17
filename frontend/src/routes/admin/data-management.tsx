/**
 * Data Management Admin Page
 * Bulk-clear collection groups with typed confirmation (superuser only)
 */

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import LayersIcon from "@mui/icons-material/Layers";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import NewspaperIcon from "@mui/icons-material/Newspaper";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import StorageIcon from "@mui/icons-material/Storage";
import {
	Box,
	Button,
	Card,
	CardContent,
	Checkbox,
	Chip,
	Grid2 as Grid,
	Paper,
	Typography,
	useTheme,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion, type Variants } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { adminApi } from "@/api/endpoints/admin";
import { adminCollectionsQueryOptions } from "@/api/queryOptions/admin";
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { notify } from "@/store/uiStore";
import {
	createCardHover,
	fadeInUp,
	staggerCascade,
} from "@/utils/animations/variants";
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

const TOTAL_COLLECTIONS = COLLECTION_GROUPS.reduce(
	(sum, g) => sum + g.collections.length,
	0,
);

function DataManagementPage() {
	const theme = useTheme();
	const primaryRgb = theme.trading.primaryRgb;
	const cardHover = useMemo(
		() => createCardHover(primaryRgb) as unknown as Variants,
		[primaryRgb],
	);

	const queryClient = useQueryClient();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [confirmOpen, setConfirmOpen] = useState(false);

	const collectionsQuery = useQuery(adminCollectionsQueryOptions());

	const countsByCollection = new Map(
		collectionsQuery.data?.map((c) => [c.name, c.documentCount]) ?? [],
	);

	const getGroupTotal = useCallback(
		(group: CollectionGroup) =>
			group.collections.reduce(
				(sum, name) => sum + (countsByCollection.get(name) ?? 0),
				0,
			),
		[countsByCollection],
	);

	const selectedGroups = useMemo(
		() => COLLECTION_GROUPS.filter((g) => selected.has(g.id)),
		[selected],
	);

	const nonEmptyGroups = useMemo(
		() => COLLECTION_GROUPS.filter((g) => getGroupTotal(g) > 0),
		[getGroupTotal],
	);

	const clearMutation = useMutation({
		mutationFn: (collections: string[]) =>
			adminApi.bulkClearCollections(collections),
		onSuccess: async (_data, collections) => {
			setConfirmOpen(false);
			setSelected(new Set());
			notify.success(
				`Cleared ${collections.length} collection${collections.length > 1 ? "s" : ""}`,
			);
			// Remove ALL cached queries so other pages fetch fresh data.
			// (invalidateQueries alone won't work because queries use
			// refetchOnMount: false, so stale cache would be shown as-is.)
			queryClient.removeQueries();
			// Re-fetch the queries this page needs right now
			void queryClient.refetchQueries({ queryKey: ["admin-collections"] });
			void queryClient.refetchQueries({ queryKey: ["admin-db-info"] });
		},
		onError: () => {
			setConfirmOpen(false);
			notify.error("Failed to clear collections");
		},
	});

	const toggleGroup = useCallback((groupId: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(groupId)) {
				next.delete(groupId);
			} else {
				next.add(groupId);
			}
			return next;
		});
	}, []);

	const allNonEmptySelected =
		nonEmptyGroups.length > 0 &&
		nonEmptyGroups.every((g) => selected.has(g.id));
	const someSelected = selected.size > 0 && !allNonEmptySelected;

	const toggleSelectAll = useCallback(() => {
		if (allNonEmptySelected) {
			setSelected(new Set());
		} else {
			setSelected(new Set(nonEmptyGroups.map((g) => g.id)));
		}
	}, [allNonEmptySelected, nonEmptyGroups]);

	const openConfirmForGroup = useCallback((group: CollectionGroup) => {
		setSelected(new Set([group.id]));
		setConfirmOpen(true);
	}, []);

	const openConfirmForSelected = useCallback(() => {
		if (selected.size > 0) setConfirmOpen(true);
	}, [selected.size]);

	const handleConfirm = useCallback(() => {
		const collections = selectedGroups.flatMap((g) => g.collections);
		if (collections.length > 0) {
			clearMutation.mutate(collections);
		}
	}, [selectedGroups, clearMutation]);

	const totalDocuments = [...countsByCollection.values()].reduce(
		(a, b) => a + b,
		0,
	);
	const emptyGroups = COLLECTION_GROUPS.filter(
		(g) => getGroupTotal(g) === 0,
	).length;

	const confirmTotal = selectedGroups.reduce(
		(sum, g) => sum + getGroupTotal(g),
		0,
	);
	const isSingleGroup = selectedGroups.length === 1;
	const confirmTitle = isSingleGroup
		? `Clear All ${selectedGroups[0]?.name ?? ""} Data`
		: "Clear Selected Data";

	return (
		<PageTransition pageKey="admin-data-management">
			<SectionHeader
				title="Data Management"
				subtitle="Clear collection groups to reset data"
			/>

			{/* Summary stats bar */}
			<motion.div variants={fadeInUp} initial="hidden" animate="visible">
				<Box
					sx={{
						display: "flex",
						flexWrap: "wrap",
						gap: 2,
						mt: 2,
						mb: 2,
					}}
				>
					<Paper
						elevation={0}
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 1,
							px: 2,
							py: 1,
							bgcolor: (t) => `rgba(${t.trading.primaryRgb}, 0.08)`,
							border: (t) => `1px solid rgba(${t.trading.primaryRgb}, 0.15)`,
							borderRadius: 2,
						}}
					>
						<StorageIcon sx={{ fontSize: 18, color: "primary.main" }} />
						{collectionsQuery.isLoading ? (
							<ShimmerSkeleton width={60} height={20} />
						) : (
							<Typography
								variant="body2"
								sx={{
									fontWeight: 600,
									fontFamily: "monospace",
								}}
							>
								{totalDocuments.toLocaleString()} Documents
							</Typography>
						)}
					</Paper>

					<Paper
						elevation={0}
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 1,
							px: 2,
							py: 1,
							bgcolor: (t) => `rgba(${t.trading.primaryRgb}, 0.05)`,
							border: 1,
							borderColor: "divider",
							borderRadius: 2,
						}}
					>
						<LayersIcon sx={{ fontSize: 18, color: "text.secondary" }} />
						<Typography
							variant="body2"
							color="text.secondary"
							sx={{ fontWeight: 500 }}
						>
							{TOTAL_COLLECTIONS} Collections
						</Typography>
					</Paper>

					{!collectionsQuery.isLoading && emptyGroups > 0 && (
						<Paper
							elevation={0}
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 1,
								px: 2,
								py: 1,
								bgcolor: (t) => `rgba(${t.trading.primaryRgb}, 0.03)`,
								border: 1,
								borderColor: "divider",
								borderRadius: 2,
							}}
						>
							<FolderOpenIcon
								sx={{
									fontSize: 18,
									color: "text.disabled",
								}}
							/>
							<Typography
								variant="body2"
								color="text.disabled"
								sx={{ fontWeight: 500 }}
							>
								{emptyGroups} Empty
							</Typography>
						</Paper>
					)}
				</Box>
			</motion.div>

			{/* Bulk action bar */}
			<motion.div variants={fadeInUp} initial="hidden" animate="visible">
				<Paper
					elevation={0}
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						px: 1.5,
						py: 0.5,
						mb: 3,
						bgcolor: (t) => `rgba(${t.trading.primaryRgb}, 0.04)`,
						border: 1,
						borderColor: "divider",
						borderRadius: 2,
					}}
				>
					<Checkbox
						checked={allNonEmptySelected}
						indeterminate={someSelected}
						onChange={toggleSelectAll}
						disabled={
							collectionsQuery.isLoading ||
							nonEmptyGroups.length === 0 ||
							clearMutation.isPending
						}
						aria-label="Select all non-empty groups"
					/>
					<Typography
						variant="body2"
						color={selected.size > 0 ? "text.primary" : "text.secondary"}
						sx={{ fontWeight: 500, flex: 1 }}
					>
						{selected.size > 0
							? `${selected.size} selected`
							: "Select all non-empty groups"}
					</Typography>
					<Button
						variant="contained"
						color="error"
						startIcon={<DeleteSweepIcon />}
						disabled={selected.size === 0 || clearMutation.isPending}
						onClick={openConfirmForSelected}
						sx={{ fontWeight: 600 }}
					>
						Clear Selected
					</Button>
				</Paper>
			</motion.div>

			{/* Card grid */}
			<motion.div
				variants={staggerCascade.container}
				initial="hidden"
				animate="visible"
			>
				<Grid container spacing={3}>
					{COLLECTION_GROUPS.map((group) => {
						const GroupIcon = group.icon;
						const total = getGroupTotal(group);
						const isEmpty = total === 0;
						const isSelected = selected.has(group.id);
						const isClearing =
							clearMutation.isPending && isSelected && confirmOpen === false;

						return (
							<Grid key={group.id} size={{ xs: 12, sm: 6, md: 4 }}>
								<motion.div
									variants={staggerCascade.item}
									style={{ height: "100%" }}
								>
									<motion.div
										variants={cardHover}
										initial="rest"
										whileHover="hover"
										whileTap="tap"
										style={{ height: "100%" }}
									>
										<Card
											sx={{
												height: "100%",
												display: "flex",
												flexDirection: "column",
												borderColor: isSelected ? "error.main" : undefined,
												borderWidth: isSelected ? 1 : undefined,
												borderStyle: isSelected ? "solid" : undefined,
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
														gap: 1,
													}}
												>
													<Checkbox
														checked={isSelected}
														onChange={() => toggleGroup(group.id)}
														disabled={
															isEmpty ||
															collectionsQuery.isLoading ||
															clearMutation.isPending
														}
														size="small"
														sx={{ p: 0.5, ml: -0.5 }}
														aria-label={`Select ${group.name}`}
													/>
													<Box
														sx={{
															width: 48,
															height: 48,
															borderRadius: "12px",
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															bgcolor: (t) =>
																`rgba(${t.trading.primaryRgb}, 0.15)`,
															border: (t) =>
																`1px solid rgba(${t.trading.primaryRgb}, 0.2)`,
														}}
													>
														<GroupIcon
															sx={{
																fontSize: 26,
																color: "primary.main",
															}}
														/>
													</Box>
													<Typography
														variant="h6"
														sx={{
															flex: 1,
															fontWeight: 600,
														}}
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
															label={`${total.toLocaleString()} docs`}
															size="small"
															variant="outlined"
															sx={{
																fontFamily: "monospace",
																fontWeight: 600,
																borderColor: isEmpty ? "divider" : "error.main",
																color: isEmpty ? "text.disabled" : "error.main",
															}}
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
														py: 1,
														px: 1.5,
														borderRadius: 1.5,
														bgcolor: (t) =>
															`rgba(${t.trading.primaryRgb}, 0.03)`,
														border: 1,
														borderColor: "divider",
													}}
												>
													{group.collections.map((collName, idx) => (
														<Box
															key={collName}
															sx={{
																display: "flex",
																justifyContent: "space-between",
																alignItems: "center",
																py: 0.75,
																px: 0.5,
																borderBottom:
																	idx < group.collections.length - 1 ? 1 : 0,
																borderColor: "divider",
															}}
														>
															<Typography
																variant="caption"
																color="text.secondary"
																sx={{
																	fontFamily: "monospace",
																}}
															>
																{collName}
															</Typography>
															{collectionsQuery.isLoading ? (
																<ShimmerSkeleton width={30} height={16} />
															) : (
																<Chip
																	label={countsByCollection.get(collName) ?? 0}
																	size="small"
																	variant="outlined"
																	sx={{
																		height: 20,
																		minWidth: 32,
																		fontFamily: "monospace",
																		fontSize: "0.7rem",
																		"& .MuiChip-label": {
																			px: 0.75,
																		},
																	}}
																/>
															)}
														</Box>
													))}
												</Box>

												{/* Clear button */}
												<Box
													sx={{
														mt: "auto",
														pt: 1.5,
													}}
												>
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
														onClick={() => openConfirmForGroup(group)}
														sx={{
															py: 1,
															fontWeight: 600,
															borderStyle: "dashed",
															"&:hover": {
																borderStyle: "solid",
															},
														}}
													>
														{isClearing
															? "Clearing..."
															: isEmpty
																? "Empty"
																: `Clear All ${group.name} Data`}
													</Button>
												</Box>
											</CardContent>
										</Card>
									</motion.div>
								</motion.div>
							</Grid>
						);
					})}
				</Grid>
			</motion.div>

			{/* Destructive confirm dialog */}
			<DestructiveConfirmDialog
				open={confirmOpen}
				title={confirmTitle}
				message={
					<Box
						component="span"
						sx={{
							display: "flex",
							flexDirection: "column",
							gap: 1,
						}}
					>
						<Typography variant="body2" component="span">
							This action cannot be undone. The following collections will be
							permanently cleared:
						</Typography>
						<Box component="ul" sx={{ m: 0, pl: 2 }}>
							{selectedGroups.flatMap((group) =>
								group.collections.map((name) => (
									<Typography
										key={name}
										component="li"
										variant="body2"
										sx={{ fontFamily: "monospace" }}
									>
										{name} — {countsByCollection.get(name) ?? 0} documents
									</Typography>
								)),
							)}
						</Box>
						<Typography
							variant="body2"
							component="span"
							sx={{ fontWeight: 600 }}
						>
							Total: {confirmTotal} documents will be deleted
						</Typography>
					</Box>
				}
				confirmLabel="Delete All"
				loading={clearMutation.isPending}
				onConfirm={handleConfirm}
				onCancel={() => setConfirmOpen(false)}
			/>
		</PageTransition>
	);
}
