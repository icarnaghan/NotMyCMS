import type { ApiClient } from "./client";

/**
 * Analytics response from the API containing traffic data for a date range.
 */
export interface AnalyticsResponse {
  dateRange: { start: string; end: string };
  summary: {
    pageViews: number;
    uniqueVisitors: number;
    bandwidth: number; // bytes
  };
  dailyViews: Array<{ date: string; views: number }>;
  topPages: Array<{ path: string; views: number }>;
  topReferrers: Array<{ domain: string; count: number }>;
}

/**
 * Fetch analytics data for the specified date range.
 * Dates should be in YYYY-MM-DD format.
 */
export function getAnalytics(
  client: ApiClient,
  startDate: string,
  endDate: string
): Promise<AnalyticsResponse> {
  return client.get<AnalyticsResponse>(`/analytics?start=${startDate}&end=${endDate}`);
}

// --- Client-side cache ---
//
// Parsing CloudFront logs is expensive, so cache results per date range for the
// SPA session. Past data is stable; a short TTL keeps "today" reasonably fresh.

interface AnalyticsCacheEntry {
  data: AnalyticsResponse;
  timestamp: number;
}

const analyticsCache: Record<string, AnalyticsCacheEntry> = {};
const ANALYTICS_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Like getAnalytics, but returns a cached result for the same date range when
 * one is fresh (within the TTL).
 */
export async function getAnalyticsCached(
  client: ApiClient,
  startDate: string,
  endDate: string
): Promise<AnalyticsResponse> {
  const key = `${startDate}:${endDate}`;
  const entry = analyticsCache[key];
  if (entry && Date.now() - entry.timestamp < ANALYTICS_CACHE_TTL_MS) {
    return entry.data;
  }
  const data = await getAnalytics(client, startDate, endDate);
  analyticsCache[key] = { data, timestamp: Date.now() };
  return data;
}
