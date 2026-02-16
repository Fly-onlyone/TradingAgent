/**
 * News Page
 */

import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'
import {
    Box,
    Card,
    CardContent,
    Chip,
    Grid2 as Grid,
    InputAdornment,
    Link as MuiLink,
    Skeleton,
    TextField,
    Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import {useQuery} from '@tanstack/react-query'

import {PageTransition} from '@/components/common/PageTransition'
import {SentimentBadge} from '@/components/data-display/SentimentBadge'
import {StatCard} from '@/components/data-display/StatCard'
import {EmptyState} from '@/components/common/EmptyState'
import {newsApi} from '@/api/endpoints/news'
import {formatRelativeTime} from '@/utils/formatters'
import {useDebounce} from '@/hooks/useDebounce'
import type {NewsArticle} from '@/types'

export const Route = createFileRoute('/news')({
    component: NewsPage,
})

function NewsPage() {
    const [searchQuery, setSearchQuery] = useState('')
    const debouncedQuery = useDebounce(searchQuery, 300)

    const {data: marketSentiment, isLoading: loadingSentiment} = useQuery({
        queryKey: ['marketSentiment'],
        queryFn: () => newsApi.getMarketSentiment(),
    })

    const {data: articles, isLoading: loadingArticles} = useQuery({
        queryKey: ['news', debouncedQuery],
        queryFn: () =>
            debouncedQuery
                ? newsApi.searchNews(debouncedQuery, 20)
                : newsApi.getArticles({pageSize: 20}).then((r) => r.items ?? []),
    })

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
                            value={marketSentiment?.overallMarketSentiment.toFixed(2) || '-'}
                            loading={loadingSentiment}
                        />
                    </Grid>
                    <Grid size={{xs: 12, md: 4}}>
                        <Card>
                            <CardContent>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                    Bullish Assets
                                </Typography>
                                <Box sx={{display: 'flex', gap: 1, flexWrap: 'wrap'}}>
                                    {loadingSentiment ? (
                                        <Skeleton width={100}/>
                                    ) : (
                                        marketSentiment?.bullishOutliers.map((asset) => (
                                            <Chip key={asset} label={asset} color="success" size="small"/>
                                        )) || <Typography color="text.secondary">None</Typography>
                                    )}
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid size={{xs: 12, md: 4}}>
                        <Card>
                            <CardContent>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                    Bearish Assets
                                </Typography>
                                <Box sx={{display: 'flex', gap: 1, flexWrap: 'wrap'}}>
                                    {loadingSentiment ? (
                                        <Skeleton width={100}/>
                                    ) : (
                                        marketSentiment?.bearishOutliers.map((asset) => (
                                            <Chip key={asset} label={asset} color="error" size="small"/>
                                        )) || <Typography color="text.secondary">None</Typography>
                                    )}
                                </Box>
                            </CardContent>
                        </Card>
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
                                <Card>
                                    <CardContent>
                                        <Skeleton variant="text" width="80%" height={28}/>
                                        <Skeleton variant="text" width="100%"/>
                                        <Skeleton variant="text" width="100%"/>
                                        <Skeleton variant="text" width="60%"/>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))
                    ) : articles && articles.length > 0 ? (
                        articles.map((article) => (
                            <Grid key={article.id} size={{xs: 12, md: 6, lg: 4}}>
                                <NewsCard article={article}/>
                            </Grid>
                        ))
                    ) : (
                        <Grid size={{xs: 12}}>
                            <EmptyState
                                title="No news found"
                                description={searchQuery ? 'Try a different search term' : 'No news articles available'}
                            />
                        </Grid>
                    )}
                </Grid>
            </Box>
        </PageTransition>
    )
}

function NewsCard({article}: { article: NewsArticle }) {
    return (
        <Card
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                    borderColor: 'primary.main',
                },
            }}
        >
            <CardContent sx={{flex: 1}}>
                <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1}}>
                    <Typography variant="caption" color="text.secondary">
                        {article.source?.name || 'Unknown Source'}
                    </Typography>
                    {article.sentimentScore !== null && article.sentimentScore !== undefined && (
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
                    <Box sx={{display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2}}>
                        {article.mentionedAssets.slice(0, 5).map((asset) => (
                            <Chip key={asset} label={asset} size="small" variant="outlined"/>
                        ))}
                    </Box>
                )}

                <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <Typography variant="caption" color="text.secondary">
                        {article.publishedAt ? formatRelativeTime(article.publishedAt) : 'Unknown date'}
                    </Typography>
                    <MuiLink
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{display: 'flex', alignItems: 'center', gap: 0.5}}
                    >
                        Read more <OpenInNewIcon fontSize="small"/>
                    </MuiLink>
                </Box>
            </CardContent>
        </Card>
    )
}
