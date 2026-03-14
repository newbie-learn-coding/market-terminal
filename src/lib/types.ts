export type EvidenceItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  observedAt: number;
  timeKind: 'published' | 'observed';
  language?: string;
  excerpt?: string;
  excerptSource?: 'serp' | 'markdown';
  aiSummary?: {
    bullets: string[];
    entities?: string[];
    catalysts?: string[];
    sentiment?: 'bullish' | 'bearish' | 'mixed' | 'neutral';
    confidence?: number;
  };
};

export type TapeItem = {
  id: string;
  title: string;
  source: string;
  publishedAt: number;
  tags: string[];
  evidenceId: string;
};

export type StoryCluster = {
  id: string;
  title: string;
  summary: string;
  momentum: 'rising' | 'steady' | 'fading';
  evidenceIds: string[];
  related: string[];
};
