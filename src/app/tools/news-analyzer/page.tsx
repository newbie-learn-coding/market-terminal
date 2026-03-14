import type { Metadata } from 'next';
import { Clock, Layers, Brain, TrendingUp } from 'lucide-react';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';

export const metadata: Metadata = {
  title: 'News Impact Analyzer - Market News Analysis | Market Signal Terminal',
  description:
    'Analyze how news impacts markets with timeline visualization, story clustering, sentiment analysis, and catalyst tracking. Free market news analyzer.',
  keywords: [
    'news impact on stocks',
    'market news analyzer',
    'news sentiment analysis',
    'market catalyst tracker',
    'news timeline tool',
  ],
};

const features = [
  {
    icon: <Clock className="h-4 w-4" />,
    title: 'Timeline View',
    description:
      'Chronological event tape showing market-moving events with tags, timestamps, and linked evidence for each entry.',
  },
  {
    icon: <Layers className="h-4 w-4" />,
    title: 'Story Clustering',
    description:
      'Groups related evidence into story clusters with momentum indicators: rising, steady, or fading. Up to 6 clusters per analysis.',
  },
  {
    icon: <Brain className="h-4 w-4" />,
    title: 'Sentiment Analysis',
    description:
      'Per-source sentiment scoring with confidence levels. Aggregated view shows net market sentiment across all evidence items.',
  },
  {
    icon: <TrendingUp className="h-4 w-4" />,
    title: 'Catalyst Tracking',
    description:
      'Identifies and chains market catalysts across sources. Tracks how a single event propagates through related assets and narratives.',
  },
];

function ExampleOutput() {
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="h-2 w-2 rounded-full bg-[var(--blue)]" />
          <div className="h-full w-px bg-white/10" />
        </div>
        <div className="pb-4">
          <p className="text-[10px] font-semibold text-white/40">14:32 UTC</p>
          <p className="mt-1 text-xs text-white/75">
            Fed Chair signals potential rate pause in upcoming meeting
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">
              Fed
            </span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">
              Rates
            </span>
            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
              Rising
            </span>
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="h-2 w-2 rounded-full bg-[rgba(120,196,255,0.7)]" />
          <div className="h-full w-px bg-white/10" />
        </div>
        <div className="pb-4">
          <p className="text-[10px] font-semibold text-white/40">15:10 UTC</p>
          <p className="mt-1 text-xs text-white/75">
            S&P 500 futures rise 0.4% on rate pause expectations
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">
              SPX
            </span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">
              Futures
            </span>
            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
              Rising
            </span>
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="h-2 w-2 rounded-full bg-[rgba(170,209,255,0.6)]" />
          <div className="h-0 w-px" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-white/40">16:45 UTC</p>
          <p className="mt-1 text-xs text-white/75">
            Treasury yields drop as bond markets price in dovish shift
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">
              Bonds
            </span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">
              Yields
            </span>
            <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-400">
              Steady
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'News Impact Analyzer',
  description:
    'Market news impact analyzer with timeline visualization, story clustering, sentiment analysis, and catalyst tracking.',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function NewsAnalyzerPage() {
  return (
    <ToolPageLayout
      title="News Impact Analyzer"
      description="Track how news stories cluster, detect momentum shifts, and follow catalyst chains across market events with timeline visualization and sentiment scoring."
      keywords={['news impact on stocks', 'market news analyzer']}
      features={features}
      searchPlaceholder="e.g. Fed rate decision impact, oil price catalysts..."
      exampleOutput={<ExampleOutput />}
      statsLine="Tracks up to 12 timeline events and 6 story clusters per analysis session."
      jsonLd={jsonLd}
    />
  );
}
