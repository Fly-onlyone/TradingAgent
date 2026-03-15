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
    TextField,
    Typography,
} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {createFileRoute} from "@tanstack/react-router";
import {motion} from "framer-motion";
import {useState} from "react";
import {newsApi} from "@/api/endpoints/news";
import {EmptyState} from "@/components/common/EmptyState";
import {PageTransition} from "@/components/common/PageTransition";
import {ShimmerSkeleton} from "@/components/common/ShimmerSkeleton";
import {SentimentBadge} from "@/components/data-display/SentimentBadge";
import {StatCard} from "@/components/data-display/StatCard";
import {useDebounce} from "@/hooks/useDebounce";
import type {NewsArticle} from "@/types";
import {spring} from "@/utils/animations/variants";
import {formatRelativeTime} from "@/utils/formatters";
import {requireAuth} from "./-guards";

export const Route = createFileRoute("/news")({
    beforeLoad: requireAuth,
    component: NewsPage,
});

function NewsPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const debouncedQuery = useDebounce(searchQuery, 300);

    const {data: marketSentiment, isLoading: loadingSentiment} = useQuery({
        queryKey: ["marketSentiment"],
        queryFn: () => newsApi.getMarketSentiment(),
    });

    const {data: articles, isLoading: loadingArticles} = useQuery({
        queryKey: ["news", debouncedQuery],
        queryFn: () =>
            debouncedQuery
                ? newsApi.searchNews(debouncedQuery, 20)
                : newsApi.getArticles({pageSize: 20}).then((r) => r.items ?? []),
    });

    return (
        <PageTransition pageKey="news">
            <Box>
                <Typography variant="h4" fontWeight={700} gutterBottom>
                    News & Sentiment
                </Typography>

                {/* Market Sentiment Overview */}
                <Grid container spacing={3} sx={{mb: 4}}>
                    <Grid size={{xs: 12, md: 4}}>
                        <StatCard
                            title="Overall Market Sentiment"
                            value={marketSentiment?.overallMarketSentiment.toFixed(2) || "-"}
                            loading={loadingSentiment}
                        />
                    </Grid>
                    <Grid size={{xs: 12, md: 4}}>
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
                    <Grid size={{xs: 12, md: 4}}>
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
                    onChange={(e) => setSearchQuery(e.target.value)}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon/>
                                </InputAdornment>
                            ),
                        },
                    }}
                    sx={{mb: 3}}
                />

                {/* News Articles */}
                <Grid container spacing={2}>
                    {loadingArticles ? (
                        Array.from({length: 6}).map((_, i) => (
                            <Grid key={i} size={{xs: 12, md: 6, lg: 4}}>
                                <ShimmerSkeleton shimmerVariant="card"/>
                            </Grid>
                        ))
                    ) : articles && articles.length > 0 ? (
                        articles.map((article, index) => (
                            <Grid key={article.id} size={{xs: 12, md: 6, lg: 4}}>
                                <motion.div
                                    initial={{opacity: 0, y: 40, scale: 0.95}}
                                    animate={{opacity: 1, y: 0, scale: 1}}
                                    transition={{...spring.snappy, delay: index * 0.06}}
                                >
                                    <NewsCard article={article}/>
                                </motion.div>
                            </Grid>
                        ))
                    ) : (
                        <Grid size={{xs: 12}}>
                            <EmptyState
                                title="No news found"
                                description={
                                    searchQuery
                                        ? "Try a different search term"
                                        : "No news articles available"
                                }
                            />
                        </Grid>
                    )}
                </Grid>
            </Box>
        </PageTransition>
    );
}

function NewsCard({article}: { article: NewsArticle }) {
    return (
        <Card
            component={motion.div}
            whileHover={{
                y: -6,
                transition: {type: "spring", stiffness: 400, damping: 30},
            }}
            whileTap={{scale: 0.98}}
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
            <CardContent sx={{flex: 1}}>
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
                            <SentimentBadge score={article.sentimentScore} size="small"/>
                        )}
                </Box>

                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    {article.title}
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                    {article.summary || article.content.slice(0, 150)}...
                </Typography>

                {/* Mentioned Assets */}
                {article.mentionedAssets && article.mentionedAssets.length > 0 && (
                    <Box sx={{display: "flex", gap: 0.5, flexWrap: "wrap", mb: 2}}>
                        {article.mentionedAssets.slice(0, 5).map((asset) => (
                            <Chip key={asset} label={asset} size="small" variant="outlined"/>
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
                        sx={{display: "flex", alignItems: "center", gap: 0.5}}
                    >
                        Read more <OpenInNewIcon fontSize="small"/>
                    </MuiLink>
                </Box>
            </CardContent>
        </Card>
    );
}
