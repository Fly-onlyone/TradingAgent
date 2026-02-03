/**
 * News API Endpoints
 */

import apiClient from '../client';
import type {
  NewsArticle,
  NewsSource,
  NewsSentiment,
  NewsFilter,
  MarketSentimentSummary,
  PaginatedResponse,
  PaginationParams,
} from '@/types';

export interface NewsParams extends PaginationParams, NewsFilter {}

export const newsApi = {
  /**
   * Get news articles
   */
  async getArticles(params?: NewsParams): Promise<PaginatedResponse<NewsArticle>> {
    const response = await apiClient.get<PaginatedResponse<NewsArticle>>('/news/articles', { params });
    return response.data;
  },

  /**
   * Get article by ID
   */
  async getArticle(articleId: string): Promise<NewsArticle> {
    const response = await apiClient.get<NewsArticle>(`/news/articles/${articleId}`);
    return response.data;
  },

  /**
   * Get news sources
   */
  async getSources(): Promise<NewsSource[]> {
    const response = await apiClient.get<NewsSource[]>('/news/sources');
    return response.data;
  },

  /**
   * Get source by ID
   */
  async getSource(sourceId: string): Promise<NewsSource> {
    const response = await apiClient.get<NewsSource>(`/news/sources/${sourceId}`);
    return response.data;
  },

  /**
   * Get sentiment for asset
   */
  async getSentiment(asset: string): Promise<NewsSentiment> {
    const response = await apiClient.get<NewsSentiment>(`/news/sentiment/${asset}`);
    return response.data;
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
    const response = await apiClient.get<NewsArticle[]>('/news/search', {
      params: { query, limit },
    });
    return response.data;
  },

  /**
   * Get breaking news
   */
  async getBreakingNews(hours?: number): Promise<NewsArticle[]> {
    const response = await apiClient.get<NewsArticle[]>('/news/breaking', {
      params: { hours },
    });
    return response.data;
  },
};

export default newsApi;
