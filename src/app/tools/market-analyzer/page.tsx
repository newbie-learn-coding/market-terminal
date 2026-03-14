import type { Metadata } from 'next';
import { Activity, Database, Link2, Layers } from 'lucide-react';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';

export const metadata: Metadata = {
  title: 'Market Signal Analyzer - AI-Powered Market Research | Market Signal Terminal',
  description:
    'Analyze any market topic with live SERP data, AI-powered evidence extraction, sentiment analysis, and entity linking. Free stock news analysis tool.',
  keywords: [
    'market signal analyzer',
    'stock news analysis tool',
    'AI market research',
    'evidence-based analysis',
    'market sentiment tool',
  ],
};

const features = [
  {
    icon: <Activity className="h-4 w-4" />,
    title: 'Live Data Pipeline',
    description:
      'Real-time SERP queries and web scraping via Bright Data. Fresh signals from news, analysis, and social sources within seconds.',
  },
  {
    icon: <Database className="h-4 w-4" />,
    title: 'AI-Powered Analysis',
    description:
      'LLM extracts entities, catalysts, and sentiment from each evidence source. Every claim is linked back to its original URL.',
  },
  {
    icon: <Link2 className="h-4 w-4" />,
    title: 'Evidence Linking',
    description:
      'Automatic relationship detection between assets, events, and entities. Confidence-scored edges connect related evidence items.',
  },
  {
    icon: <Layers className="h-4 w-4" />,
    title: 'Multi-Source Aggregation',
    description:
      'Combines news articles, financial reports, social media, and analysis pieces into a single unified evidence workspace.',
  },
];

function ExampleOutput() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-white/80">
              Bitcoin drops below $62K as Mt. Gox begins repayments
            </p>
            <p className="mt-1 text-[11px] text-white/45">reuters.com</p>
          </div>
          <span className="shrink-0 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            Bearish
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/55">
            BTC
          </span>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/55">
            Mt. Gox
          </span>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/55">
            Repayment
          </span>
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-white/80">
              Spot Bitcoin ETF inflows hit $300M despite price dip
            </p>
            <p className="mt-1 text-[11px] text-white/45">coindesk.com</p>
          </div>
          <span className="shrink-0 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
            Bullish
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/55">
            BTC
          </span>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/55">
            ETF
          </span>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/55">
            Institutional
          </span>
        </div>
      </div>
    </div>
  );
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Market Signal Analyzer',
  description:
    'AI-powered market signal analyzer that aggregates live data from multiple sources for evidence-based market research.',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function MarketAnalyzerPage() {
  return (
    <ToolPageLayout
      title="Market Signal Analyzer"
      description="Search any market topic and get AI-generated evidence maps with live data, sentiment analysis, and entity extraction from multiple sources."
      keywords={['market signal analyzer', 'stock news analysis tool']}
      features={features}
      searchPlaceholder="e.g. NVDA earnings impact, BTC halving effects..."
      exampleOutput={<ExampleOutput />}
      statsLine="Aggregates 10+ sources per query across news, analysis, and social channels."
      jsonLd={jsonLd}
    />
  );
}
