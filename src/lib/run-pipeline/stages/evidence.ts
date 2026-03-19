import { brightDataRequestMarkdown, type SerpResult } from '@/lib/brightdata';
import type { EvidenceItem } from '@/lib/run-pipeline/contracts';
import type { EvidenceItemsWithScrapeMeta } from '@/lib/run-pipeline/contracts';
import { asEvidenceFromSerp, sleep, truncateText } from '@/lib/run-pipeline/utils';
import { chatJson, getAIConfig } from '@/lib/ai';
import { env } from '@/lib/env';
import { buildSignalTerminalSummariesPrompt } from '@/prompts/signalTerminalSummaries';
import { z } from 'zod';

function markdownToText(md: string) {
  let s = String(md || '');
  if (!s.trim()) return '';
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/```[\s\S]*?```/g, '\n');
  s = s.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');
  s = s.replace(/\[([^\]]{0,220})]\(([^)]+)\)/g, (_, label) => String(label || '').trim());
  s = s.replace(/\[\s*]\([^)]+\)/g, ' ');
  s = s.replace(/[*_`>#]/g, ' ');
  return s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function pickReadableExcerpt(text: string, maxLen: number) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const scoreLine = (line: string) => {
    const len = line.length;
    if (len < 60) return -10;
    const starCount = (line.match(/\*/g) || []).length;
    const slashCount = (line.match(/\//g) || []).length;
    const pipeCount = (line.match(/\|/g) || []).length;
    const digitCount = (line.match(/\d/g) || []).length;
    const hasSentence = /[.!?]/.test(line);
    const navWords = /\b(sign in|log in|subscribe|privacy|terms|cookie|menu|search|markets?|about|contact|invest|trade|earn)\b/i.test(line);
    if (starCount >= 3) return -15;
    if (slashCount >= 6) return -12;
    if (pipeCount >= 4) return -10;
    if (navWords && len < 220) return -8;

    let score = 0;
    score += Math.min(10, len / 40);
    if (hasSentence) score += 2;
    if (digitCount > 6) score -= 1;
    score -= starCount * 1.2;
    score -= slashCount * 0.6;
    score -= pipeCount * 0.8;
    return score;
  };

  let best = '';
  let bestScore = -Infinity;
  for (const line of lines) {
    const score = scoreLine(line);
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }

  const chosen = bestScore > -5 ? best : (lines[0] || '');
  return truncateText(chosen.replace(/\s+/g, ' ').trim(), maxLen);
}

export async function buildEvidenceHybrid({
  results,
  startedAt,
  mode,
  signal,
  onScrape,
  onScrapeTiming,
}: {
  results: SerpResult[];
  startedAt: number;
  mode: 'fast' | 'deep';
  signal: AbortSignal;
  onScrape?: (evt: { idx: number; total: number; url: string; status: 'start' | 'done' | 'fail' }) => void;
  onScrapeTiming?: (evt: { url: string; ms: number; ok: boolean }) => void;
}): Promise<EvidenceItem[]> {
  const limit = 12;
  const items = asEvidenceFromSerp(results.slice(0, limit), startedAt);
  if (mode !== 'deep') return items;

  const scrapeCount = Math.min(4, items.length);
  const scrapeConcurrency = Math.min(2, scrapeCount);
  let scrapeFailures = 0;
  let firstFailure = '';
  let scrapeCursor = 0;

  const scrapeOne = async (idx: number) => {
    if (signal.aborted) throw new Error('aborted');
    const ev = items[idx]!;
    onScrape?.({ idx: idx + 1, total: scrapeCount, url: ev.url, status: 'start' });
    const scrapeStartedAt = Date.now();
    try {
      const md = await brightDataRequestMarkdown(ev.url);
      const cleaned = markdownToText(md);
      const excerpt = pickReadableExcerpt(cleaned, 620);
      if (excerpt) {
        ev.excerpt = excerpt;
        ev.excerptSource = 'markdown';
      }
      onScrapeTiming?.({ url: ev.url, ms: Date.now() - scrapeStartedAt, ok: true });
      onScrape?.({ idx: idx + 1, total: scrapeCount, url: ev.url, status: 'done' });
    } catch {
      if (signal.aborted) throw new Error('aborted');
      scrapeFailures += 1;
      if (!firstFailure) firstFailure = ev.url;
      onScrapeTiming?.({ url: ev.url, ms: Date.now() - scrapeStartedAt, ok: false });
      onScrape?.({ idx: idx + 1, total: scrapeCount, url: ev.url, status: 'fail' });
    }
    await sleep(80, signal);
  };

  const workers = Array.from({ length: scrapeConcurrency }, async () => {
    while (true) {
      if (signal.aborted) throw new Error('aborted');
      const idx = scrapeCursor;
      scrapeCursor += 1;
      if (idx >= scrapeCount) return;
      await scrapeOne(idx);
    }
  });
  await Promise.all(workers);

  (items as EvidenceItemsWithScrapeMeta)._scrape = {
    attempted: scrapeCount,
    failures: scrapeFailures,
    firstFailure: firstFailure || undefined,
    concurrency: scrapeConcurrency,
  };
  return items;
}

const EvidenceSummariesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(3),
        bullets: z.array(z.string().min(6).max(160)).min(2).max(5),
        entities: z.array(z.string().min(1).max(40)).max(12).optional(),
        catalysts: z.array(z.string().min(2).max(60)).max(10).optional(),
        sentiment: z.enum(['bullish', 'bearish', 'mixed', 'neutral']).optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .max(18),
});

export async function summarizeEvidence({
  topic,
  evidence,
  model,
  apiKey,
  onAiUsage,
}: {
  topic: string;
  evidence: EvidenceItem[];
  model?: string;
  apiKey?: string;
  onAiUsage?: (u: {
    model: string;
    tag?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }) => void;
}): Promise<EvidenceItem[]> {
  if (!evidence.length) return evidence;

  const stageModel = env.ai.openrouter.modelSummaries;
  const config = getAIConfig({ apiKeyOverride: apiKey, modelOverride: model || stageModel || undefined });
  if (!config) return evidence;

  const top = evidence.slice(0, 10).map((e) => ({
    id: e.id,
    title: e.title,
    source: e.source,
    excerpt: truncateText(e.excerpt || '', 520),
    excerptSource: e.excerptSource || 'serp',
  }));

  const summariesPrompt = buildSignalTerminalSummariesPrompt({ topic, evidenceExcerpts: top });

  let out: z.infer<typeof EvidenceSummariesSchema>;
  try {
    out = await chatJson({
      config,
      schema: EvidenceSummariesSchema,
      system: summariesPrompt.system,
      user: summariesPrompt.user,
      temperature: 0.1,
      telemetry: { tag: 'summaries', onUsage: onAiUsage },
    });
  } catch {
    return evidence;
  }

  const byId = new Map<string, (typeof out.items)[number]>();
  for (const item of out.items) byId.set(item.id, item);

  return evidence.map((e) => {
    const summary = byId.get(e.id);
    if (!summary) return e;
    return {
      ...e,
      aiSummary: {
        bullets: summary.bullets.slice(0, 5),
        entities: summary.entities?.slice(0, 12),
        catalysts: summary.catalysts?.slice(0, 10),
        sentiment: summary.sentiment,
        confidence: summary.confidence,
      },
    };
  });
}
