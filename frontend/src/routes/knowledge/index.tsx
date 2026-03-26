/**
 * Knowledge Base Page
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
	GraduationCap,
	LineChart,
	Loader2,
	Search,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { knowledgeApi } from "@/api/endpoints/knowledge";
import { EmptyState } from "@/components/common/EmptyState";
import { MetricRow } from "@/components/common/MetricRow";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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
	const [tabValue, setTabValue] = useState("strategies");
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedQuery = useDebounce(searchQuery, 300);
	const [selectedItem, setSelectedItem] = useState<
		StrategyKnowledge | TradeLesson | TradingPattern | null
	>(null);
	const [detailType, setDetailType] = useState<
		"strategy" | "lesson" | "pattern" | null
	>(null);

	const { data: searchResults, isLoading: searching } = useQuery({
		queryKey: ["knowledge-search", debouncedQuery],
		queryFn: () =>
			knowledgeApi.search({ query: debouncedQuery, limitPerType: 10 }),
		enabled: debouncedQuery.length > 0,
	});

	const { data: strategies, isLoading: loadingStrategies } = useQuery({
		queryKey: ["knowledge-strategies"],
		queryFn: () => knowledgeApi.getStrategies(20),
		enabled: tabValue === "strategies" && !debouncedQuery,
	});

	const { data: lessons, isLoading: loadingLessons } = useQuery({
		queryKey: ["knowledge-lessons"],
		queryFn: () => knowledgeApi.getLessons({ limit: 20 }),
		enabled: tabValue === "lessons" && !debouncedQuery,
	});

	const { data: patterns, isLoading: loadingPatterns } = useQuery({
		queryKey: ["knowledge-patterns"],
		queryFn: () => knowledgeApi.getPatterns({ limit: 20 }),
		enabled: tabValue === "patterns" && !debouncedQuery,
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
			<div>
				<SectionHeader
					title="Knowledge Base"
					subtitle="Strategies, lessons, and patterns learned by the agent"
				/>

				{/* Search */}
				<div className="relative mb-6">
					<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-10"
						placeholder="Search knowledge base..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
					{searching && (
						<Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
					)}
				</div>

				{/* Tabs */}
				<Tabs value={tabValue} onValueChange={setTabValue}>
					<TabsList className="mb-6">
						<TabsTrigger value="strategies">
							<GraduationCap className="size-4" />
							Strategies ({displayStrategies?.length || 0})
						</TabsTrigger>
						<TabsTrigger value="lessons">
							<TrendingUp className="size-4" />
							Lessons ({displayLessons?.length || 0})
						</TabsTrigger>
						<TabsTrigger value="patterns">
							<LineChart className="size-4" />
							Patterns ({displayPatterns?.length || 0})
						</TabsTrigger>
					</TabsList>

					{/* Content */}
					{isLoading ? (
						<div className="grid grid-cols-12 gap-4">
							{Array.from({ length: 6 }).map((_, i) => (
								<div key={i} className="col-span-12 md:col-span-6 lg:col-span-4">
									<ShimmerSkeleton shimmerVariant="card" sx={{ height: 180 }} />
								</div>
							))}
						</div>
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
									<TabsContent value="strategies">
										<div className="grid grid-cols-12 gap-4">
											{displayStrategies &&
											displayStrategies.length > 0 ? (
												displayStrategies.map((strategy) => (
													<div
														key={strategy.id}
														className="col-span-12 md:col-span-6 lg:col-span-4"
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
													</div>
												))
											) : (
												<div className="col-span-12">
													<EmptyState
														icon={<GraduationCap className="size-6" />}
														title="No strategies found"
														description={
															debouncedQuery
																? "Try a different search term"
																: "Add strategies to your knowledge base"
														}
													/>
												</div>
											)}
										</div>
									</TabsContent>

									<TabsContent value="lessons">
										<div className="grid grid-cols-12 gap-4">
											{displayLessons && displayLessons.length > 0 ? (
												displayLessons.map((lesson) => (
													<div
														key={lesson.id}
														className="col-span-12 md:col-span-6"
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
													</div>
												))
											) : (
												<div className="col-span-12">
													<EmptyState
														icon={<TrendingUp className="size-6" />}
														title="No lessons found"
														description="Trade lessons will appear here after completing trades"
													/>
												</div>
											)}
										</div>
									</TabsContent>

									<TabsContent value="patterns">
										<div className="grid grid-cols-12 gap-4">
											{displayPatterns &&
											displayPatterns.length > 0 ? (
												displayPatterns.map((pattern) => (
													<div
														key={pattern.id}
														className="col-span-12 md:col-span-6 lg:col-span-4"
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
													</div>
												))
											) : (
												<div className="col-span-12">
													<EmptyState
														icon={<LineChart className="size-6" />}
														title="No patterns found"
														description="Trading patterns will be discovered as you trade"
													/>
												</div>
											)}
										</div>
									</TabsContent>
								</motion.div>
							</motion.div>
						</AnimatePresence>
					)}
				</Tabs>

				{/* Detail Dialog */}
				<Dialog
					open={!!selectedItem}
					onOpenChange={(open) => {
						if (!open) setSelectedItem(null);
					}}
				>
					<DialogContent className="sm:max-w-sm">
						<DialogHeader>
							<DialogTitle>
								{selectedItem && "name" in selectedItem
									? selectedItem.name
									: selectedItem && "patternName" in selectedItem
										? selectedItem.patternName
										: selectedItem && "symbol" in selectedItem
											? selectedItem.symbol
											: "Details"}
							</DialogTitle>
						</DialogHeader>
						{detailType === "strategy" &&
							selectedItem &&
							"name" in selectedItem && (
								<>
									<p className="mb-4 text-sm">
										{(selectedItem as StrategyKnowledge).description}
									</p>
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
									<p className="mt-4 text-sm">
										{
											(selectedItem as TradeLesson)
												.lessonSummary
										}
									</p>
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
									<p className="mt-4 text-sm">
										{
											(selectedItem as TradingPattern)
												.description
										}
									</p>
								</>
							)}
					</DialogContent>
				</Dialog>
			</div>
		</PageTransition>
	);
}

function StrategyCard({
	strategy,
	onClick,
}: { strategy: StrategyKnowledge; onClick?: () => void }) {
	return (
		<Card
			className={cn("cursor-pointer", !onClick && "cursor-default")}
			onClick={onClick}
		>
			<CardContent>
				<h3 className="mb-1 text-base font-semibold">
					{strategy.name}
				</h3>
				<p className="mb-4 min-h-[48px] text-sm text-muted-foreground">
					{strategy.description?.slice(0, 100) || "No description"}...
				</p>
				{strategy.winRate && (
					<Badge
						className={cn(
							strategy.winRate >= 50
								? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
								: "bg-red-500/20 text-red-400 border-red-500/30",
						)}
					>
						Win Rate: {strategy.winRate.toFixed(1)}%
					</Badge>
				)}
			</CardContent>
		</Card>
	);
}

function LessonCard({
	lesson,
	onClick,
}: { lesson: TradeLesson; onClick?: () => void }) {
	return (
		<Card
			className={cn("cursor-pointer", !onClick && "cursor-default")}
			onClick={onClick}
		>
			<CardContent>
				<div className="mb-2 flex justify-between">
					<div className="flex gap-2">
						<Badge variant="secondary">{lesson.symbol}</Badge>
						<Badge
							className={cn(
								lesson.side === "buy"
									? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
									: "bg-red-500/20 text-red-400 border-red-500/30",
							)}
						>
							{lesson.side.toUpperCase()}
						</Badge>
					</div>
					<Badge
						className={cn(
							lesson.outcome === "profit"
								? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
								: lesson.outcome === "loss"
									? "bg-red-500/20 text-red-400 border-red-500/30"
									: "",
						)}
					>
						{lesson.outcome} {formatPercent(lesson.profitPercent)}
					</Badge>
				</div>
				<p className="mb-2 text-sm">
					{lesson.lessonSummary}
				</p>
				<p className="text-xs text-muted-foreground">
					{formatRelativeTime(lesson.createdAt)}
				</p>
			</CardContent>
		</Card>
	);
}

function PatternCard({
	pattern,
	onClick,
}: { pattern: TradingPattern; onClick?: () => void }) {
	return (
		<Card
			className={cn("cursor-pointer", !onClick && "cursor-default")}
			onClick={onClick}
		>
			<CardContent>
				<div className="mb-2 flex items-center justify-between">
					<h3 className="text-base font-semibold">
						{pattern.patternName}
					</h3>
					<Badge variant="outline">{pattern.patternType}</Badge>
				</div>
				<p className="mb-4 min-h-[48px] text-sm text-muted-foreground">
					{pattern.description?.slice(0, 100) || "No description"}...
				</p>
				<div className="flex gap-2">
					<Badge
						className={cn(
							pattern.successRate >= 60
								? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
								: pattern.successRate >= 40
									? "bg-amber-500/20 text-amber-400 border-amber-500/30"
									: "bg-red-500/20 text-red-400 border-red-500/30",
						)}
					>
						Success: {pattern.successRate.toFixed(1)}%
					</Badge>
					<Badge variant="outline">
						Avg Return: {formatPercent(pattern.avgReturn)}
					</Badge>
				</div>
			</CardContent>
		</Card>
	);
}
