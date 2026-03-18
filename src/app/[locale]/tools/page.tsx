import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { ArrowUpRight, BarChart3, GitBranch, Newspaper } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PageBackground } from '@/components/layout/page-background';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://trendanalysis.ai';

  return {
    title: t('toolsTitle'),
    description: t('toolsDesc'),
    keywords: [
      'market research tools',
      'stock analysis tools',
      'trend analyzer',
      'evidence graph',
      'news analyzer',
    ],
    alternates: {
      languages: {
        en: `${baseUrl}/tools`,
        es: `${baseUrl}/es/tools`,
        zh: `${baseUrl}/zh/tools`,
        'x-default': `${baseUrl}/tools`,
      },
    },
  };
}

const tools = [
  {
    href: '/tools/market-analyzer',
    icon: <BarChart3 className="h-5 w-5" />,
    title: 'Trend Analyzer',
    description:
      'Search any market topic and get an AI-generated evidence map with live data from multiple sources, sentiment analysis, and entity extraction.',
  },
  {
    href: '/tools/evidence-graph',
    icon: <GitBranch className="h-5 w-5" />,
    title: 'Evidence Graph Builder',
    description:
      'Visualize relationships between assets, events, entities, and sources in an interactive knowledge graph with confidence-scored edges.',
  },
  {
    href: '/tools/news-analyzer',
    icon: <Newspaper className="h-5 w-5" />,
    title: 'News Impact Analyzer',
    description:
      'Track how news stories cluster, detect momentum shifts, and follow catalyst chains across market events with timeline visualization.',
  },
];

export default async function ToolsIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen flex flex-col">
      <PageBackground />
      <SiteHeader />

      <main className="flex-1">
        <PageContainer className="py-14 sm:py-20">
          <div className="text-center">
            <h1 className="text-3xl font-semibold leading-tight text-white/92 sm:text-5xl">
              Market Research Tools
            </h1>
            <p className="mx-auto mt-4 max-w-[600px] text-sm text-white/60 sm:text-base">
              Evidence-first tools powered by live data pipelines and AI analysis.
              Choose a tool to get started.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {tools.map((tool) => (
              <Link key={tool.href} href={tool.href} className="group">
                <Card className="h-full p-6 transition hover:border-white/20 hover:bg-white/[0.06]">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--blue)]">
                    {tool.icon}
                  </div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-white/88">
                    {tool.title}
                    <ArrowUpRight className="h-3.5 w-3.5 text-white/40 transition group-hover:text-white/70" />
                  </h2>
                  <p className="mt-2 text-xs leading-relaxed text-white/50">
                    {tool.description}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </PageContainer>
      </main>

      <SiteFooter />
    </div>
  );
}
