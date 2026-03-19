import { z } from 'zod';

export type PipelineStep = 'idle' | 'plan' | 'search' | 'scrape' | 'extract' | 'link' | 'cluster' | 'render' | 'ready';

export type PerfMark = {
  phase: 'step' | 'api' | 'stage' | 'system';
  name: string;
  startedAt: number;
  endedAt: number;
  ms: number;
  ok: boolean;
  details?: Record<string, unknown>;
};

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

export type EvidenceItemsWithScrapeMeta = EvidenceItem[] & {
  _scrape?: {
    attempted: number;
    failures: number;
    firstFailure?: string;
    concurrency: number;
  };
};

export const RunRequestSchema = z.object({
  topic: z.string().min(1),
  question: z.string().optional(),
  mode: z.enum(['fast', 'deep']).optional().default('fast'),
  serpFormat: z.enum(['light', 'full', 'markdown']).optional(),
  provider: z.enum(['openrouter']).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
});
