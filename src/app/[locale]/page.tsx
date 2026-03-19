import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import LandingClient from '@/components/landing/LandingClient';
import { listPublished } from '@/lib/db';
import { firstEvidenceSentiment } from '@/lib/session-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://trendanalysis.ai';

  return {
    title: { absolute: t('homeTitle') },
    description: t('homeDesc'),
    keywords: [
      'trend analysis',
      'trendanalysis.ai',
      'AI market research',
      'evidence-based market research',
      'knowledge graph',
      'market trend analyzer',
    ],
    openGraph: {
      title: t('homeTitle'),
      description: t('homeDesc'),
      type: 'website',
    },
    alternates: {
      languages: {
        en: baseUrl,
        es: `${baseUrl}/es`,
        zh: `${baseUrl}/zh`,
        'x-default': baseUrl,
      },
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  let trendingTopics: { assetKey: string; label: string; count: number; sentiment: string | null }[] = [];

  try {
    const sessions = await listPublished();
    const grouped = new Map<string, { count: number; sentiment: string | null }>();

    for (const s of sessions) {
      const ak = s.assetKey as string | undefined;
      if (!ak) continue;

      const existing = grouped.get(ak);
      if (!existing) {
        const sentiment = firstEvidenceSentiment(s.meta);
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

  return <LandingClient trendingTopics={trendingTopics} />;
}
