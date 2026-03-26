/**
 * News Page
 */

import { ExternalLink, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { newsApi } from "@/api/endpoints/news";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { SentimentBadge } from "@/components/data-display/SentimentBadge";
import { StatCard } from "@/components/data-display/StatCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import type { NewsArticle } from "@/types";
import { spring } from "@/utils/animations/variants";
import { formatRelativeTime } from "@/utils/formatters";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/news")({
	beforeLoad: requireAuth,
	component: NewsPage,
});

function NewsPage() {
	const [searchQuery, setSearchQuery] = useState("");
	const [sourceFilter, setSourceFilter] = useState<string | null>(null);
	const debouncedQuery = useDebounce(searchQuery, 300);

	const { data: marketSentiment, isLoading: loadingSentiment } = useQuery({
		queryKey: ["marketSentiment"],
		queryFn: () => newsApi.getMarketSentiment(),
	});

	const { data: articles, isLoading: loadingArticles } = useQuery({
		queryKey: ["news", debouncedQuery],
		queryFn: () =>
			debouncedQuery
				? newsApi.searchNews(debouncedQuery, 20)
				: newsApi.getArticles({ pageSize: 20 }).then((r) => r.items ?? []),
	});

	const sentimentScore = marketSentiment?.overallMarketSentiment ?? null;

	const uniqueSources = useMemo(() => {
		if (!articles) return [];
		const sources = new Set<string>();
		for (const article of articles) {
			const name = article.source?.name;
			if (name) sources.add(name);
		}
		return Array.from(sources).sort();
	}, [articles]);

	const filteredArticles = useMemo(() => {
		if (!articles) return [];
		if (!sourceFilter) return articles;
		return articles.filter((a) => a.source?.name === sourceFilter);
	}, [articles, sourceFilter]);

	return (
		<PageTransition pageKey="news">
			<div>
				<SectionHeader
					title="News & Sentiment"
					subtitle="Market news and sentiment analysis used by the agent"
				/>

				{/* Market Sentiment Overview */}
				<div className="mb-8 grid grid-cols-12 gap-6">
					<div className="col-span-12 md:col-span-4">
						<Card className="p-4">
							<span className="mb-3 block text-sm font-medium text-[var(--text-secondary)]">
								Overall Market Sentiment
							</span>
							{loadingSentiment ? (
								<ShimmerSkeleton shimmerVariant="text" />
							) : (
								<>
									<div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
										<div
											className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
											style={{
												width: `${Math.max(5, Math.min(100, ((sentimentScore ?? 0) + 1) / 2 * 100))}%`,
												background:
													(sentimentScore ?? 0) > 0.2
														? "var(--color-success, #22c55e)"
														: (sentimentScore ?? 0) < -0.2
															? "var(--color-error, #ef4444)"
															: "var(--color-warning, #f59e0b)",
											}}
										/>
									</div>
									<div className="mt-1.5 flex justify-between">
										<span className="text-xs text-red-500">Bearish</span>
										<span className="text-xs font-semibold">
											{sentimentScore != null
												? sentimentScore.toFixed(2)
												: "N/A"}
										</span>
										<span className="text-xs text-green-500">Bullish</span>
									</div>
								</>
							)}
						</Card>
					</div>
					<div className="col-span-12 md:col-span-4">
						<StatCard
							title="Bullish Assets"
							value={
								loadingSentiment
									? ""
									: marketSentiment?.bullishOutliers.length
										? marketSentiment.bullishOutliers.join(", ")
										: "None"
							}
							loading={loadingSentiment}
						/>
					</div>
					<div className="col-span-12 md:col-span-4">
						<StatCard
							title="Bearish Assets"
							value={
								loadingSentiment
									? ""
									: marketSentiment?.bearishOutliers.length
										? marketSentiment.bearishOutliers.join(", ")
										: "None"
							}
							loading={loadingSentiment}
						/>
					</div>
				</div>

				{/* Search */}
				<div className="relative mb-4">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
					<Input
						placeholder="Search news..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-10"
					/>
				</div>

				{/* Source filter chips */}
				<div className="mb-6 flex flex-wrap gap-2">
					<Badge
						variant={!sourceFilter ? "default" : "outline"}
						className="cursor-pointer"
						onClick={() => setSourceFilter(null)}
					>
						All
					</Badge>
					{uniqueSources.map((source) => (
						<Badge
							key={source}
							variant={sourceFilter === source ? "default" : "outline"}
							className="cursor-pointer"
							onClick={() =>
								setSourceFilter(source === sourceFilter ? null : source)
							}
						>
							{source}
						</Badge>
					))}
				</div>

				{/* News Articles */}
				<div className="grid grid-cols-12 gap-4">
					{loadingArticles ? (
						Array.from({ length: 6 }).map((_, i) => (
							<div key={i} className="col-span-12 md:col-span-6 lg:col-span-4">
								<ShimmerSkeleton shimmerVariant="card" />
							</div>
						))
					) : filteredArticles.length > 0 ? (
						filteredArticles.map((article, index) => (
							<div
								key={article.id}
								className={cn(
									"col-span-12",
									index === 0
										? "sm:col-span-12 md:col-span-12"
										: "sm:col-span-6 md:col-span-4",
								)}
							>
								<motion.div
									initial={{ opacity: 0, y: 40, scale: 0.95 }}
									animate={{ opacity: 1, y: 0, scale: 1 }}
									transition={{ ...spring.snappy, delay: index * 0.06 }}
								>
									<NewsCard article={article} featured={index === 0} />
								</motion.div>
							</div>
						))
					) : (
						<div className="col-span-12">
							<EmptyState
								title="No news found"
								description={
									searchQuery
										? "Try a different search term"
										: sourceFilter
											? "No articles from this source"
											: "No news articles available"
								}
							/>
						</div>
					)}
				</div>
			</div>
		</PageTransition>
	);
}

function NewsCard({
	article,
	featured = false,
}: { article: NewsArticle; featured?: boolean }) {
	return (
		<motion.div
			whileHover={{
				y: -6,
				transition: { type: "spring", stiffness: 400, damping: 30 },
			}}
			whileTap={{ scale: 0.98 }}
			className="h-full"
		>
			<Card className="flex h-full cursor-pointer flex-col transition-colors hover:ring-[var(--primary)]">
				<CardContent className="flex-1">
					<div className="mb-2 flex items-start justify-between">
						<span className="text-xs text-[var(--text-secondary)]">
							{article.source?.name || "Unknown Source"}
						</span>
						{article.sentimentScore !== null &&
							article.sentimentScore !== undefined && (
								<SentimentBadge score={article.sentimentScore} size="small" />
							)}
					</div>

					<h6
						className={cn(
							"mb-2 font-semibold",
							featured ? "text-xl" : "text-base",
						)}
					>
						{article.title}
					</h6>

					<p className="mb-4 text-sm text-[var(--text-secondary)]">
						{article.summary || article.content.slice(0, 150)}...
					</p>

					{/* Mentioned Assets */}
					{article.mentionedAssets && article.mentionedAssets.length > 0 && (
						<div className="mb-4 flex flex-wrap gap-1">
							{article.mentionedAssets.slice(0, 5).map((asset) => (
								<Badge key={asset} variant="outline">
									{asset}
								</Badge>
							))}
						</div>
					)}

					<div className="flex items-center justify-between">
						<span className="text-xs text-[var(--text-secondary)]">
							{article.publishedAt
								? formatRelativeTime(article.publishedAt)
								: "Unknown date"}
						</span>
						<a
							href={article.url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
						>
							Read more <ExternalLink className="size-3.5" />
						</a>
					</div>
				</CardContent>
			</Card>
		</motion.div>
	);
}
