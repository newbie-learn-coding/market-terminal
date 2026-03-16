import type { MetadataRoute } from 'next';
import { listPublished } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://trendanalysis.ai';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/tools`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/tools/market-analyzer`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/tools/evidence-graph`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/tools/news-analyzer`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/asset`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/trending`, changeFrequency: 'daily', priority: 0.9 },
  ];

  try {
    const published = await listPublished();

    const reportPages: MetadataRoute.Sitemap = published
      .filter((s) => s.slug)
      .map((s) => ({
        url: `${baseUrl}/report/${s.slug}`,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }));

    const assetKeys = new Set<string>();
    for (const s of published) {
      if (s.assetKey) assetKeys.add(s.assetKey);
    }
    const assetPages: MetadataRoute.Sitemap = Array.from(assetKeys).map((key) => ({
      url: `${baseUrl}/asset/${key}`,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));

    return [...staticPages, ...reportPages, ...assetPages];
  } catch {
    return staticPages;
  }
}
