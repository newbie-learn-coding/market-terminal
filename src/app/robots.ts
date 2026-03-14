import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/terminal', '/dashboard'],
      },
    ],
    sitemap: 'https://brightdata.com/market-terminal/sitemap.xml',
  };
}
