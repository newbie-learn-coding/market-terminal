import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listPublished } from '@/lib/db';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PageBackground } from '@/components/layout/page-background';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { SentimentBadge } from '@/components/ui/sentiment-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/Button';
import { firstEvidenceSentiment } from '@/lib/session-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://trendanalysis.ai';

  return {
    title: t('trendingTitle'),
    description: t('trendingDesc'),
    keywords: [
      'trending market topics',
      'market analysis today',
      'stock market trends',
      'crypto analysis',
      'trend analysis',
    ],
    alternates: {
      languages: {
        en: `${baseUrl}/trending`,
        es: `${baseUrl}/es/trending`,
        zh: `${baseUrl}/zh/trending`,
        'x-default': `${baseUrl}/trending`,
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

const LOCALE_MAP: Record<string, string> = { en: 'en-US', es: 'es-MX', zh: 'zh-CN' };

export default async function TrendingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const dateFmt = LOCALE_MAP[locale] ?? 'en-US';

  let assets: AssetCard[] = [];
  let recentReports: RecentReport[] = [];

  {
    const sessions = await listPublished();
    const grouped = new Map<string, { count: number; latestDate: number; latestSentiment: string | null }>();

    for (const s of sessions) {
      const ak = s.assetKey as string | undefined;
      if (!ak) continue;

      const sentiment = firstEvidenceSentiment(s.meta);

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
        const sentiment = firstEvidenceSentiment(s.meta);
        return { slug: s.slug!, topic: s.topic, date: s._creationTime, sentiment };
      });
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Trending Market Topics',
    description: 'Most analyzed market topics on TrendAnalysis.ai',
    inLanguage: locale,
    itemListElement: assets.slice(0, 20).map((asset, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: asset.label.charAt(0).toUpperCase() + asset.label.slice(1),
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://trendanalysis.ai'}/asset/${asset.assetKey}`,
    })),
  };

  return (
    <div className="min-h-screen">
      <PageBackground />
      <SiteHeader />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PageContainer className="py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white/90 sm:text-3xl">Trending Topics</h1>
            <p className="mt-1 text-sm text-white/50">
              Discover what markets are being analyzed right now
            </p>
          </div>
          <Button asChild>
            <Link href="/terminal">
              Run your own analysis &rarr;
            </Link>
          </Button>
        </div>

        {assets.length === 0 && recentReports.length === 0 ? (
          <Card className="p-12">
            <EmptyState
              title="No published analyses yet. Be the first!"
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
          <>
            {/* Most Analyzed Section */}
            {assets.length > 0 && (
              <section className="mb-10">
                <SectionLabel className="mb-4 text-lg font-semibold text-white/80 normal-case tracking-normal">Most Analyzed</SectionLabel>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((asset) => (
                    <Link
                      key={asset.assetKey}
                      href={`/asset/${asset.assetKey}`}
                      className="block"
                    >
                      <Card className="group p-5 transition hover:border-white/20 hover:bg-white/[0.06]">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-base font-semibold text-white/85 group-hover:text-white/95">
                            {asset.label.charAt(0).toUpperCase() + asset.label.slice(1)}
                          </h3>
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
              </section>
            )}

            {/* Recent Analyses Section */}
            {recentReports.length > 0 && (
              <section>
                <SectionLabel className="mb-4 text-lg font-semibold text-white/80 normal-case tracking-normal">Recent Analyses</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recentReports.map((report) => (
                    <Link
                      key={report.slug}
                      href={`/report/${report.slug}`}
                      className="block"
                    >
                      <Card className="group p-4 transition hover:border-white/20 hover:bg-white/[0.06]">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-white/85 group-hover:text-white/95">
                            {report.topic}
                          </h3>
                          {report.sentiment && (
                            <SentimentBadge sentiment={mapSentiment(report.sentiment)} />
                          )}
                        </div>
                        <div className="mt-2 text-xs text-white/45">
                          {new Date(report.date).toLocaleDateString(dateFmt)}
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </PageContainer>

      <SiteFooter />
    </div>
  );
}
