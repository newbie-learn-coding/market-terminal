import type { MetadataRoute } from 'next';
import { listPublished } from '@/lib/db';

export const dynamic = 'force-dynamic';

const locales = ['en', 'es', 'zh'] as const;

function localizedEntry(
  baseUrl: string,
  path: string,
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
  priority: number,
): MetadataRoute.Sitemap[number] {
  return {
    url: `${baseUrl}${path}`,
    changeFrequency,
    priority,
    alternates: {
      languages: Object.fromEntries([
        ...locales.map((l) => [l, `${baseUrl}${l === 'en' ? '' : `/${l}`}${path}`]),
        ['x-default', `${baseUrl}${path}`],
      ]),
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://trendanalysis.ai';

  const staticPages: MetadataRoute.Sitemap = [
    localizedEntry(baseUrl, '', 'daily', 1.0),
    localizedEntry(baseUrl, '/tools', 'weekly', 0.9),
    localizedEntry(baseUrl, '/tools/market-analyzer', 'weekly', 0.8),
    localizedEntry(baseUrl, '/tools/evidence-graph', 'weekly', 0.8),
    localizedEntry(baseUrl, '/tools/news-analyzer', 'weekly', 0.8),
    localizedEntry(baseUrl, '/asset', 'daily', 0.8),
    localizedEntry(baseUrl, '/trending', 'daily', 0.9),
  ];

  try {
    const published = await listPublished();

    const reportPages: MetadataRoute.Sitemap = published
      .filter((s) => s.slug)
      .map((s) => localizedEntry(baseUrl, `/report/${s.slug}`, 'monthly', 0.7));

    const assetKeys = new Set<string>();
    for (const s of published) {
      if (s.assetKey) assetKeys.add(s.assetKey);
    }
    const assetPages: MetadataRoute.Sitemap = Array.from(assetKeys).map((key) =>
      localizedEntry(baseUrl, `/asset/${key}`, 'daily', 0.7),
    );

    return [...staticPages, ...reportPages, ...assetPages];
  } catch {
    return staticPages;
  }
}
