import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublished } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Trending Market Topics | TrendAnalysis.ai',
  description:
    'Discover trending market topics and the latest evidence-based analyses. See what assets are being tracked and analyzed in real-time.',
  keywords: [
    'trending market topics',
    'market analysis today',
    'stock market trends',
    'crypto analysis',
    'trend analysis',
  ],
};

const SENTIMENT_BADGE: Record<string, string> = {
  bullish: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  bearish: 'bg-red-500/20 text-red-400 border-red-500/30',
  mixed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  neutral: 'bg-white/10 text-white/60 border-white/20',
};

type AssetCard = {
  assetKey: string;
  label: string;
  count: number;
  latestDate: number;
  latestSentiment: string | null;
};

type RecentReport = {
  slug: string;
  topic: string;
  date: number;
  sentiment: string | null;
};

export default async function TrendingPage() {
  let assets: AssetCard[] = [];
  let recentReports: RecentReport[] = [];

  {
    const sessions = await listPublished();
    const grouped = new Map<string, { count: number; latestDate: number; latestSentiment: string | null }>();

    for (const s of sessions) {
      const ak = s.assetKey as string | undefined;
      if (!ak) continue;

      const evidence = (s.meta as any)?.artifacts?.evidence ?? [];
      let sentiment: string | null = null;
      for (const ev of evidence) {
        if (ev.aiSummary?.sentiment) { sentiment = ev.aiSummary.sentiment; break; }
      }

      const existing = grouped.get(ak);
      if (!existing) {
        grouped.set(ak, { count: 1, latestDate: s._creationTime, latestSentiment: sentiment });
      } else {
        existing.count += 1;
        if (s._creationTime > existing.latestDate) {
          existing.latestDate = s._creationTime;
          if (sentiment) existing.latestSentiment = sentiment;
        }
      }
    }

    // Most analyzed — sorted by count descending
    assets = Array.from(grouped.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([assetKey, data]) => ({
        assetKey,
        label: decodeURIComponent(assetKey).replace(/-/g, ' '),
        count: data.count,
        latestDate: data.latestDate,
        latestSentiment: data.latestSentiment,
      }));

    // Recent reports — last 12 published sessions by date
    recentReports = sessions
      .filter((s) => s.slug)
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 12)
      .map((s) => {
        const evidence = (s.meta as any)?.artifacts?.evidence ?? [];
        let sentiment: string | null = null;
        for (const ev of evidence) {
          if (ev.aiSummary?.sentiment) { sentiment = ev.aiSummary.sentiment; break; }
        }
        return { slug: s.slug!, topic: s.topic, date: s._creationTime, sentiment };
      });
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Trending Market Topics',
    description: 'Most analyzed market topics on TrendAnalysis.ai',
    itemListElement: assets.slice(0, 20).map((asset, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: asset.label.charAt(0).toUpperCase() + asset.label.slice(1),
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://trendanalysis.ai'}/asset/${asset.assetKey}`,
    })),
  };

  return (
    <div className="min-h-screen">
      <div className="bg-terminal fixed inset-0 -z-20" />
      <div className="grid-overlay pointer-events-none fixed inset-0 -z-10 opacity-60" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white/90 sm:text-3xl">Trending Topics</h1>
            <p className="mt-1 text-sm text-white/50">
              Discover what markets are being analyzed right now
            </p>
          </div>
          <Link
            href="/terminal"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[rgba(0,102,255,0.42)] bg-[rgba(0,102,255,0.2)] px-4 text-sm font-semibold text-[rgba(199,228,255,0.98)] transition hover:bg-[rgba(0,102,255,0.28)]"
          >
            Run your own analysis &rarr;
          </Link>
        </div>

        {assets.length === 0 && recentReports.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
            <p className="text-sm text-white/50">No published analyses yet. Be the first!</p>
            <Link
              href="/terminal"
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-[rgba(120,196,255,0.85)] transition hover:text-white/80"
            >
              Run your first analysis &rarr;
            </Link>
          </div>
        ) : (
          <>
            {/* Most Analyzed Section */}
            {assets.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-4 text-lg font-semibold text-white/80">Most Analyzed</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((asset) => (
                    <Link
                      key={asset.assetKey}
                      href={`/asset/${asset.assetKey}`}
                      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-semibold text-white/85 group-hover:text-white/95">
                          {asset.label.charAt(0).toUpperCase() + asset.label.slice(1)}
                        </h3>
                        {asset.latestSentiment && (
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${SENTIMENT_BADGE[asset.latestSentiment] ?? SENTIMENT_BADGE.neutral}`}>
                            {asset.latestSentiment}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-xs text-white/45">
                        <span>{asset.count} {asset.count === 1 ? 'analysis' : 'analyses'}</span>
                        <span className="text-white/20">|</span>
                        <span>{new Date(asset.latestDate).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Analyses Section */}
            {recentReports.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold text-white/80">Recent Analyses</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recentReports.map((report) => (
                    <Link
                      key={report.slug}
                      href={`/report/${report.slug}`}
                      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white/85 group-hover:text-white/95">
                          {report.topic}
                        </h3>
                        {report.sentiment && (
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${SENTIMENT_BADGE[report.sentiment] ?? SENTIMENT_BADGE.neutral}`}>
                            {report.sentiment}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-white/45">
                        {new Date(report.date).toLocaleDateString()}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
