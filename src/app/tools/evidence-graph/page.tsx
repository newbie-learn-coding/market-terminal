import type { Metadata } from 'next';
import { GitBranch, Boxes, Workflow, Zap } from 'lucide-react';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';

export const metadata: Metadata = {
  title: 'Evidence Graph Builder - Market Knowledge Graph | TrendAnalysis.ai',
  description:
    'Build interactive knowledge graphs from market evidence. Visualize relationships between assets, events, entities, and news sources with confidence scoring.',
  keywords: [
    'market evidence graph',
    'news impact visualization',
    'market knowledge graph',
    'asset relationship graph',
    'market network analysis',
  ],
};

const features = [
  {
    icon: <GitBranch className="h-4 w-4" />,
    title: 'Knowledge Graph',
    description:
      'Automatically generated graph connecting assets, events, entities, and sources. Up to 24 nodes and 36 edges per analysis.',
  },
  {
    icon: <Boxes className="h-4 w-4" />,
    title: 'Typed Nodes',
    description:
      'Five node types: asset (stocks, crypto), event (earnings, policy), entity (companies, people), source (articles), and media (videos, podcasts).',
  },
  {
    icon: <Workflow className="h-4 w-4" />,
    title: 'Confidence-Scored Edges',
    description:
      'Four edge types: mentions, co-moves, hypothesis, and same-story. Each edge carries a confidence score and links back to supporting evidence.',
  },
  {
    icon: <Zap className="h-4 w-4" />,
    title: 'Impact Detection',
    description:
      'Spillover analysis detects cross-asset impact chains. Orphan repair ensures every node connects to the broader evidence network.',
  },
];

function ExampleOutput() {
  return (
    <div className="space-y-4">
      {/* Simplified graph representation */}
      <div className="flex items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(0,102,255,0.4)] bg-[rgba(0,102,255,0.12)] text-[10px] font-bold text-[rgba(182,220,255,0.95)]">
            BTC
          </div>
          <span className="text-[9px] text-white/40">asset</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="h-px w-16 bg-gradient-to-r from-[rgba(0,102,255,0.5)] to-[rgba(120,196,255,0.5)]" />
          <span className="text-[9px] text-white/35">co_moves 0.82</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(120,196,255,0.4)] bg-[rgba(120,196,255,0.1)] text-[10px] font-bold text-[rgba(182,220,255,0.95)]">
            ETH
          </div>
          <span className="text-[9px] text-white/40">asset</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <div className="h-8 w-px bg-white/10" />
      </div>

      <div className="flex items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-24 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-[10px] font-semibold text-amber-300">
            Fed Meeting
          </div>
          <span className="text-[9px] text-white/40">event</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="h-px w-10 bg-white/20" />
          <span className="text-[9px] text-white/35">mentions 0.91</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-24 items-center justify-center rounded-lg border border-green-500/30 bg-green-500/10 text-[10px] font-semibold text-green-300">
            Reuters
          </div>
          <span className="text-[9px] text-white/40">source</span>
        </div>
      </div>
    </div>
  );
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Evidence Graph Builder',
  description:
    'Interactive market knowledge graph builder that visualizes relationships between assets, events, entities, and news sources.',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function EvidenceGraphPage() {
  return (
    <ToolPageLayout
      title="Evidence Graph Builder"
      description="Visualize how assets, events, entities, and sources connect. Build interactive knowledge graphs from live market data with confidence-scored relationships."
      keywords={['market evidence graph', 'news impact visualization']}
      features={features}
      searchPlaceholder="e.g. crypto market correlations, tech sector earnings..."
      exampleOutput={<ExampleOutput />}
      statsLine="Generates up to 24 nodes and 36 edges per analysis with 4 relationship types."
      jsonLd={jsonLd}
    />
  );
}
