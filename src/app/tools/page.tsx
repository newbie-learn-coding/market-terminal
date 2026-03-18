import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, BarChart3, GitBranch, Newspaper } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Market Research Tools | TrendAnalysis.ai',
  description:
    'Free market research tools: trend analyzer, evidence graph builder, and news impact analyzer. Powered by live data and AI.',
  keywords: [
    'market research tools',
    'stock analysis tools',
    'trend analyzer',
    'evidence graph',
    'news analyzer',
  ],
};

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

export default function ToolsIndexPage() {
  return (
    <div className="min-h-screen">
      <div className="bg-terminal fixed inset-0 -z-20" />
      <div className="grid-overlay pointer-events-none fixed inset-0 -z-10 opacity-60" />

      <header className="border-b border-white/8 bg-white/[0.02] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[980px] items-center gap-4 px-4 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white/90"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[980px] px-4 py-14 sm:py-20">
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
            <Link
              key={tool.href}
              href={tool.href}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
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
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
