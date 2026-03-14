import type { Metadata } from 'next';
import Link from 'next/link';
import { getConvexClient, api } from '@/lib/convex/server';

export const metadata: Metadata = {
  title: 'Market Signals Dashboard - Asset Analysis Index',
  description: 'Browse all assets analyzed by the Market Signal Terminal. View sentiment trends, catalysts, and historical reports.',
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

export default async function AssetIndexPage() {
  const client = getConvexClient();

  let assets: AssetCard[] = [];

  if (client) {
    const sessions = await client.query(api.sessions.listPublished, {});
    const grouped = new Map<string, { count: number; latestDate: number; latestSentiment: string | null }>();

    for (const session of sessions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = session as any;
      const ak = s.assetKey as string | undefined;
      if (!ak) continue;

      const existing = grouped.get(ak);
      if (!existing) {
        // Find latest sentiment from evidence
        const evidence = s.meta?.artifacts?.evidence ?? [];
        let sentiment: string | null = null;
        for (const ev of evidence) {
          if (ev.aiSummary?.sentiment) { sentiment = ev.aiSummary.sentiment; break; }
        }
        grouped.set(ak, { count: 1, latestDate: s._creationTime, latestSentiment: sentiment });
      } else {
        existing.count += 1;
        if (s._creationTime > existing.latestDate) {
          existing.latestDate = s._creationTime;
          const evidence = s.meta?.artifacts?.evidence ?? [];
          for (const ev of evidence) {
            if (ev.aiSummary?.sentiment) { existing.latestSentiment = ev.aiSummary.sentiment; break; }
          }
        }
      }
    }

    assets = Array.from(grouped.entries())
      .sort((a, b) => b[1].latestDate - a[1].latestDate)
      .map(([assetKey, data]) => ({
        assetKey,
        label: decodeURIComponent(assetKey).replace(/-/g, ' '),
        count: data.count,
        latestDate: data.latestDate,
        latestSentiment: data.latestSentiment,
      }));
  }

  return (
    <div className="min-h-screen">
      <div className="bg-terminal fixed inset-0 -z-20" />
      <div className="grid-overlay pointer-events-none fixed inset-0 -z-10 opacity-60" />

      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white/90 sm:text-3xl">Asset Analysis Index</h1>
            <p className="mt-1 text-sm text-white/50">
              {assets.length} {assets.length === 1 ? 'asset' : 'assets'} tracked
            </p>
          </div>
          <Link
            href="/terminal"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[rgba(0,102,255,0.42)] bg-[rgba(0,102,255,0.2)] px-4 text-sm font-semibold text-[rgba(199,228,255,0.98)] transition hover:bg-[rgba(0,102,255,0.28)]"
          >
            Analyze a new asset &rarr;
          </Link>
        </div>

        {assets.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
            <p className="text-sm text-white/50">No published analyses yet.</p>
            <Link
              href="/terminal"
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-[rgba(120,196,255,0.85)] transition hover:text-white/80"
            >
              Run your first analysis &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <Link
                key={asset.assetKey}
                href={`/asset/${asset.assetKey}`}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.06]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-white/85 group-hover:text-white/95">
                    {asset.label.charAt(0).toUpperCase() + asset.label.slice(1)}
                  </h2>
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
        )}
      </div>
    </div>
  );
}
