/**
 * Knowledge Base Page
 */

import PatternIcon from "@mui/icons-material/AutoGraph";
import SchoolIcon from "@mui/icons-material/School";
import SearchIcon from "@mui/icons-material/Search";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Dialog,
	DialogContent,
	DialogTitle,
	Grid2 as Grid,
	InputAdornment,
	Tab,
	Tabs,
	TextField,
	Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { knowledgeApi } from "@/api/endpoints/knowledge";
import { EmptyState } from "@/components/common/EmptyState";
import { MetricRow } from "@/components/common/MetricRow";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { useDebounce } from "@/hooks/useDebounce";
import type { StrategyKnowledge, TradeLesson, TradingPattern } from "@/types";
import { staggerCascade, tabSwitch } from "@/utils/animations/variants";
import { formatPercent, formatRelativeTime } from "@/utils/formatters";
import { requireAuth } from "../-guards";

export const Route = createFileRoute("/knowledge/")({
	beforeLoad: requireAuth,
	component: KnowledgePage,
});

function KnowledgePage() {
	const [tabValue, setTabValue] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedQuery = useDebounce(searchQuery, 300);
	const [selectedItem, setSelectedItem] = useState<
		StrategyKnowledge | TradeLesson | TradingPattern | null
	>(null);
	const [detailType, setDetailType] = useState<
		"strategy" | "lesson" | "pattern" | null
	>(null);

	const [strategiesLimit, setStrategiesLimit] = useState(20);
	const [lessonsLimit, setLessonsLimit] = useState(20);
	const [patternsLimit, setPatternsLimit] = useState(20);

	const { data: searchResults, isLoading: searching } = useQuery({
		queryKey: ["knowledge-search", debouncedQuery],
		queryFn: () =>
			knowledgeApi.search({ query: debouncedQuery, limitPerType: 10 }),
		enabled: debouncedQuery.length > 0,
	});

	const { data: strategies, isLoading: loadingStrategies, isFetching: fetchingStrategies } = useQuery({
		queryKey: ["knowledge-strategies", strategiesLimit],
		queryFn: () => knowledgeApi.getStrategies(strategiesLimit),
		enabled: tabValue === 0 && !debouncedQuery,
		placeholderData: keepPreviousData,
	});

	const { data: lessons, isLoading: loadingLessons, isFetching: fetchingLessons } = useQuery({
		queryKey: ["knowledge-lessons", lessonsLimit],
		queryFn: () => knowledgeApi.getLessons({ limit: lessonsLimit }),
		enabled: tabValue === 1 && !debouncedQuery,
		placeholderData: keepPreviousData,
	});

	const { data: patterns, isLoading: loadingPatterns, isFetching: fetchingPatterns } = useQuery({
		queryKey: ["knowledge-patterns", patternsLimit],
		queryFn: () => knowledgeApi.getPatterns({ limit: patternsLimit }),
		enabled: tabValue === 2 && !debouncedQuery,
		placeholderData: keepPreviousData,
	});

	const isLoading =
		searching || loadingStrategies || loadingLessons || loadingPatterns;

	// Determine what to display
	const displayStrategies = debouncedQuery
		? searchResults?.strategies
		: strategies;
	const displayLessons = debouncedQuery ? searchResults?.lessons : lessons;
	const displayPatterns = debouncedQuery ? searchResults?.patterns : patterns;

	return (
		<PageTransition pageKey="knowledge">
			<Box>
				<SectionHeader
					title="Knowledge Base"
					subtitle="Strategies, lessons, and patterns learned by the agent"
				/>

				{/* Search */}
				<TextField
					fullWidth
					placeholder="Search knowledge base..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon />
								</InputAdornment>
							),
							endAdornment: searching ? (
								<InputAdornment position="end">
									<CircularProgress size={18} />
								</InputAdornment>
							) : undefined,
						},
					}}
					sx={{ mb: 3 }}
				/>

				{/* Tabs */}
				<Tabs
					value={tabValue}
					onChange={(_, v) => setTabValue(v)}
					sx={{ mb: 3 }}
				>
					<Tab
						icon={<SchoolIcon />}
						iconPosition="start"
						label={`Strategies (${displayStrategies?.length || 0})`}
					/>
					<Tab
						icon={<TrendingUpIcon />}
						iconPosition="start"
						label={`Lessons (${displayLessons?.length || 0})`}
					/>
					<Tab
						icon={<PatternIcon />}
						iconPosition="start"
						label={`Patterns (${displayPatterns?.length || 0})`}
					/>
				</Tabs>

				{/* Content */}
				{isLoading ? (
					<Grid container spacing={2}>
						{Array.from({ length: 6 }).map((_, i) => (
							<Grid key={i} size={{ xs: 12, md: 6, lg: 4 }}>
								<ShimmerSkeleton shimmerVariant="card" sx={{ height: 180 }} />
							</Grid>
						))}
					</Grid>
				) : (
					<AnimatePresence mode="wait">
						<motion.div
							key={tabValue}
							variants={tabSwitch}
							initial="initial"
							animate="animate"
							exit="exit"
						>
							<motion.div
								variants={staggerCascade.container}
								initial="hidden"
								animate="visible"
							>
								<Grid container spacing={2}>
									{/* Strategies Tab */}
									{tabValue === 0 &&
										(displayStrategies &&
										displayStrategies.length > 0 ? (
											displayStrategies.map((strategy) => (
												<Grid
													key={strategy.id}
													size={{ xs: 12, md: 6, lg: 4 }}
												>
													<motion.div
														variants={staggerCascade.item}
													>
														<StrategyCard
															strategy={strategy}
															onClick={() => {
																setSelectedItem(strategy);
																setDetailType("strategy");
															}}
														/>
													</motion.div>
												</Grid>
											))
										) : (
											<Grid size={{ xs: 12 }}>
												<EmptyState
													icon={<SchoolIcon />}
													title="No strategies found"
													description={
														debouncedQuery
															? "Try a different search term"
															: "Add strategies to your knowledge base"
													}
												/>
											</Grid>
										))}

									{/* Lessons Tab */}
									{tabValue === 1 &&
										(displayLessons && displayLessons.length > 0 ? (
											displayLessons.map((lesson) => (
												<Grid
													key={lesson.id}
													size={{ xs: 12, md: 6 }}
												>
													<motion.div
														variants={staggerCascade.item}
													>
														<LessonCard
															lesson={lesson}
															onClick={() => {
																setSelectedItem(lesson);
																setDetailType("lesson");
															}}
														/>
													</motion.div>
												</Grid>
											))
										) : (
											<Grid size={{ xs: 12 }}>
												<EmptyState
													icon={<TrendingUpIcon />}
													title="No lessons found"
													description="Trade lessons will appear here after completing trades"
												/>
											</Grid>
										))}

									{/* Patterns Tab */}
									{tabValue === 2 &&
										(displayPatterns &&
										displayPatterns.length > 0 ? (
											displayPatterns.map((pattern) => (
												<Grid
													key={pattern.id}
													size={{ xs: 12, md: 6, lg: 4 }}
												>
													<motion.div
														variants={staggerCascade.item}
													>
														<PatternCard
															pattern={pattern}
															onClick={() => {
																setSelectedItem(pattern);
																setDetailType("pattern");
															}}
														/>
													</motion.div>
												</Grid>
											))
										) : (
											<Grid size={{ xs: 12 }}>
												<EmptyState
													icon={<PatternIcon />}
													title="No patterns found"
													description="Trading patterns will be discovered as you trade"
												/>
											</Grid>
										))}
								</Grid>

									{/* Load More buttons (only in non-search mode) */}
									{!debouncedQuery && tabValue === 0 && displayStrategies && displayStrategies.length >= strategiesLimit && (
										<Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
											<Button
												variant="outlined"
												onClick={() => setStrategiesLimit((prev) => prev + 20)}
												disabled={fetchingStrategies}
												startIcon={fetchingStrategies ? <CircularProgress size={16} /> : undefined}
											>
												{fetchingStrategies ? "Loading..." : "Load More"}
											</Button>
										</Box>
									)}
									{!debouncedQuery && tabValue === 1 && displayLessons && displayLessons.length >= lessonsLimit && (
										<Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
											<Button
												variant="outlined"
												onClick={() => setLessonsLimit((prev) => prev + 20)}
												disabled={fetchingLessons}
												startIcon={fetchingLessons ? <CircularProgress size={16} /> : undefined}
											>
												{fetchingLessons ? "Loading..." : "Load More"}
											</Button>
										</Box>
									)}
									{!debouncedQuery && tabValue === 2 && displayPatterns && displayPatterns.length >= patternsLimit && (
										<Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
											<Button
												variant="outlined"
												onClick={() => setPatternsLimit((prev) => prev + 20)}
												disabled={fetchingPatterns}
												startIcon={fetchingPatterns ? <CircularProgress size={16} /> : undefined}
											>
												{fetchingPatterns ? "Loading..." : "Load More"}
											</Button>
										</Box>
									)}
							</motion.div>
						</motion.div>
					</AnimatePresence>
				)}

				{/* Detail Dialog */}
				<Dialog
					open={!!selectedItem}
					onClose={() => setSelectedItem(null)}
					maxWidth="sm"
					fullWidth
				>
					<DialogTitle>
						{selectedItem && "name" in selectedItem
							? selectedItem.name
							: selectedItem && "patternName" in selectedItem
								? selectedItem.patternName
								: selectedItem && "symbol" in selectedItem
									? selectedItem.symbol
									: "Details"}
					</DialogTitle>
					<DialogContent>
						{detailType === "strategy" &&
							selectedItem &&
							"name" in selectedItem && (
								<>
									<Typography variant="body2" sx={{ mb: 2 }}>
										{(selectedItem as StrategyKnowledge).description}
									</Typography>
									{(selectedItem as StrategyKnowledge).winRate !=
										null && (
										<MetricRow
											label="Win Rate"
											value={`${((selectedItem as StrategyKnowledge).winRate ?? 0).toFixed(1)}%`}
										/>
									)}
								</>
							)}
						{detailType === "lesson" &&
							selectedItem &&
							"lessonSummary" in selectedItem && (
								<>
									<MetricRow
										label="Symbol"
										value={
											(selectedItem as TradeLesson).symbol
										}
									/>
									<MetricRow
										label="Side"
										value={(
											selectedItem as TradeLesson
										).side.toUpperCase()}
									/>
									<MetricRow
										label="Outcome"
										value={
											(selectedItem as TradeLesson).outcome
										}
									/>
									<Typography variant="body2" sx={{ mt: 2 }}>
										{
											(selectedItem as TradeLesson)
												.lessonSummary
										}
									</Typography>
								</>
							)}
						{detailType === "pattern" &&
							selectedItem &&
							"patternType" in selectedItem && (
								<>
									<MetricRow
										label="Type"
										value={
											(selectedItem as TradingPattern)
												.patternType
										}
									/>
									<MetricRow
										label="Success Rate"
										value={`${(selectedItem as TradingPattern).successRate.toFixed(1)}%`}
									/>
									<Typography variant="body2" sx={{ mt: 2 }}>
										{
											(selectedItem as TradingPattern)
												.description
										}
									</Typography>
								</>
							)}
					</DialogContent>
				</Dialog>
			</Box>
		</PageTransition>
	);
}

function StrategyCard({
	strategy,
	onClick,
}: { strategy: StrategyKnowledge; onClick?: () => void }) {
	return (
		<Card onClick={onClick} sx={{ cursor: onClick ? "pointer" : "default" }}>
			<CardContent>
				<Typography variant="h6" fontWeight={600} gutterBottom>
					{strategy.name}
				</Typography>
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ mb: 2, minHeight: 48 }}
				>
					{strategy.description?.slice(0, 100) || "No description"}...
				</Typography>
				{strategy.winRate && (
					<Chip
						label={`Win Rate: ${strategy.winRate.toFixed(1)}%`}
						size="small"
						color={strategy.winRate >= 50 ? "success" : "error"}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function LessonCard({
	lesson,
	onClick,
}: { lesson: TradeLesson; onClick?: () => void }) {
	const outcomeColor =
		lesson.outcome === "profit"
			? "success"
			: lesson.outcome === "loss"
				? "error"
				: "default";

	return (
		<Card onClick={onClick} sx={{ cursor: onClick ? "pointer" : "default" }}>
			<CardContent>
				<Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
					<Box sx={{ display: "flex", gap: 1 }}>
						<Chip label={lesson.symbol} size="small" />
						<Chip
							label={lesson.side.toUpperCase()}
							size="small"
							color={lesson.side === "buy" ? "success" : "error"}
						/>
					</Box>
					<Chip
						label={`${lesson.outcome} ${formatPercent(lesson.profitPercent)}`}
						size="small"
						color={outcomeColor}
					/>
				</Box>
				<Typography variant="body2" sx={{ mb: 1 }}>
					{lesson.lessonSummary}
				</Typography>
				<Typography variant="caption" color="text.secondary">
					{formatRelativeTime(lesson.createdAt)}
				</Typography>
			</CardContent>
		</Card>
	);
}

function PatternCard({
	pattern,
	onClick,
}: { pattern: TradingPattern; onClick?: () => void }) {
	return (
		<Card onClick={onClick} sx={{ cursor: onClick ? "pointer" : "default" }}>
			<CardContent>
				<Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
					<Typography variant="h6" fontWeight={600}>
						{pattern.patternName}
					</Typography>
					<Chip label={pattern.patternType} size="small" variant="outlined" />
				</Box>
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ mb: 2, minHeight: 48 }}
				>
					{pattern.description?.slice(0, 100) || "No description"}...
				</Typography>
				<Box sx={{ display: "flex", gap: 1 }}>
					<Chip
						label={`Success: ${pattern.successRate.toFixed(1)}%`}
						size="small"
						color={
							pattern.successRate >= 60
								? "success"
								: pattern.successRate >= 40
									? "warning"
									: "error"
						}
					/>
					<Chip
						label={`Avg Return: ${formatPercent(pattern.avgReturn)}`}
						size="small"
						variant="outlined"
					/>
				</Box>
			</CardContent>
		</Card>
	);
}
