import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listPublished } from '@/lib/db';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PageBackground } from '@/components/layout/page-background';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';
import { SentimentBadge } from '@/components/ui/sentiment-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://trendanalysis.ai';

  return {
    title: t('assetIndexTitle'),
    description: t('assetIndexDesc'),
    alternates: {
      languages: {
        en: `${baseUrl}/asset`,
        es: `${baseUrl}/es/asset`,
        zh: `${baseUrl}/zh/asset`,
        'x-default': `${baseUrl}/asset`,
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

export default async function AssetIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dateFmt = LOCALE_MAP[locale] ?? 'en-US';

  const sessions = await listPublished();
  const grouped = new Map<string, { count: number; latestDate: number; latestSentiment: string | null }>();

  for (const s of sessions) {
    const ak = s.assetKey as string | undefined;
    if (!ak) continue;

    const existing = grouped.get(ak);
    if (!existing) {
      const evidence = (s.meta as any)?.artifacts?.evidence ?? [];
      let sentiment: string | null = null;
      for (const ev of evidence) {
        if (ev.aiSummary?.sentiment) { sentiment = ev.aiSummary.sentiment; break; }
      }
      grouped.set(ak, { count: 1, latestDate: s._creationTime, latestSentiment: sentiment });
    } else {
      existing.count += 1;
      if (s._creationTime > existing.latestDate) {
        existing.latestDate = s._creationTime;
        const evidence = (s.meta as any)?.artifacts?.evidence ?? [];
        for (const ev of evidence) {
          if (ev.aiSummary?.sentiment) { existing.latestSentiment = ev.aiSummary.sentiment; break; }
        }
      }
    }
  }

  const assets = Array.from(grouped.entries())
    .sort((a, b) => b[1].latestDate - a[1].latestDate)
    .map(([assetKey, data]) => ({
      assetKey,
      label: decodeURIComponent(assetKey).replace(/-/g, ' '),
      count: data.count,
      latestDate: data.latestDate,
      latestSentiment: data.latestSentiment,
    }));

  return (
    <div className="min-h-screen">
      <PageBackground />
      <SiteHeader />

      <PageContainer className="py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white/90 sm:text-3xl">Asset Analysis Index</h1>
            <p className="mt-1 text-sm text-white/50">
              {assets.length} {assets.length === 1 ? 'asset' : 'assets'} tracked
            </p>
          </div>
          <Button asChild>
            <Link href="/terminal">
              Analyze a new asset &rarr;
            </Link>
          </Button>
        </div>

        {assets.length === 0 ? (
          <Card className="p-12">
            <EmptyState
              title="No published analyses yet"
              action={
                <Link
                  href="/terminal"
                  className="inline-flex items-center gap-1.5 text-sm text-[rgba(120,196,255,0.85)] transition hover:text-white/80"
                >
                  Run your first analysis &rarr;
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <Link
                key={asset.assetKey}
                href={`/asset/${asset.assetKey}`}
                className="block"
              >
                <Card className="group p-5 transition hover:border-white/20 hover:bg-white/[0.06]">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold text-white/85 group-hover:text-white/95">
                      {asset.label.charAt(0).toUpperCase() + asset.label.slice(1)}
                    </h2>
                    {asset.latestSentiment && (
                      <SentimentBadge sentiment={mapSentiment(asset.latestSentiment)} />
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-white/45">
                    <span>{asset.count} {asset.count === 1 ? 'analysis' : 'analyses'}</span>
                    <span className="text-white/20">|</span>
                    <span>{new Date(asset.latestDate).toLocaleDateString(dateFmt)}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </PageContainer>

      <SiteFooter />
    </div>
  );
}
