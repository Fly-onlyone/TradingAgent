/**
 * News Page
 */

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SearchIcon from "@mui/icons-material/Search";
import {
	Box,
	Card,
	CardContent,
	Chip,
	Grid2 as Grid,
	InputAdornment,
	Link as MuiLink,
	TablePagination,
	TextField,
	Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { newsApi } from "@/api/endpoints/news";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { SentimentBadge } from "@/components/data-display/SentimentBadge";
import { StatCard } from "@/components/data-display/StatCard";
import { useDebounce } from "@/hooks/useDebounce";
import type { NewsArticle, PaginatedResponse } from "@/types";
import { spring } from "@/utils/animations/variants";
import { formatRelativeTime } from "@/utils/formatters";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/news")({
	beforeLoad: requireAuth,
	component: NewsPage,
});

function NewsPage() {
	type NewsQueryResponse = PaginatedResponse<NewsArticle> | NewsArticle[];

	const [searchQuery, setSearchQuery] = useState("");
	const [sourceFilter, setSourceFilter] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const debouncedQuery = useDebounce(searchQuery, 300);

	/** Reset to page 1 when filters change */
	const handleSearchChange = useCallback((value: string) => {
		setSearchQuery(value);
		setPage(1);
	}, []);

	const handleSourceFilterChange = useCallback((source: string | null) => {
		setSourceFilter(source);
		setPage(1);
	}, []);

	const { data: marketSentiment, isLoading: loadingSentiment } = useQuery({
		queryKey: ["marketSentiment"],
		queryFn: () => newsApi.getMarketSentiment(),
	});

	const { data: articlesResponse, isLoading: loadingArticles } =
		useQuery<NewsQueryResponse>({
			queryKey: ["news", debouncedQuery, page, pageSize],
			queryFn: async (): Promise<NewsQueryResponse> =>
				debouncedQuery
					? newsApi.searchNews(debouncedQuery, pageSize)
					: newsApi.getArticles({ page, pageSize }),
			placeholderData: keepPreviousData,
		});

	// Normalize response: searchNews returns an array, getArticles returns PaginatedResponse
	const articles = useMemo(() => {
		if (!articlesResponse) return [];
		if (Array.isArray(articlesResponse)) return articlesResponse;
		return articlesResponse.items ?? [];
	}, [articlesResponse]);

	const totalArticles = useMemo(() => {
		if (!articlesResponse) return 0;
		if (Array.isArray(articlesResponse)) return articlesResponse.length;
		return articlesResponse.total ?? 0;
	}, [articlesResponse]);

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
		return articles.filter(
			(article: NewsArticle) => article.source?.name === sourceFilter,
		);
	}, [articles, sourceFilter]);

	return (
		<PageTransition pageKey="news">
			<Box>
				<SectionHeader
					title="News & Sentiment"
					subtitle="Market news and sentiment analysis used by the agent"
				/>

				{/* Market Sentiment Overview */}
				<Grid container spacing={3} sx={{ mb: 4 }}>
					<Grid size={{ xs: 12, md: 4 }}>
						<Card sx={{ p: 2 }}>
							<Typography
								variant="subtitle2"
								color="text.secondary"
								sx={{ mb: 1.5 }}
							>
								Overall Market Sentiment
							</Typography>
							{loadingSentiment ? (
								<ShimmerSkeleton />
							) : (
								<>
									<Box
										sx={{
											position: "relative",
											height: 8,
											borderRadius: 4,
											overflow: "hidden",
											bgcolor: "rgba(255,255,255,0.06)",
										}}
									>
										<Box
											sx={{
												position: "absolute",
												left: 0,
												top: 0,
												bottom: 0,
												width: `${Math.max(5, Math.min(100, (((sentimentScore ?? 0) + 1) / 2) * 100))}%`,
												borderRadius: 4,
												background:
													(sentimentScore ?? 0) > 0.2
														? (theme) => theme.palette.success.main
														: (sentimentScore ?? 0) < -0.2
															? (theme) => theme.palette.error.main
															: (theme) => theme.palette.warning.main,
												transition: "width 0.5s ease, background 0.3s ease",
											}}
										/>
									</Box>
									<Box
										sx={{
											display: "flex",
											justifyContent: "space-between",
											mt: 0.75,
										}}
									>
										<Typography variant="caption" color="error.main">
											Bearish
										</Typography>
										<Typography variant="caption" fontWeight={600}>
											{sentimentScore != null
												? sentimentScore.toFixed(2)
												: "N/A"}
										</Typography>
										<Typography variant="caption" color="success.main">
											Bullish
										</Typography>
									</Box>
								</>
							)}
						</Card>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
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
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
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
					</Grid>
				</Grid>

				{/* Search */}
				<TextField
					fullWidth
					placeholder="Search news..."
					value={searchQuery}
					onChange={(e) => handleSearchChange(e.target.value)}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon />
								</InputAdornment>
							),
						},
					}}
					sx={{ mb: 2 }}
				/>

				{/* Source filter chips */}
				<Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap" }}>
					<Chip
						label="All"
						variant={!sourceFilter ? "filled" : "outlined"}
						onClick={() => handleSourceFilterChange(null)}
						size="small"
					/>
					{uniqueSources.map((source) => (
						<Chip
							key={source}
							label={source}
							variant={sourceFilter === source ? "filled" : "outlined"}
							onClick={() =>
								handleSourceFilterChange(
									source === sourceFilter ? null : source,
								)
							}
							size="small"
						/>
					))}
				</Box>

				{/* News Articles */}
				<Grid container spacing={2}>
					{loadingArticles ? (
						Array.from(
							{ length: 6 },
							(_, index) => `news-loading-${String(index)}`,
						).map((cardId) => (
							<Grid key={cardId} size={{ xs: 12, md: 6, lg: 4 }}>
								<ShimmerSkeleton shimmerVariant="card" />
							</Grid>
						))
					) : filteredArticles.length > 0 ? (
						filteredArticles.map((article: NewsArticle, index: number) => (
							<Grid
								key={article.id}
								size={{
									xs: 12,
									sm: index === 0 ? 12 : 6,
									md: index === 0 ? 12 : 4,
								}}
							>
								<motion.div
									initial={{ opacity: 0, y: 40, scale: 0.95 }}
									animate={{ opacity: 1, y: 0, scale: 1 }}
									transition={{ ...spring.snappy, delay: index * 0.06 }}
								>
									<NewsCard article={article} featured={index === 0} />
								</motion.div>
							</Grid>
						))
					) : (
						<Grid size={{ xs: 12 }}>
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
						</Grid>
					)}
				</Grid>

				{/* Pagination */}
				{!loadingArticles && !debouncedQuery && totalArticles > 0 && (
					<TablePagination
						component="div"
						count={totalArticles}
						page={page - 1}
						onPageChange={(_, newPage) => setPage(newPage + 1)}
						rowsPerPage={pageSize}
						onRowsPerPageChange={(e) => {
							setPageSize(parseInt(e.target.value, 10));
							setPage(1);
						}}
						rowsPerPageOptions={[10, 20, 50]}
						sx={{ mt: 2 }}
					/>
				)}
			</Box>
		</PageTransition>
	);
}

function NewsCard({
	article,
	featured = false,
}: {
	article: NewsArticle;
	featured?: boolean;
}) {
	return (
		<Card
			component={motion.div}
			whileHover={{
				y: -6,
				transition: { type: "spring", stiffness: 400, damping: 30 },
			}}
			whileTap={{ scale: 0.98 }}
			sx={{
				height: "100%",
				display: "flex",
				flexDirection: "column",
				cursor: "pointer",
				"&:hover": {
					borderColor: "primary.main",
				},
			}}
		>
			<CardContent sx={{ flex: 1 }}>
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						mb: 1,
					}}
				>
					<Typography variant="caption" color="text.secondary">
						{article.source?.name || "Unknown Source"}
					</Typography>
					{article.sentimentScore !== null &&
						article.sentimentScore !== undefined && (
							<SentimentBadge score={article.sentimentScore} size="small" />
						)}
				</Box>

				<Typography
					variant={featured ? "h5" : "subtitle1"}
					fontWeight={600}
					gutterBottom
				>
					{article.title}
				</Typography>

				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					{article.summary || article.content.slice(0, 150)}...
				</Typography>

				{/* Mentioned Assets */}
				{article.mentionedAssets && article.mentionedAssets.length > 0 && (
					<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2 }}>
						{article.mentionedAssets.slice(0, 5).map((asset) => (
							<Chip key={asset} label={asset} size="small" variant="outlined" />
						))}
					</Box>
				)}

				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<Typography variant="caption" color="text.secondary">
						{article.publishedAt
							? formatRelativeTime(article.publishedAt)
							: "Unknown date"}
					</Typography>
					<MuiLink
						href={article.url}
						target="_blank"
						rel="noopener noreferrer"
						sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
					>
						Read more <OpenInNewIcon fontSize="small" />
					</MuiLink>
				</Box>
			</CardContent>
		</Card>
	);
}
