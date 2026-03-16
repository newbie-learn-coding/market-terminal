import type { Metadata } from 'next';
import LandingClient from '@/components/landing/LandingClient';
import { getConvexClient, api } from '@/lib/convex/server';

export const metadata: Metadata = {
  title: 'Market Signal Analyzer - Evidence-Based Market Research Tool',
  description:
    'Search any market topic and get live evidence maps, knowledge graphs, and AI-powered analysis. Free market signal analyzer powered by Bright Data.',
  keywords: [
    'market signal analyzer',
    'evidence-based market research',
    'stock analysis tool',
    'market news analyzer',
    'knowledge graph',
  ],
  openGraph: {
    title: 'Market Signal Analyzer - Evidence-Based Market Research',
    description:
      'Search any market topic and get live evidence maps, knowledge graphs, and AI-powered analysis.',
    type: 'website',
  },
};

export default async function HomePage() {
  let trendingTopics: { assetKey: string; label: string; count: number; sentiment: string | null }[] = [];

  const client = getConvexClient();
  if (client) {
    try {
      const sessions = await client.query(api.sessions.listPublished, {});
      const grouped = new Map<string, { count: number; sentiment: string | null }>();

      for (const session of sessions) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = session as any;
        const ak = s.assetKey as string | undefined;
        if (!ak) continue;

        const existing = grouped.get(ak);
        if (!existing) {
          const evidence = s.meta?.artifacts?.evidence ?? [];
          let sentiment: string | null = null;
          for (const ev of evidence) {
            if (ev.aiSummary?.sentiment) { sentiment = ev.aiSummary.sentiment; break; }
          }
          grouped.set(ak, { count: 1, sentiment });
        } else {
          existing.count += 1;
        }
      }

      trendingTopics = Array.from(grouped.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 8)
        .map(([assetKey, data]) => ({
          assetKey,
          label: decodeURIComponent(assetKey).replace(/-/g, ' '),
          count: data.count,
          sentiment: data.sentiment,
        }));
    } catch {
      // Non-critical — render without trending
    }
  }

  return <LandingClient trendingTopics={trendingTopics} />;
}
