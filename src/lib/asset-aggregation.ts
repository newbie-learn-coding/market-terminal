import type { EvidenceItem, StoryCluster } from '@/lib/types';

type SessionMeta = {
  mode?: 'fast' | 'deep';
  artifacts?: {
    evidence?: EvidenceItem[];
    clusters?: StoryCluster[];
  };
};

type SessionRow = {
  sessionId: string;
  topic: string;
  status: string;
  meta: SessionMeta;
  slug?: string;
  _creationTime: number;
};

export type SentimentPoint = {
  date: number;
  sentiment: 'bullish' | 'bearish' | 'mixed' | 'neutral';
  count: number;
};

export type AssetAggregation = {
  assetKey: string;
  totalAnalyses: number;
  latestAnalysisDate: number | null;
  sentimentTrend: SentimentPoint[];
  topCatalysts: { name: string; count: number }[];
  topEntities: { name: string; count: number }[];
  latestClusters: StoryCluster[];
  reports: { slug: string; topic: string; date: number }[];
};

export function aggregateAssetData(sessions: SessionRow[], assetKey: string): AssetAggregation {
  const sorted = [...sessions].sort((a, b) => b._creationTime - a._creationTime);

  const sentimentCounts = new Map<string, Map<string, number>>();
  const catalystCounts = new Map<string, number>();
  const entityCounts = new Map<string, number>();

  for (const session of sorted) {
    const evidence = session.meta?.artifacts?.evidence ?? [];
    const dateKey = new Date(session._creationTime).toISOString().slice(0, 10);

    for (const ev of evidence) {
      if (ev.aiSummary?.sentiment) {
        const dayMap = sentimentCounts.get(dateKey) ?? new Map<string, number>();
        dayMap.set(ev.aiSummary.sentiment, (dayMap.get(ev.aiSummary.sentiment) ?? 0) + 1);
        sentimentCounts.set(dateKey, dayMap);
      }
      for (const c of ev.aiSummary?.catalysts ?? []) {
        const key = c.toLowerCase().trim();
        if (key) catalystCounts.set(key, (catalystCounts.get(key) ?? 0) + 1);
      }
      for (const e of ev.aiSummary?.entities ?? []) {
        const key = e.toLowerCase().trim();
        if (key) entityCounts.set(key, (entityCounts.get(key) ?? 0) + 1);
      }
    }
  }

  // Build sentiment trend
  const sentimentTrend: SentimentPoint[] = [];
  for (const [dateStr, counts] of Array.from(sentimentCounts.entries()).sort()) {
    let dominant: SentimentPoint['sentiment'] = 'neutral';
    let max = 0;
    let total = 0;
    for (const [s, c] of counts) {
      total += c;
      if (c > max) { max = c; dominant = s as SentimentPoint['sentiment']; }
    }
    sentimentTrend.push({ date: new Date(dateStr).getTime(), sentiment: dominant, count: total });
  }

  const topCatalysts = Array.from(catalystCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  const topEntities = Array.from(entityCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  const latestClusters = sorted[0]?.meta?.artifacts?.clusters ?? [];

  const reports = sorted
    .filter((s) => s.slug)
    .map((s) => ({ slug: s.slug!, topic: s.topic, date: s._creationTime }));

  return {
    assetKey,
    totalAnalyses: sorted.length,
    latestAnalysisDate: sorted[0]?._creationTime ?? null,
    sentimentTrend,
    topCatalysts,
    topEntities,
    latestClusters,
    reports,
  };
}
