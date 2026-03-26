/**
 * News API Endpoints
 */

import apiClient from '../client';
import type {
    MarketSentimentSummary,
    NewsArticle,
    NewsFilter,
    NewsSource,
    PaginatedResponse,
    PaginationParams,
} from '@/types';

export interface NewsParams extends PaginationParams, NewsFilter {
}

interface BackendNewsArticleListResponse {
    articles: Record<string, unknown>[];
    total: number;
    page: number;
    page_size: number;
}

function transformNewsArticle(data: Record<string, unknown>): NewsArticle {
    return {
        id: data.id as string,
        sourceId: (data.source_id as string) || (data.sourceId as string),
        source: (data.source as NewsSource) || undefined,
        url: data.url as string,
        title: data.title as string,
        content: data.content as string,
        summary: (data.summary as string) || undefined,
        sentimentScore:
            typeof data.sentiment_score === "number"
                ? (data.sentiment_score as number)
                : (data.sentimentScore as number | undefined),
        relevanceScore:
            typeof data.relevance_score === "number"
                ? (data.relevance_score as number)
                : (data.relevanceScore as number | undefined),
        mentionedAssets:
            (data.mentioned_assets as string[]) ||
            (data.mentionedAssets as string[]) ||
            undefined,
        publishedAt:
            (data.published_at as string) ||
            (data.publishedAt as string) ||
            undefined,
        fetchedAt: (data.fetched_at as string) || (data.fetchedAt as string),
    };
}

export const newsApi = {
    /**
     * Get news articles
     */
    async getArticles(params?: NewsParams): Promise<PaginatedResponse<NewsArticle>> {
        const apiParams: Record<string, unknown> = {};
        if (params?.page !== undefined) apiParams.page = params.page;
        if (params?.pageSize !== undefined) apiParams.page_size = params.pageSize;
        if (params?.sourceIds?.[0]) apiParams.source_id = params.sourceIds[0];
        if (params?.assets?.[0]) apiParams.asset = params.assets[0];
        if (params?.minSentiment !== undefined) {
            if (params.minSentiment >= 0.2) {
                apiParams.sentiment = "positive";
            } else if (params.minSentiment <= -0.2) {
                apiParams.sentiment = "negative";
            }
        }

        const response = await apiClient.get<BackendNewsArticleListResponse>("/news/articles", {
            params: apiParams,
        });

        const pageSize = response.data.page_size || params?.pageSize || 20;
        const total = response.data.total || 0;

        return {
            items: (response.data.articles || []).map(transformNewsArticle),
            total,
            page: response.data.page || params?.page || 1,
            pageSize,
            totalPages: Math.max(Math.ceil(total / pageSize), 1),
        };
    },

    /**
     * Get market sentiment summary
     */
    async getMarketSentiment(): Promise<MarketSentimentSummary> {
        const response = await apiClient.get<MarketSentimentSummary>('/news/sentiment/market');
        return response.data;
    },

    /**
     * Search news
     */
    async searchNews(query: string, limit?: number): Promise<NewsArticle[]> {
        const response = await apiClient.get<Record<string, unknown>[]>('/news/search', {
            params: {query, limit},
        });
        return (response.data || []).map(transformNewsArticle);
    },

};

export default newsApi;
