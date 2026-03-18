import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';
import { listByAsset } from '@/lib/db';
import { aggregateAssetData } from '@/lib/asset-aggregation';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PageBackground } from '@/components/layout/page-background';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { SentimentBadge } from '@/components/ui/sentiment-badge';
import { MomentumBadge } from '@/components/ui/momentum-badge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

type Props = { params: Promise<{ locale: string; key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, key } = await params;
  setRequestLocale(locale);
  const label = decodeURIComponent(key).replace(/-/g, ' ');
  const title = `${label.charAt(0).toUpperCase() + label.slice(1)} Trend Analysis & History`;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://trendanalysis.ai';

  return {
    title,
    description: `Live trend analysis, sentiment trends and analysis history for ${label}.`,
    openGraph: { title },
    alternates: {
      languages: {
        en: `${baseUrl}/asset/${key}`,
        es: `${baseUrl}/es/asset/${key}`,
        zh: `${baseUrl}/zh/asset/${key}`,
        'x-default': `${baseUrl}/asset/${key}`,
      },
    },
  };
}

function mapSentiment(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  if (s === 'bullish') return 'positive';
  if (s === 'bearish') return 'negative';
  return s;
}

const LOCALE_MAP: Record<string, string> = { en: 'en-US', es: 'es-MX', zh: 'zh-CN' };

export default async function AssetPage({ params }: Props) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  const dateFmt = LOCALE_MAP[locale] ?? 'en-US';

  const sessions = await listByAsset(key);
  if (!sessions || sessions.length === 0) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agg = aggregateAssetData(sessions as any[], key);
  const label = decodeURIComponent(key).replace(/-/g, ' ');
  const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${capitalizedLabel} Market Analysis`,
    description: `Aggregated trend analysis, sentiment trends and analysis for ${label}.`,
    inLanguage: locale,
    creator: { '@type': 'Organization', name: 'TrendAnalysis.ai' },
    distribution: [{ '@type': 'DataDownload', contentUrl: `https://trendanalysis.ai/asset/${key}` }],
  };

  return (
    <div className="min-h-screen">
      <PageBackground />
      <SiteHeader />

      <PageContainer size="narrow" className="py-10">
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
        <Card className="p-6">
          <h1 className="text-2xl font-semibold text-white/90 sm:text-3xl">
            {capitalizedLabel}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-white/50">
            <span>{agg.totalAnalyses} {agg.totalAnalyses === 1 ? 'analysis' : 'analyses'}</span>
            {agg.latestAnalysisDate && (
              <span>Latest: {new Date(agg.latestAnalysisDate).toLocaleDateString(dateFmt)}</span>
            )}
          </div>
        </Card>

        {/* Latest clusters */}
        {agg.latestClusters.length > 0 && (
          <section className="mt-6">
            <SectionLabel className="mb-3">Latest Story Clusters</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              {agg.latestClusters.map((cluster) => (
                <Card key={cluster.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-white/80">{cluster.title}</h3>
                    <MomentumBadge momentum={cluster.momentum} />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/50">{cluster.summary}</p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Sentiment trend */}
        {agg.sentimentTrend.length > 0 && (
          <section className="mt-6">
            <SectionLabel className="mb-3">Sentiment Trend</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {agg.sentimentTrend.map((pt) => (
                <Card key={pt.date} className="inline-flex items-center gap-1.5 px-2.5 py-1.5">
                  <span className="text-xs font-medium text-white/70">{new Date(pt.date).toLocaleDateString(dateFmt, { month: 'short', day: 'numeric' })}</span>
                  <SentimentBadge sentiment={mapSentiment(pt.sentiment)} />
                  <span className="text-[10px] text-white/40">({pt.count})</span>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Top catalysts */}
        {agg.topCatalysts.length > 0 && (
          <section className="mt-6">
            <SectionLabel className="mb-3">Top Catalysts</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {agg.topCatalysts.map((c) => (
                <Badge key={c.name} variant="neutral">
                  {c.name}
                  <span className="ml-1 text-[10px] text-white/40">({c.count})</span>
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Top entities */}
        {agg.topEntities.length > 0 && (
          <section className="mt-6">
            <SectionLabel className="mb-3">Top Entities</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {agg.topEntities.map((e) => (
                <Badge key={e.name} variant="blue">
                  {e.name}
                  <span className="ml-1 text-[10px] opacity-50">({e.count})</span>
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Historical reports */}
        {agg.reports.length > 0 && (
          <section className="mt-6">
            <SectionLabel className="mb-3">Reports</SectionLabel>
            <div className="space-y-2">
              {agg.reports.map((r) => (
                <Link
                  key={r.slug}
                  href={`/report/${r.slug}`}
                  className="block"
                >
                  <Card className="flex items-center justify-between px-4 py-3 transition hover:bg-white/[0.06]">
                    <span className="text-sm text-white/80">{r.topic}</span>
                    <span className="text-xs text-white/40">
                      {new Date(r.date).toLocaleDateString(dateFmt)}
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="mt-8 text-center">
          <Button size="lg" asChild>
            <Link href={`/terminal?q=${encodeURIComponent(label)}`}>
              Run latest analysis &rarr;
            </Link>
          </Button>
        </div>
      </PageContainer>

      <SiteFooter />
    </div>
  );
}
