import type { Metadata } from 'next';
import LandingClient from '@/components/landing/LandingClient';

export const metadata: Metadata = {
  title: 'Market Signal Analyzer - Evidence-Based Market Research Tool',
  description:
    'Search any market topic and get live evidence maps, knowledge graphs, and AI-powered analysis. Free market signal analyzer powered by Bright Data.',
  keywords: [
    'market signal analyzer',
    'evidence-based market research',
    'stock analysis tool',
    'market news analyzer',
    'knowledge graph',
  ],
  openGraph: {
    title: 'Market Signal Analyzer - Evidence-Based Market Research',
    description:
      'Search any market topic and get live evidence maps, knowledge graphs, and AI-powered analysis.',
    type: 'website',
  },
};

export default function HomePage() {
  return <LandingClient />;
}
