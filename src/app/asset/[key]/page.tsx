import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getConvexClient, api } from '@/lib/convex/server';
import { aggregateAssetData } from '@/lib/asset-aggregation';

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const label = decodeURIComponent(key).replace(/-/g, ' ');
  const title = `${label.charAt(0).toUpperCase() + label.slice(1)} Market Signals & Analysis History | Market Signal Terminal`;
  return {
    title,
    description: `Live market signals, sentiment trends and analysis history for ${label}.`,
    openGraph: { title },
  };
}

const SENTIMENT_COLORS: Record<string, string> = {
  bullish: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  bearish: 'bg-red-500/20 text-red-400 border-red-500/30',
  mixed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  neutral: 'bg-white/10 text-white/60 border-white/20',
};

const MOMENTUM_COLORS: Record<string, string> = {
  rising: 'text-emerald-400',
  steady: 'text-amber-400',
  fading: 'text-white/40',
};

export default async function AssetPage({ params }: Props) {
  const { key } = await params;
  const client = getConvexClient();
  if (!client) notFound();

  const sessions = await client.query(api.sessions.listByAsset, { assetKey: key });
  if (!sessions || sessions.length === 0) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agg = aggregateAssetData(sessions as any[], key);
  const label = decodeURIComponent(key).replace(/-/g, ' ');
  const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${capitalizedLabel} Market Signal Analysis`,
    description: `Aggregated market signals, sentiment trends and analysis for ${label}.`,
    creator: { '@type': 'Organization', name: 'Market Signal Terminal' },
    distribution: [{ '@type': 'DataDownload', contentUrl: `https://trendanalysis.ai/asset/${key}` }],
  };

  return (
    <div className="min-h-screen">
      <div className="bg-terminal fixed inset-0 -z-20" />
      <div className="grid-overlay pointer-events-none fixed inset-0 -z-10 opacity-60" />

      <div className="mx-auto max-w-4xl px-4 py-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        {/* Back nav */}
        <Link
          href="/asset"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-white/50 transition hover:text-white/80"
        >
          &larr; All assets
        </Link>

        {/* Header */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h1 className="text-2xl font-semibold text-white/90 sm:text-3xl">
            {capitalizedLabel}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-white/50">
            <span>{agg.totalAnalyses} {agg.totalAnalyses === 1 ? 'analysis' : 'analyses'}</span>
            {agg.latestAnalysisDate && (
              <span>Latest: {new Date(agg.latestAnalysisDate).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        {/* Latest clusters */}
        {agg.latestClusters.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
              Latest Story Clusters
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {agg.latestClusters.map((cluster) => (
                <div
                  key={cluster.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-white/80">{cluster.title}</h3>
                    <span className={`shrink-0 text-xs font-medium ${MOMENTUM_COLORS[cluster.momentum] ?? 'text-white/40'}`}>
                      {cluster.momentum}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/50">{cluster.summary}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sentiment trend */}
        {agg.sentimentTrend.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
              Sentiment Trend
            </h2>
            <div className="flex flex-wrap gap-2">
              {agg.sentimentTrend.map((pt) => (
                <div
                  key={pt.date}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${SENTIMENT_COLORS[pt.sentiment] ?? SENTIMENT_COLORS.neutral}`}
                >
                  <span className="font-medium">{new Date(pt.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <span className="opacity-70">{pt.sentiment}</span>
                  <span className="text-[10px] opacity-50">({pt.count})</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Top catalysts */}
        {agg.topCatalysts.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
              Top Catalysts
            </h2>
            <div className="flex flex-wrap gap-2">
              {agg.topCatalysts.map((c) => (
                <span
                  key={c.name}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70"
                >
                  {c.name}
                  <span className="text-[10px] text-white/40">({c.count})</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Top entities */}
        {agg.topEntities.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
              Top Entities
            </h2>
            <div className="flex flex-wrap gap-2">
              {agg.topEntities.map((e) => (
                <span
                  key={e.name}
                  className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,102,255,0.3)] bg-[rgba(0,102,255,0.08)] px-3 py-1 text-xs text-[rgba(182,220,255,0.85)]"
                >
                  {e.name}
                  <span className="text-[10px] opacity-50">({e.count})</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Historical reports */}
        {agg.reports.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
              Reports
            </h2>
            <div className="space-y-2">
              {agg.reports.map((r) => (
                <Link
                  key={r.slug}
                  href={`/report/${r.slug}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.06]"
                >
                  <span className="text-sm text-white/80">{r.topic}</span>
                  <span className="text-xs text-white/40">
                    {new Date(r.date).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="mt-8 text-center">
          <Link
            href={`/terminal?q=${encodeURIComponent(label)}`}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[rgba(0,102,255,0.42)] bg-[rgba(0,102,255,0.2)] px-5 text-sm font-semibold text-[rgba(199,228,255,0.98)] transition hover:bg-[rgba(0,102,255,0.28)]"
          >
            Run latest analysis &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
