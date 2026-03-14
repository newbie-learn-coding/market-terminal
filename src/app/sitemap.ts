import type { MetadataRoute } from 'next';
import { getConvexClient, api } from '@/lib/convex/server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://brightdata.com/market-terminal';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/tools`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/tools/market-analyzer`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/tools/evidence-graph`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/tools/news-analyzer`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/asset`, changeFrequency: 'daily', priority: 0.8 },
  ];

  const client = getConvexClient();
  if (!client) {
    return staticPages;
  }

  try {
    const published = await client.query(api.sessions.listPublished, {});

    const reportPages: MetadataRoute.Sitemap = published
      .filter((s: { slug?: string }) => s.slug)
      .map((s: { slug?: string }) => ({
        url: `${baseUrl}/report/${s.slug}`,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }));

    const assetKeys = new Set<string>();
    for (const s of published) {
      if ((s as { assetKey?: string }).assetKey) {
        assetKeys.add((s as { assetKey?: string }).assetKey!);
      }
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
