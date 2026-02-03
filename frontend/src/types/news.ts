/**
 * News Types
 */

export interface NewsSource {
  id: string;
  name: string;
  domain: string;
  sourceType: 'official' | 'major_news' | 'news' | 'blog' | 'social' | 'unknown';
  credibilityScore: number;
  biasRating?: 'neutral' | 'bullish' | 'bearish';
  crawlEnabled: boolean;
  lastCrawled?: string;
}

export interface NewsArticle {
  id: string;
  sourceId: string;
  source?: NewsSource;
  url: string;
  title: string;
  content: string;
  summary?: string;
  sentimentScore?: number;
  relevanceScore?: number;
  mentionedAssets?: string[];
  publishedAt?: string;
  fetchedAt: string;
}

export interface NewsSentiment {
  asset: string;
  overallSentiment: number;
  weightedSentiment: number;
  articleCount: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  topSources: string[];
  interpretation: 'bullish' | 'bearish' | 'neutral';
}

export interface NewsFilter {
  sourceIds?: string[];
  assets?: string[];
  minCredibility?: number;
  minSentiment?: number;
  maxSentiment?: number;
  startDate?: string;
  endDate?: string;
}

export interface MarketSentimentSummary {
  timestamp: string;
  overallMarketSentiment: number;
  assetSentiments: NewsSentiment[];
  bullishOutliers: string[];
  bearishOutliers: string[];
  summary: string;
}
