import { z } from 'zod';

import { env, hasBrightData, hasDb } from '@/lib/env';
import { getAIConfig, chatJson } from '@/lib/ai';
import { brightDataRequestMarkdown, brightDataSerpGoogle, type SerpResult } from '@/lib/brightdata';
import { createSession, updateStep as dbUpdateStep, updateStatus, insertEvent } from '@/lib/db';
import { createLogger } from '@/lib/log';
import { selectStageModel } from '@/lib/modelRouting';
import type { GraphEdge, GraphNode } from '@/components/terminal/types';
import { buildSignalTerminalPlanPrompt } from '@/prompts/signalTerminalPlan';
import { buildSignalTerminalSummariesPrompt } from '@/prompts/signalTerminalSummaries';
import { buildSignalTerminalArtifactsPrompt, buildSignalTerminalArtifactsRepairPrompt } from '@/prompts/signalTerminalArtifacts';
import { buildSignalTerminalImpactPrompt } from '@/prompts/signalTerminalImpact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Canonical pipeline phases reported to the client/Convex as the run progresses.
type PipelineStep = 'idle' | 'plan' | 'search' | 'scrape' | 'extract' | 'link' | 'cluster' | 'render' | 'ready';

type PerfMark = {
  phase: 'step' | 'api' | 'stage' | 'system';
  name: string;
  startedAt: number;
  endedAt: number;
  ms: number;
  ok: boolean;
  details?: Record<string, unknown>;
};

type EvidenceItem = {
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

type TapeItem = {
  id: string;
  title: string;
  source: string;
  publishedAt: number;
  tags: string[];
  evidenceId: string;
};

type StoryCluster = {
  id: string;
  title: string;
  summary: string;
  momentum: 'rising' | 'steady' | 'fading';
  evidenceIds: string[];
  related: string[];
};

const RunRequestSchema = z.object({
  topic: z.string().min(1),
  question: z.string().optional(),
  mode: z.enum(['fast', 'deep']).optional().default('fast'),
  serpFormat: z.enum(['light', 'full', 'markdown']).optional(),
  provider: z.enum(['openrouter']).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
});

function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(new Error('aborted'));
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

function domainFromUrl(rawUrl: string) {
  try {
    const u = new URL(rawUrl);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function googleSearchUrl(q: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&gl=us&num=10`;
}

function parsePublishedAtFromSnippet(snippet: string | undefined, observedAt: number): number | null {
  const s = (snippet || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  // Common SERP pattern: "2 hours ago - ..."
  const rel = lower.match(/\b(\d{1,3})\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s*ago\b/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2] || '';
    if (Number.isFinite(n) && n > 0) {
      const ms =
        unit.startsWith('min') || unit.startsWith('minute')
          ? n * 60_000
          : unit.startsWith('hr') || unit.startsWith('hour')
            ? n * 3_600_000
            : unit.startsWith('day')
              ? n * 86_400_000
              : unit.startsWith('week')
                ? n * 7 * 86_400_000
                : unit.startsWith('month')
                  ? n * 30 * 86_400_000
                  : unit.startsWith('year')
                    ? n * 365 * 86_400_000
                    : 0;
      if (ms > 0) return Math.max(0, observedAt - ms);
    }
  }

  // Absolute date in snippet (often "Feb 6, 2026 — ...")
  const abs = s.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i);
  if (abs) {
    const ts = Date.parse(abs[0]);
    if (Number.isFinite(ts)) return ts;
  }

  const iso = s.match(/\b(20\d{2}-\d{2}-\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2})?Z?)?\b/);
  if (iso) {
    const ts = Date.parse(iso[0]);
    if (Number.isFinite(ts)) return ts;
  }

  return null;
}

function coerceTimestampLoose(value: unknown): number | undefined {
  if (value == null) return undefined;

  const normalizeEpoch = (n: number) => {
    if (!Number.isFinite(n)) return undefined;
    if (n <= 0) return undefined;
    // Handle seconds vs milliseconds.
    if (n < 10_000_000_000) return Math.round(n * 1000);
    return Math.round(n);
  };

  if (typeof value === 'number') return normalizeEpoch(value);

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return undefined;

    const numRaw = raw.replace(/,/g, '');
    const asNum = Number(numRaw);
    if (Number.isFinite(asNum)) return normalizeEpoch(asNum);

    const asDate = Date.parse(raw);
    if (Number.isFinite(asDate) && asDate > 0) return Math.round(asDate);

    const lower = raw.toLowerCase();
    const rel = lower.match(
      /\b(\d{1,3})\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s*ago\b/,
    );
    if (rel) {
      const n = Number(rel[1]);
      const unit = rel[2] || '';
      if (Number.isFinite(n) && n > 0) {
        const ms =
          unit.startsWith('min') || unit.startsWith('minute')
            ? n * 60_000
            : unit.startsWith('hr') || unit.startsWith('hour')
              ? n * 3_600_000
              : unit.startsWith('day')
                ? n * 86_400_000
                : unit.startsWith('week')
                  ? n * 7 * 86_400_000
                  : unit.startsWith('month')
                    ? n * 30 * 86_400_000
                    : unit.startsWith('year')
                      ? n * 365 * 86_400_000
                      : 0;
        if (ms > 0) return Math.max(0, Date.now() - ms);
      }
    }

    return undefined;
  }

  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isFinite(ts) && ts > 0 ? Math.round(ts) : undefined;
  }

  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const candidate =
      o.publishedAt ??
      o.timestamp ??
      o.ts ??
      o.time ??
      o.unix ??
      o.epoch ??
      o.value;
    if (candidate !== undefined) return coerceTimestampLoose(candidate);
  }

  return undefined;
}

function filterStaleEvidence(evidence: EvidenceItem[], observedAt: number, maxAgeDays: number) {
  const maxAgeMs = Math.max(1, Math.round(maxAgeDays)) * 86_400_000;
  const keep = evidence.filter((e) => e.timeKind !== 'published' || observedAt - e.publishedAt <= maxAgeMs);
  return { keep, dropped: Math.max(0, evidence.length - keep.length) };
}

function parseStatusFromBrightDataErrorMessage(message: string) {
  const m = message.match(/\((\d{3})\)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function uniqueByUrl(results: SerpResult[], limit: number) {
  const seen = new Set<string>();
  const out: SerpResult[] = [];
  for (const r of results) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

function scoreSerpResult(r: SerpResult): number {
  const domain = domainFromUrl(r.url);
  const hay = `${r.title || ''} ${r.snippet || ''}`.toLowerCase();

  let score = 0;
  // Prefer items that look like time-bound updates and catalysts.
  if (/\b(today|latest|update|breaking|hours?|day|week)\b/.test(hay)) score += 2;
  if (/\b(news|headline|rumou?r|report|filing|approval|lawsuit)\b/.test(hay)) score += 2;
  if (/\b(etf|sec|fed|cpi|inflation|rates?|yield|treasury|dxy|dollar|gold|xau|oil|wti|brent)\b/.test(hay)) score += 2;
  if (/\b(spillover|stocks?|equities?|miners?|nasdaq|s\\&p|spx|dow|microstrategy|mstr|treasur(y|ies)|bonds?|futures|funding)\b/.test(hay))
    score += 1.2;

  // Price pages are useful, but shouldn't dominate.
  if (/\b(price|chart|quote|market cap|live)\b/.test(hay)) score += 0.5;

  // Light domain hints to bias to editorial sources when present.
  if (/(reuters|bloomberg|cnbc|ft\.com|wsj\.com|coindesk|theblock|decrypt|cointelegraph|investopedia)\b/.test(domain)) score += 1.5;
  if (/(coinmarketcap|tradingview|coingecko|coinbase|bitflyer|kraken|binance|okx)\b/.test(domain)) score -= 0.4;
  if (/(perplexity\.ai|arxiv\.org|wikipedia\.org|github\.com|quora\.com|medium\.com)\b/.test(domain)) score -= 2.2;
  if (/(reddit\.com)\b/.test(domain)) score -= 1.2;

  return score;
}

function pickSerpDiverse(results: SerpResult[], limit: number) {
  const uniq = uniqueByUrl(results, 80);
  const ranked = uniq
    .map((r) => ({ r, score: scoreSerpResult(r) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);

  const perDomainCap = 2;
  const domainCounts = new Map<string, number>();
  const out: SerpResult[] = [];

  for (const r of ranked) {
    const d = domainFromUrl(r.url);
    const count = domainCounts.get(d) ?? 0;
    if (count >= perDomainCap) continue;
    out.push(r);
    domainCounts.set(d, count + 1);
    if (out.length >= limit) return out;
  }

  // If we couldn't fill due to domain caps, relax and fill the remainder.
  for (const r of uniq) {
    if (out.some((x) => x.url === r.url)) continue;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

function asEvidenceFromSerp(results: SerpResult[], startedAt: number): EvidenceItem[] {
  return results.map((r, idx) => {
    const observedAt = startedAt;
    const publishedAt = parsePublishedAtFromSnippet(r.snippet, observedAt);
    return {
      id: `ev_${idx + 1}`,
      title: r.title || r.url,
      url: r.url,
      source: domainFromUrl(r.url),
      observedAt,
      publishedAt: publishedAt ?? observedAt,
      timeKind: publishedAt ? 'published' : 'observed',
      excerpt: r.snippet,
      excerptSource: 'serp',
    };
  });
}

function slugId(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
}

function truncateText(raw: string, max: number) {
  const s = (raw || '').trim();
  if (s.length <= max) return s;
  if (max <= 3) return s.slice(0, max);
  return `${s.slice(0, max - 3).trimEnd()}...`;
}

function safeErrorText(err: unknown, max = 220) {
  const raw = err instanceof Error ? err.message : String(err || 'error');
  return truncateText(raw, max);
}

function extractOutputPreviewFromReason(reason: string): string | null {
  const s = String(reason || '');
  const m = s.match(/First 220 chars:\s*([\s\S]+)$/i);
  if (!m?.[1]) return null;
  return truncateText(m[1].replace(/\s+/g, ' ').trim(), 220) || null;
}

function normalizeEntityCandidate(raw: string) {
  return String(raw || '')
    .replace(/\bU\.S\.\b/g, 'US')
    .replace(/^[^A-Za-z0-9$]+|[^A-Za-z0-9]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoisyEntityCandidate(label: string) {
  const s = String(label || '').toLowerCase().trim();
  if (!s) return true;
  if (/\d{2,}/.test(s)) return true;
  if (/\b(previous close|week range|day range|open interest|market cap|prediction|forecast|price|chart|today)\b/.test(s))
    return true;
  if (/\b(falls|rises|surges|drops|waits|climbs|slips|struggles|extends)\b/.test(s)) return true;
  if (/\b(bitcoin|btc|gold|xau|dxy|usd)\b/.test(s)) return true;
  if (/\b(news|analysis|report|reports|update|updates)\b/.test(s) && s.split(/\s+/).length <= 3)
    return true;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/.test(s)) return true;
  return false;
}

function isNameLikeEntityLabel(label: string) {
  const compact = String(label || '').replace(/…/g, '').trim();
  if (!compact) return false;
  if (isNoisyEntityCandidate(compact)) return false;

  const words = compact.split(/\s+/).filter(Boolean);
  const blacklist = new Set(
    [
      'market',
      'crypto',
      'cryptos',
      'bitcoin',
      'gold',
      'dollar',
      'price',
      'analysis',
      'forecast',
      'update',
      'flows',
      'yield',
      'yields',
      'rates',
      'jobs',
      'report',
      'reports',
      'news',
      'optimism',
      'weakness',
      'liquidity',
      'session',
      'today',
      'trading',
      'day',
      'cut',
      'data',
      'despite',
      'stunning',
      'research',
      'team',
      'strong',
      'weak',
      'fragile',
      'structural',
      'case',
      'first',
      'bottom',
    ].map((w) => w.toLowerCase()),
  );
  if (words.some((w) => blacklist.has(w.toLowerCase()))) return false;
  const compactLower = compact.toLowerCase();
  if (compactLower.includes('bitcoin') || compactLower.includes('crypto')) return false;

  // Single-token entities are too noisy in heuristic mode; prefer explicit keyword mappings.
  if (words.length === 1) return false;

  // Person/org names: two capitalized words or acronym + capitalized words.
  if (words.length === 2) {
    const w0 = words[0] || '';
    const w1 = words[1] || '';
    return (
      (/^[A-Z][a-z]{2,}$/.test(w0) && /^[A-Z][a-z]{2,}$/.test(w1)) ||
      (/^[A-Z]{2,4}$/.test(w0) && /^[A-Z][a-z]{2,}$/.test(w1))
    );
  }
  if (words.length === 3) {
    const w0 = words[0] || '';
    const w1 = words[1] || '';
    const w2 = words[2] || '';
    return (
      /^[A-Z]{2,4}$/.test(w0) &&
      /^[A-Z][a-z]{2,}$/.test(w1) &&
      /^[A-Z][a-z]{2,}$/.test(w2)
    );
  }

  return false;
}

function canonicalizeActorLabel(label: string) {
  const s = String(label || '').trim();
  const lower = s.toLowerCase();
  if (lower === 'fed' || lower === 'federal reserve') return 'Federal Reserve';
  if (lower === 'treasury' || lower === 'us treasury') return 'US Treasury';
  if (lower === 'sec' || lower === 'securities and exchange commission') return 'SEC';
  if (lower === 'doj' || lower === 'department of justice') return 'DOJ';
  if (lower === 'cftc') return 'CFTC';
  if (lower === 'ecb') return 'ECB';
  if (lower === 'imf') return 'IMF';
  return s;
}

function extractHeuristicEntities(text: string): string[] {
  const source = String(text || '')
    .replace(/\bU\.S\.\b/g, 'US')
    .replace(/[|()[\]{}]/g, ' ');
  if (!source.trim()) return [];

  const candidates: string[] = [];
  const pushMatches = (regex: RegExp) => {
    const matches = source.match(regex) || [];
    for (const m of matches) candidates.push(m);
  };

  // Multi-word proper names, e.g. "Michael Saylor", "Federal Reserve".
  pushMatches(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g);
  // CamelCase org-style words, e.g. "JPMorgan", "BlackRock", "MicroStrategy".
  pushMatches(/\b[A-Z][a-z]+[A-Z][A-Za-z]+\b/g);
  // Common policy/market institutions often relevant to macro catalysts.
  pushMatches(/\b(?:SEC|Fed|Federal Reserve|US Treasury|Treasury|JPMorgan|BlackRock|Coinbase|Binance|MicroStrategy|Grayscale|Glassnode|ECB|IMF|CFTC|DOJ)\b/gi);

  const stopWords = new Set(
    [
      'today',
      'latest',
      'news',
      'analysis',
      'update',
      'market',
      'markets',
      'price',
      'prices',
      'crypto',
      'cryptocurrency',
      'bitcoin',
      'gold',
      'dollar',
      'index',
      'futures',
      'etf',
      'etfs',
      'forecast',
      'outlook',
      'traders',
      'investors',
      'session',
    ].map((w) => w.toLowerCase()),
  );

  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    const cleaned = normalizeEntityCandidate(raw);
    if (!cleaned) continue;
    if (cleaned.length < 3 || cleaned.length > 40) continue;
    if (isNoisyEntityCandidate(cleaned)) continue;
    if (!isNameLikeEntityLabel(cleaned)) continue;
    if (cleaned.includes('.') || cleaned.includes('/')) continue;
    if (/^\d+$/.test(cleaned)) continue;

    const words = cleaned.split(/\s+/).map((w) => w.toLowerCase());
    if (!words.length) continue;
    if (words.every((w) => stopWords.has(w))) continue;
    if (words.length === 1 && words[0] && stopWords.has(words[0])) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }

  return out.slice(0, 10);
}

function looksLikeDomainLabel(label: string) {
  const s = String(label || '').trim().toLowerCase();
  if (!s) return false;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\.[a-z]{2,})?$/.test(s);
}

function normalizeNodeTypeByLabel(type: GraphNode['type'], label: string): GraphNode['type'] {
  const raw = String(label || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return type;

  if (type === 'entity' && looksLikeDomainLabel(raw)) return 'source';

  if (type === 'source') {
    if (looksLikeDomainLabel(raw)) return 'source';
    if (
      /\b(federal reserve|us treasury|treasury|sec|cftc|doj|ecb|imf|jpmorgan|blackrock|coinbase|binance|microstrategy|grayscale|michael saylor|elon musk)\b/.test(
        lower,
      )
    ) {
      return 'entity';
    }
  }

  return type;
}

function extractKeywordActors(text: string): string[] {
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return [];

  const out = new Set<string>();
  if (/\b(fed|federal reserve|fomc)\b/.test(s)) out.add('Federal Reserve');
  if (/\b(sec|securities and exchange commission)\b/.test(s)) out.add('SEC');
  if (/\b(us treasury|treasury)\b/.test(s)) out.add('US Treasury');
  if (/\b(cftc)\b/.test(s)) out.add('CFTC');
  if (/\b(doj|department of justice)\b/.test(s)) out.add('DOJ');
  if (/\b(ecb)\b/.test(s)) out.add('ECB');
  if (/\b(imf)\b/.test(s)) out.add('IMF');
  if (/\b(blackrock|ibit)\b/.test(s)) out.add('BlackRock');
  if (/\b(grayscale|gbtc)\b/.test(s)) out.add('Grayscale');
  if (/\b(binance)\b/.test(s)) out.add('Binance');
  if (/\b(coinbase)\b/.test(s)) out.add('Coinbase');
  if (/\b(jpmorgan)\b/.test(s)) out.add('JPMorgan');
  if (/\b(microstrategy|mstr)\b/.test(s)) out.add('MicroStrategy');

  return Array.from(out).slice(0, 6);
}

function markdownToText(md: string) {
  let s = String(md || '');
  if (!s.trim()) return '';

  s = s.replace(/\r\n/g, '\n');
  // Drop fenced code blocks (often nav/json noise).
  s = s.replace(/```[\s\S]*?```/g, '\n');
  // Drop images.
  s = s.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');
  // Replace links with their visible text.
  s = s.replace(/\[([^\]]{0,220})]\(([^)]+)\)/g, (_, label) => String(label || '').trim());
  // Remove empty link labels: [](/)
  s = s.replace(/\[\s*]\([^)]+\)/g, ' ');
  // Strip common markdown punctuation.
  s = s.replace(/[*_`>#]/g, ' ');
  // Normalize whitespace per-line.
  s = s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return s;
}

function pickReadableExcerpt(text: string, maxLen: number) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
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

    // Penalize obvious navigation/menu lines.
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
    const s = scoreLine(line);
    if (s > bestScore) {
      bestScore = s;
      best = line;
    }
  }

  const chosen = bestScore > -5 ? best : (lines[0] || '');
  return truncateText(chosen.replace(/\s+/g, ' ').trim(), maxLen);
}

// Creates a minimal, connected graph when model output is sparse or malformed.
function ensureMinimumGraph({
  topic,
  evidence,
  nodes,
  edges,
}: {
  topic: string;
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const evidenceIds = evidence.map((e) => e.id);
  const seedEvidenceId = evidenceIds[0];
  if (!seedEvidenceId) return { nodes, edges };

  const outNodes: GraphNode[] = [...nodes];
  const outEdges: GraphEdge[] = edges.filter((e) => e.from !== e.to);
  const ids = new Set(outNodes.map((n) => n.id));
  const edgeIds = new Set(outEdges.map((e) => e.id));

  const firstSourceLabel = evidence.find((e) => e.source)?.source || 'Sources';
  const sourceId = `n_${slugId(firstSourceLabel) || 'source'}`;
  if (!outNodes.some((n) => n.type === 'source')) {
    const id = ids.has(sourceId) ? `n_source` : sourceId;
    if (!ids.has(id)) {
      outNodes.push({ id, type: 'source', label: firstSourceLabel.slice(0, 24) });
      ids.add(id);
    }
  }

  const topicLabel = topic.trim() ? topic.trim() : 'Asset';
  const assetId = `n_${slugId(topicLabel) || 'asset'}`;
  if (!outNodes.some((n) => n.type === 'asset')) {
    const id = ids.has(assetId) ? `n_asset` : assetId;
    if (!ids.has(id)) {
      outNodes.push({ id, type: 'asset', label: topicLabel.toUpperCase().slice(0, 12) });
      ids.add(id);
    }
  }

  // If the model produced a degenerate map (no usable edges), seed a simple link so the UI stays explorable.
  if (outEdges.length === 0) {
    const src = outNodes.find((n) => n.type === 'source')?.id;
    const asset = outNodes.find((n) => n.type === 'asset')?.id;
    if (src && asset && src !== asset) {
      let id = 'e_seed';
      let i = 1;
      while (edgeIds.has(id) && i < 20) {
        id = `e_seed_${i}`;
        i += 1;
      }
      outEdges.push({
        id,
        from: src,
        to: asset,
        type: 'mentions',
        confidence: 0.25,
        evidenceIds: [seedEvidenceId],
      });
    }
  }

  return {
    nodes: outNodes.slice(0, 26),
    edges: outEdges.slice(0, 40),
  };
}

// Adds structure (sources/events) so the graph remains explorable even with thin model output.
function enrichGraphFromTapeAndEvidence({
  topic,
  evidence,
  tape,
  nodes,
  edges,
}: {
  topic: string;
  evidence: EvidenceItem[];
  tape: TapeItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const MAX_NODES = 26;
  const MAX_EDGES = 40;

  const outNodes: GraphNode[] = [...nodes];
  const outEdges: GraphEdge[] = edges.filter((e) => e.from !== e.to);
  const nodeIds = new Set(outNodes.map((n) => n.id));
  const edgeIds = new Set(outEdges.map((e) => e.id));
  const keyToNodeId = new Map<string, string>();

  for (const n of outNodes) {
    keyToNodeId.set(`${n.type}|${n.label.toLowerCase()}`, n.id);
  }

  const evidenceById = new Map<string, EvidenceItem>();
  for (const ev of evidence) evidenceById.set(ev.id, ev);

  const ensureNode = (id: string, type: GraphNode['type'], label: string): string | null => {
    const safeLabel = truncateText(label, 32) || 'Unknown';
    const key = `${type}|${safeLabel.toLowerCase()}`;
    const existing = keyToNodeId.get(key);
    if (existing) return existing;

    let nextId = id.slice(0, 40);
    if (!nextId) nextId = `n_${slugId(`${type}_${safeLabel}`)}`.slice(0, 40);
    if (nodeIds.has(nextId)) {
      let i = 1;
      while (i < 30 && nodeIds.has(`${nextId}_${i}`)) i += 1;
      nextId = `${nextId}_${i}`.slice(0, 40);
    }

    if (outNodes.length >= MAX_NODES) return null;
    outNodes.push({ id: nextId, type, label: safeLabel });
    nodeIds.add(nextId);
    keyToNodeId.set(key, nextId);
    return nextId;
  };

  const ensureEdge = (edge: Omit<GraphEdge, 'id'> & { id: string }) => {
    if (edge.from === edge.to) return;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return;
    const evidenceIds = Array.from(new Set(edge.evidenceIds)).slice(0, 6);
    if (!evidenceIds.length) return;

    let id = edge.id.slice(0, 40);
    if (!id) id = `e_${slugId(`${edge.from}_${edge.to}_${edge.type}`)}`.slice(0, 40);
    if (edgeIds.has(id)) {
      let i = 1;
      while (i < 30 && edgeIds.has(`${id}_${i}`)) i += 1;
      id = `${id}_${i}`.slice(0, 40);
    }

    if (outEdges.length >= MAX_EDGES) return;
    outEdges.push({
      id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      confidence: Math.max(0, Math.min(1, edge.confidence)),
      evidenceIds,
    });
    edgeIds.add(id);
  };

  const assetNodeId =
    outNodes.find((n) => n.type === 'asset')?.id ||
    ensureNode(`n_${slugId(topic) || 'asset'}`, 'asset', topic.toUpperCase().slice(0, 12)) ||
    outNodes[0]?.id ||
    null;

  // Ensure multiple source nodes (domains) are present.
  const domains = Array.from(new Set(evidence.map((e) => e.source).filter(Boolean))).slice(0, 6);
  for (const d of domains) {
    if (outNodes.length >= MAX_NODES) break;
    ensureNode(`n_src_${slugId(d) || 'source'}`, 'source', d);
  }

  // If the model produced a tiny graph, fan out tape into explicit event nodes for explorable structure.
  const existingEventCount = outNodes.filter((n) => n.type === 'event').length;
  const targetEvents = Math.min(6, Math.max(4, Math.min(6, tape.length)));
  if (existingEventCount < targetEvents) {
    for (const t of tape) {
      if (outNodes.length >= MAX_NODES) break;
      if (outEdges.length >= MAX_EDGES) break;
      const ev = evidenceById.get(t.evidenceId);
      if (!ev) continue;
      if (!assetNodeId) break;

      const sourceLabel = ev.source || t.source || 'source';
      const srcId = ensureNode(`n_src_${slugId(sourceLabel) || 'source'}`, 'source', sourceLabel);
      const evtId = ensureNode(`n_evt_${t.id}`, 'event', t.title);
      if (!srcId || !evtId) continue;

      ensureEdge({
        id: `e_src_${t.id}`,
        from: srcId,
        to: evtId,
        type: 'mentions',
        confidence: 0.58,
        evidenceIds: [t.evidenceId],
      });
      ensureEdge({
        id: `e_evt_${t.id}`,
        from: evtId,
        to: assetNodeId,
        type: 'hypothesis',
        confidence: 0.42,
        evidenceIds: [t.evidenceId],
      });

      const nowEvents = outNodes.filter((n) => n.type === 'event').length;
      if (nowEvents >= targetEvents) break;
    }
  }

  // Connect isolated nodes so the map stays explorable (no singletons).
  const degrees = new Map<string, number>();
  for (const n of outNodes) degrees.set(n.id, 0);
  for (const e of outEdges) {
    degrees.set(e.from, (degrees.get(e.from) ?? 0) + 1);
    degrees.set(e.to, (degrees.get(e.to) ?? 0) + 1);
  }

  const evidenceForSource = (sourceLabel: string) => {
    const key = sourceLabel.toLowerCase();
    return evidence.find((ev) => (ev.source || '').toLowerCase() === key) || evidence[0] || null;
  };

  for (const n of outNodes) {
    if ((degrees.get(n.id) ?? 0) > 0) continue;
    if (!assetNodeId || n.id === assetNodeId) continue;
    if (outEdges.length >= MAX_EDGES) break;

    const ev = n.type === 'source' ? evidenceForSource(n.label) : evidence[0] || null;
    if (!ev) continue;

    if (n.type === 'source') {
      ensureEdge({
        id: `e_iso_${slugId(n.id)}`,
        from: n.id,
        to: assetNodeId,
        type: 'mentions',
        confidence: 0.22,
        evidenceIds: [ev.id],
      });
    } else if (n.type === 'event') {
      ensureEdge({
        id: `e_iso_${slugId(n.id)}`,
        from: n.id,
        to: assetNodeId,
        type: 'hypothesis',
        confidence: 0.18,
        evidenceIds: [ev.id],
      });
    } else {
      ensureEdge({
        id: `e_iso_${slugId(n.id)}`,
        from: n.id,
        to: assetNodeId,
        type: 'same_story',
        confidence: 0.16,
        evidenceIds: [ev.id],
      });
    }

    degrees.set(n.id, 1);
    degrees.set(assetNodeId, (degrees.get(assetNodeId) ?? 0) + 1);
  }

  return {
    nodes: outNodes.slice(0, MAX_NODES),
    edges: outEdges.slice(0, MAX_EDGES),
  };
}

function enrichEntitiesFromEvidence({
  topic,
  evidence,
  nodes,
  edges,
}: {
  topic: string;
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const MAX_NODES = 26;
  const MAX_EDGES = 40;

  const outNodes: GraphNode[] = [...nodes];
  const outEdges: GraphEdge[] = edges.filter((e) => e.from !== e.to);
  const nodeIds = new Set(outNodes.map((n) => n.id));
  const edgeIds = new Set(outEdges.map((e) => e.id));
  const labelKey = new Set(outNodes.map((n) => `${n.type}|${n.label.toLowerCase()}`));
  const edgeKey = new Set(outEdges.map((e) => `${e.from}|${e.to}|${e.type}`));

  const topicLower = topic.trim().toLowerCase();
  const banned = new Set(
    [
      topicLower,
      'bitcoin',
      'btc',
      'gold',
      'xau',
      'usd',
      'dxy',
      'sp500',
      's&p 500',
      's&p500',
    ]
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const assetId = outNodes.find((n) => n.type === 'asset')?.id || outNodes[0]?.id || null;
  if (!assetId) return { nodes: outNodes, edges: outEdges };

  const candidates = new Map<string, { score: number; evidenceIds: Set<string> }>();
  for (const ev of evidence) {
    const textBlob = `${ev.title}\n${truncateText(ev.excerpt || '', 300)}`;
    const aiEntities = ev.aiSummary?.entities || [];
    const heuristicEntities = extractHeuristicEntities(textBlob);
    const keywordActors = extractKeywordActors(textBlob);
    const ents = Array.from(new Set([...aiEntities, ...heuristicEntities, ...keywordActors]));

    for (const raw of ents) {
      const cleaned = String(raw || '')
        .replace(/^[#@]+/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned) continue;
      const canonical = canonicalizeActorLabel(cleaned);
      if (canonical.length < 2 || canonical.length > 36) continue;
      if (isNoisyEntityCandidate(canonical)) continue;
      if (banned.has(canonical.toLowerCase())) continue;

      const entry = candidates.get(canonical) || { score: 0, evidenceIds: new Set<string>() };
      // AI-summary entities get a stronger weight; heuristic matches keep fast mode useful.
      entry.score += aiEntities.includes(raw) ? 1.2 : keywordActors.includes(raw) ? 1.0 : 0.8;
      entry.evidenceIds.add(ev.id);
      candidates.set(canonical, entry);
    }
  }

  const ranked = Array.from(candidates.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 6);

  const ensureNode = (id: string, type: GraphNode['type'], label: string) => {
    const safeLabel = truncateText(label, 24) || 'Unknown';
    const key = `${type}|${safeLabel.toLowerCase()}`;
    if (labelKey.has(key)) return outNodes.find((n) => `${n.type}|${n.label.toLowerCase()}` === key)?.id || null;

    let nextId = id.slice(0, 40);
    if (!nextId) nextId = `n_${slugId(`${type}_${safeLabel}`)}`.slice(0, 40);
    if (nodeIds.has(nextId)) {
      let i = 1;
      while (i < 30 && nodeIds.has(`${nextId}_${i}`)) i += 1;
      nextId = `${nextId}_${i}`.slice(0, 40);
    }

    if (outNodes.length >= MAX_NODES) return null;
    outNodes.push({ id: nextId, type, label: safeLabel });
    nodeIds.add(nextId);
    labelKey.add(key);
    return nextId;
  };

  const ensureEdge = (edge: Omit<GraphEdge, 'id'> & { id: string }) => {
    if (edge.from === edge.to) return;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return;
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    if (edgeKey.has(key)) return;
    const evidenceIds = Array.from(new Set(edge.evidenceIds)).slice(0, 6);
    if (!evidenceIds.length) return;

    let id = edge.id.slice(0, 40);
    if (edgeIds.has(id)) {
      let i = 1;
      while (i < 30 && edgeIds.has(`${id}_${i}`)) i += 1;
      id = `${id}_${i}`.slice(0, 40);
    }

    if (outEdges.length >= MAX_EDGES) return;
    outEdges.push({ ...edge, id, evidenceIds });
    edgeIds.add(id);
    edgeKey.add(key);
  };

  for (const [label, meta] of ranked) {
    if (outNodes.length >= MAX_NODES) break;
    if (outEdges.length >= MAX_EDGES) break;

    const isTicker = /^\$?[A-Z]{2,6}$/.test(label) && label.toUpperCase() === label.replace(/^\$/, '');
    const cleanLabel = label.replace(/^\$/, '').trim();
    const type: GraphNode['type'] = isTicker ? 'asset' : 'entity';
    const nodeLabel = isTicker ? cleanLabel.toUpperCase() : cleanLabel;
    const nodeId = ensureNode(`n_${slugId(nodeLabel)}`, type, nodeLabel);
    if (!nodeId) continue;
    const eids = Array.from(meta.evidenceIds).slice(0, 3);
    ensureEdge({
      id: `e_ent_${slugId(`${assetId}_${nodeId}`)}`,
      from: assetId,
      to: nodeId,
      type: isTicker ? 'co_moves' : 'same_story',
      confidence: isTicker ? 0.32 : 0.28,
      evidenceIds: eids,
      rationale: isTicker ? 'Mentioned as related asset/spillover.' : 'Mentioned as a key actor/entity in evidence.',
    });
  }

  return {
    nodes: outNodes.slice(0, MAX_NODES),
    edges: outEdges.slice(0, MAX_EDGES),
  };
}

function enforceLinkCoherence({
  evidence,
  nodes,
  edges,
}: {
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const MAX_EDGES = 40;
  const outNodes = nodes.slice(0, 26);
  const outEdges = edges.filter((e) => e.from !== e.to).slice(0, MAX_EDGES);

  const nodeById = new Map<string, GraphNode>();
  for (const n of outNodes) nodeById.set(n.id, n);
  const sourceNodes = outNodes.filter((n) => n.type === 'source');
  const eventNodes = outNodes.filter((n) => n.type === 'event');
  const assetNode = outNodes.find((n) => n.type === 'asset') || null;
  if (!assetNode || !sourceNodes.length || !eventNodes.length) {
    return { nodes: outNodes, edges: outEdges };
  }

  const evidenceById = new Map<string, EvidenceItem>();
  for (const ev of evidence) evidenceById.set(ev.id, ev);

  const edgeIds = new Set(outEdges.map((e) => e.id));
  const edgeKeys = new Set(outEdges.map((e) => `${e.from}|${e.to}|${e.type}`));

  const normalizedDomain = (raw: string) =>
    String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');

  const sourceIdByDomain = new Map<string, string>();
  for (const s of sourceNodes) {
    sourceIdByDomain.set(normalizedDomain(s.label), s.id);
  }

  const eventEdgeEvidenceIds = (eventId: string) => {
    const ids = new Set<string>();
    for (const e of outEdges) {
      if (e.from === eventId || e.to === eventId) {
        for (const evId of e.evidenceIds || []) ids.add(evId);
      }
    }
    return Array.from(ids);
  };

  const hasLinkBetweenTypes = (
    eventId: string,
    targetType: GraphNode['type'],
  ) =>
    outEdges.some((e) => {
      if (e.from !== eventId && e.to !== eventId) return false;
      const otherId = e.from === eventId ? e.to : e.from;
      return nodeById.get(otherId)?.type === targetType;
    });

  const pickEvidenceForSource = (sourceLabel: string) => {
    const key = normalizedDomain(sourceLabel);
    return (
      evidence.find((ev) => normalizedDomain(ev.source) === key)?.id ||
      evidence[0]?.id ||
      null
    );
  };

  const sourceForEvidenceId = (evidenceId: string | null) => {
    if (!evidenceId) return sourceNodes[0]?.id || null;
    const ev = evidenceById.get(evidenceId);
    if (!ev) return sourceNodes[0]?.id || null;
    return (
      sourceIdByDomain.get(normalizedDomain(ev.source)) ||
      sourceNodes.find((s) => normalizedDomain(s.label) === normalizedDomain(ev.source))?.id ||
      sourceNodes[0]?.id ||
      null
    );
  };

  const addEdge = ({
    from,
    to,
    type,
    confidence,
    evidenceIds,
    rationale,
  }: {
    from: string;
    to: string;
    type: GraphEdge['type'];
    confidence: number;
    evidenceIds: string[];
    rationale: string;
  }) => {
    if (!nodeById.has(from) || !nodeById.has(to)) return;
    if (from === to || outEdges.length >= MAX_EDGES) return;
    const uniqueEvidence = Array.from(new Set(evidenceIds)).filter(Boolean).slice(0, 4);
    const finalEvidence = uniqueEvidence.length ? uniqueEvidence : evidence[0]?.id ? [evidence[0].id] : [];
    if (!finalEvidence.length) return;

    const directKey = `${from}|${to}|${type}`;
    const reverseKey = `${to}|${from}|${type}`;
    if (edgeKeys.has(directKey) || edgeKeys.has(reverseKey)) return;

    let id = `e_coh_${slugId(`${from}_${to}_${type}`)}`.slice(0, 40);
    if (edgeIds.has(id)) {
      let i = 1;
      while (i < 30 && edgeIds.has(`${id}_${i}`)) i += 1;
      id = `${id}_${i}`.slice(0, 40);
    }

    outEdges.push({
      id,
      from,
      to,
      type,
      confidence: Math.max(0, Math.min(1, confidence)),
      evidenceIds: finalEvidence,
      rationale,
    });
    edgeIds.add(id);
    edgeKeys.add(directKey);
  };

  for (const evt of eventNodes) {
    const eids = eventEdgeEvidenceIds(evt.id);
    const seedEvidenceId = eids[0] || evidence[0]?.id || null;

    if (!hasLinkBetweenTypes(evt.id, 'source')) {
      const srcId = sourceForEvidenceId(seedEvidenceId);
      if (srcId) {
        addEdge({
          from: srcId,
          to: evt.id,
          type: 'mentions',
          confidence: 0.24,
          evidenceIds: seedEvidenceId ? [seedEvidenceId] : [],
          rationale: 'Coherence: source linked to event by cited evidence.',
        });
      }
    }

    if (!hasLinkBetweenTypes(evt.id, 'asset')) {
      addEdge({
        from: evt.id,
        to: assetNode.id,
        type: 'hypothesis',
        confidence: 0.2,
        evidenceIds: seedEvidenceId ? [seedEvidenceId] : [],
        rationale: 'Coherence: event connected to primary asset context.',
      });
    }
  }

  for (const src of sourceNodes) {
    const hasAny = outEdges.some((e) => e.from === src.id || e.to === src.id);
    if (hasAny) continue;

    const evId = pickEvidenceForSource(src.label);
    const targetEventId =
      sourceForEvidenceId(evId) === src.id
        ? eventNodes.find((evt) => {
            const ids = eventEdgeEvidenceIds(evt.id);
            return !ids.length || ids.includes(String(evId || ''));
          })?.id
        : eventNodes[0]?.id;

    if (targetEventId) {
      addEdge({
        from: src.id,
        to: targetEventId,
        type: 'mentions',
        confidence: 0.2,
        evidenceIds: evId ? [evId] : [],
        rationale: 'Coherence: orphan source attached to nearest event.',
      });
    } else {
      addEdge({
        from: src.id,
        to: assetNode.id,
        type: 'mentions',
        confidence: 0.16,
        evidenceIds: evId ? [evId] : [],
        rationale: 'Coherence: orphan source attached to primary asset.',
      });
    }
  }

  return {
    nodes: outNodes,
    edges: outEdges.slice(0, MAX_EDGES),
  };
}

async function buildEvidenceHybrid({
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

  // Deep mode enriches a small subset with page markdown while keeping latency bounded.
  // Use a small worker pool so scrape latency approaches the slowest page, not sum of all pages.
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
      // Keep SERP snippet if scraping fails.
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

  // Attach minimal provenance so the caller can decide whether to surface a warning.
  (items as any)._scrape = { attempted: scrapeCount, failures: scrapeFailures, firstFailure, concurrency: scrapeConcurrency };
  return items;
}

const PlanSchema = z.object({
  queries: z.array(z.string().min(2)).min(3).max(10),
  angles: z.array(z.string()).max(12).optional(),
});

function normalizeArtifactsPayload(raw: unknown): unknown {
  let value = raw;

  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) break;
      try {
        value = JSON.parse(trimmed);
        continue;
      } catch {
        break;
      }
    }

    if (Array.isArray(value)) {
      if (!value.length) break;
      const first = value[0];
      if (value.length === 1) {
        value = first;
        continue;
      }
      const likely = value.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          ('tape' in (item as Record<string, unknown>) ||
            'nodes' in (item as Record<string, unknown>) ||
            'edges' in (item as Record<string, unknown>) ||
            'clusters' in (item as Record<string, unknown>)),
      );
      if (likely) {
        value = likely;
        continue;
      }
      break;
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;

      if ('items' in obj && Array.isArray(obj.items) && obj.items.length === 1) {
        value = obj.items[0];
        continue;
      }

      const wrapperKeys = ['result', 'results', 'output', 'response', 'data', 'json', 'payload', 'artifact', 'artifacts'];
      let unwrapped = false;
      for (const key of wrapperKeys) {
        const wrapped = obj[key];
        if (wrapped === undefined) continue;
        if (wrapped && (typeof wrapped === 'object' || Array.isArray(wrapped) || typeof wrapped === 'string')) {
          value = wrapped;
          unwrapped = true;
          break;
        }
      }
      if (unwrapped) continue;
    }

    break;
  }

  return value;
}

async function planQueries({
  topic,
  question,
  model,
  apiKey,
  onAiUsage,
}: {
  topic: string;
  question?: string;
  model?: string;
  apiKey?: string;
  onAiUsage?: (u: {
    model: string;
    tag?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }) => void;
}): Promise<{ queries: string[]; angles?: string[]; usedAI: boolean; reason?: string }> {
  const fallbackPlan = (reason: string) => {
    const base = question?.trim() || `What is moving ${topic} today? Is it related to gold?`;
    const queries = [
      `${topic} news today`,
      `${topic} price move today catalyst`,
      `${topic} related to gold`,
      `bitcoin gold correlation today`,
      `${topic} ETF flow headline`,
      `${topic} regulation policy headline`,
    ];
    return { queries: [base, ...queries].slice(0, 6), usedAI: false as const, reason };
  };

  const canUseClientKey = env.ai.allowClientApiKeys;
  const keyOverride = canUseClientKey ? apiKey : undefined;

  const stageModel = env.ai.openrouter.modelPlan;
  const config = getAIConfig({ apiKeyOverride: keyOverride, modelOverride: model || stageModel || undefined });
  if (!config) {
    return fallbackPlan('no_ai_config');
  }

  const planPrompt = buildSignalTerminalPlanPrompt({ topic, question });
  try {
    const plan = await chatJson({
      config,
      schema: PlanSchema,
      system: planPrompt.system,
      user: planPrompt.user,
      temperature: 0.2,
      telemetry: { tag: 'plan', onUsage: onAiUsage },
    });
    return { ...plan, usedAI: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e || 'plan_failed');
    return fallbackPlan(`plan_json_parse_failed: ${truncateText(message, 180)}`);
  }
}

const ArtifactsPayloadSchema = z.object({
  tape: z
    .array(
      z.object({
        title: z.string().min(6).max(200),
        source: z.string().min(2).max(120),
        publishedAt: z
          .preprocess((v) => coerceTimestampLoose(v), z.number().int().nonnegative().optional()),
        tags: z.preprocess(
          (v) => (Array.isArray(v) ? v.slice(0, 6) : v),
          z.array(z.string().min(1).max(40)).max(6),
        ),
        evidenceId: z.string().min(3),
      }),
    )
    .max(12),
  nodes: z
    .array(
      z.object({
        id: z.string().min(2).max(40),
        type: z.preprocess((v) => {
          const raw = typeof v === 'string' ? v.toLowerCase().trim() : '';
          if (raw === 'asset' || raw === 'ticker' || raw === 'symbol') return 'asset';
          if (raw === 'event' || raw === 'headline' || raw === 'catalyst') return 'event';
          if (raw === 'source' || raw === 'publisher' || raw === 'site') return 'source';
          if (raw === 'entity' || raw === 'person' || raw === 'org' || raw === 'organization') return 'entity';
          return 'entity';
        }, z.enum(['asset', 'event', 'entity', 'source'])),
        label: z.string().min(1).max(80),
      }),
    )
    .max(26),
  edges: z
    .array(
      z.object({
        id: z.string().min(2).max(40),
        from: z.string().min(2).max(40),
        to: z.string().min(2).max(40),
        type: z.preprocess((v) => {
          const raw = typeof v === 'string' ? v.toLowerCase().trim() : '';
          if (raw === 'mentions' || raw === 'cites' || raw === 'source') return 'mentions';
          if (raw === 'co_moves' || raw === 'correlates' || raw === 'correlation') return 'co_moves';
          if (raw === 'same_story' || raw === 'related' || raw === 'linked') return 'same_story';
          if (raw === 'hypothesis' || raw === 'impact' || raw === 'causes') return 'hypothesis';
          return 'hypothesis';
        }, z.enum(['mentions', 'co_moves', 'hypothesis', 'same_story'])),
        confidence: z.number().min(0).max(1),
        evidenceIds: z.preprocess(
          (v) => (Array.isArray(v) ? v.slice(0, 6) : v),
          z.array(z.string().min(3)).max(6),
        ),
        rationale: z.string().min(6).max(180).optional(),
      }),
    )
    .max(40),
  clusters: z
    .array(
      z.object({
        title: z.string().min(4).max(64),
        summary: z.string().min(30).max(360),
        momentum: z.preprocess((v) => {
          const raw = typeof v === 'string' ? v.toLowerCase().trim() : '';
          if (raw === 'rising' || raw === 'up' || raw === 'accelerating') return 'rising';
          if (raw === 'fading' || raw === 'down' || raw === 'cooling') return 'fading';
          return 'steady';
        }, z.enum(['rising', 'steady', 'fading'])),
        evidenceIds: z.preprocess(
          (v) => (Array.isArray(v) ? v.slice(0, 8) : v),
          z.array(z.string().min(3)).min(1).max(8),
        ),
        related: z.preprocess(
          (v) => (Array.isArray(v) ? v.slice(0, 8) : v),
          z.array(z.string().min(1).max(80)).max(8),
        ),
      }),
    )
    .max(6),
  assistantMessage: z.string().min(20).max(420).optional(),
});

const ArtifactsSchema = z.preprocess(
  (v) => normalizeArtifactsPayload(v),
  ArtifactsPayloadSchema,
);

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

async function summarizeEvidence({
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
  for (const it of out.items) byId.set(it.id, it);

  return evidence.map((e) => {
    const s = byId.get(e.id);
    if (!s) return e;
    return {
      ...e,
      aiSummary: {
        bullets: s.bullets.slice(0, 5),
        entities: s.entities?.slice(0, 12),
        catalysts: s.catalysts?.slice(0, 10),
        sentiment: s.sentiment,
        confidence: s.confidence,
      },
    };
  });
}

async function buildArtifacts({
  topic,
  evidence,
  mode,
  model,
  apiKey,
  onAiUsage,
}: {
  topic: string;
  evidence: EvidenceItem[];
  mode: 'fast' | 'deep';
  model?: string;
  apiKey?: string;
  onAiUsage?: (u: {
    model: string;
    tag?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }) => void;
}): Promise<{
  tape: TapeItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: StoryCluster[];
  assistantMessage?: string;
  usedAI: boolean;
  fallbackReason?: string;
}> {
  const canUseClientKey = env.ai.allowClientApiKeys;
  const keyOverride = canUseClientKey ? apiKey : undefined;
  const stageModel = env.ai.openrouter.modelArtifacts;
  const config = getAIConfig({ apiKeyOverride: keyOverride, modelOverride: model || stageModel || undefined });
  const startedAt = Date.now();

  if (!config) {
    // Minimal fallback for key-less environments.
    const baseTape: TapeItem[] = evidence.slice(0, 4).map((ev, idx) => ({
      id: `t${idx + 1}`,
      title: ev.title,
      source: ev.source,
      publishedAt: ev.publishedAt,
      tags: ['news', 'unverified'],
      evidenceId: ev.id,
    }));

    const seeded = ensureMinimumGraph({
      topic,
      evidence,
      nodes: [
        { id: 'n_asset', type: 'asset', label: topic.toUpperCase().slice(0, 8) },
        { id: 'n_source', type: 'source', label: 'Sources' },
      ],
      edges: evidence.slice(0, 2).map((ev, idx) => ({
        id: `e${idx + 1}`,
        from: 'n_source',
        to: 'n_asset',
        type: 'mentions',
        confidence: 0.3,
        evidenceIds: [ev.id],
      })),
    });
    const structured = enrichGraphFromTapeAndEvidence({
      topic,
      evidence,
      tape: baseTape,
      nodes: seeded.nodes,
      edges: seeded.edges,
    });
    const withEntities = enrichEntitiesFromEvidence({
      topic,
      evidence,
      nodes: structured.nodes,
      edges: structured.edges,
    });
    const coherent = enforceLinkCoherence({
      evidence,
      nodes: withEntities.nodes,
      edges: withEntities.edges,
    });

    return {
      usedAI: false,
      fallbackReason: 'no_ai_config',
      assistantMessage: `No AI key configured. Set OPENROUTER_API_KEY (or enable ALLOW_CLIENT_API_KEYS) to generate live artifacts.`,
      tape: baseTape,
      nodes: coherent.nodes,
      edges: coherent.edges,
      clusters: [
        {
          id: 'c1',
          title: 'Needs AI key',
          summary: 'Configure an AI key to generate narratives, map edges, and structured tape items.',
          momentum: 'steady',
          evidenceIds: evidence.slice(0, 2).map((e) => e.id),
          related: [topic.toUpperCase().slice(0, 8)],
        },
      ],
    };
  }

  const promptEvidence = evidence.slice(0, mode === 'fast' ? 8 : 12);
  const excerptLimit = mode === 'fast' ? 220 : 380;
  const evidenceSlim = promptEvidence.map((e) => ({
    id: e.id,
    title: e.title,
    url: e.url,
    source: e.source,
    excerptSource: e.excerptSource || 'serp',
    excerpt: (e.excerpt || '').slice(0, excerptLimit),
    aiSummary: e.aiSummary
      ? {
          bullets: e.aiSummary.bullets.slice(0, 4),
          entities: (e.aiSummary.entities || []).slice(0, 10),
          catalysts: (e.aiSummary.catalysts || []).slice(0, 8),
          sentiment: e.aiSummary.sentiment,
          confidence: e.aiSummary.confidence,
        }
      : undefined,
  }));

  const fallbackFromEvidence = (reason: string) => {
    const startedAt = Date.now();
    const tape: TapeItem[] = evidence.slice(0, 10).map((ev, idx) => ({
      id: `t${idx + 1}`,
      title: ev.title,
      source: ev.source,
      publishedAt: ev.publishedAt,
      tags: ['serp', 'needs-review'],
      evidenceId: ev.id,
    }));

    const seeded = ensureMinimumGraph({
      topic,
      evidence,
      nodes: [{ id: `n_${slugId(topic) || 'asset'}`, type: 'asset', label: topic.toUpperCase().slice(0, 12) }],
      edges: [],
    });
    const enriched = enrichGraphFromTapeAndEvidence({
      topic,
      evidence,
      tape,
      nodes: seeded.nodes,
      edges: seeded.edges,
    });
    const withEntities = enrichEntitiesFromEvidence({
      topic,
      evidence,
      nodes: enriched.nodes,
      edges: enriched.edges,
    });
    const coherent = enforceLinkCoherence({
      evidence,
      nodes: withEntities.nodes,
      edges: withEntities.edges,
    });

    const clusters: StoryCluster[] = [
      {
        id: 'c1',
        title: 'Fallback artifacts',
        summary: `AI artifact JSON failed validation (${truncateText(reason, 120)}). Showing a structured fallback map from SERP evidence; try Deep mode for richer extraction.`,
        momentum: 'steady',
        evidenceIds: evidence.slice(0, 6).map((e) => e.id),
        related: [truncateText(topic.toUpperCase(), 12)],
      },
    ];

    return {
      usedAI: false,
      fallbackReason: truncateText(reason, 220),
      assistantMessage: 'I hit an output-format issue upstream. I rendered a safe fallback graph; try Deep mode or ask a narrower question.',
      tape,
      nodes: coherent.nodes,
      edges: coherent.edges,
      clusters,
      startedAt,
    };
  };

  const artifactsPrompt = buildSignalTerminalArtifactsPrompt({ topic, evidence: evidenceSlim });

  let out: z.infer<typeof ArtifactsSchema>;
  try {
    out = await chatJson({
      config,
      schema: ArtifactsSchema,
      system: artifactsPrompt.system,
      user: artifactsPrompt.user,
      temperature: mode === 'fast' ? 0.1 : 0.25,
      telemetry: { tag: 'artifacts', onUsage: onAiUsage },
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const repairPrompt = buildSignalTerminalArtifactsRepairPrompt({
      baseSystem: artifactsPrompt.system,
      baseUser: artifactsPrompt.user,
      validationErrors: err,
    });
    const likelyFormatIssue = /did not return valid json|json schema mismatch/i.test(err);
    const shouldRetryRepair = mode === 'deep' || likelyFormatIssue;

    if (!shouldRetryRepair) {
      const fallback = fallbackFromEvidence(err);
      return {
        usedAI: fallback.usedAI,
        fallbackReason: fallback.fallbackReason,
        assistantMessage: fallback.assistantMessage,
        tape: fallback.tape,
        nodes: fallback.nodes,
        edges: fallback.edges,
        clusters: fallback.clusters,
      };
    }

    try {
      out = await chatJson({
        config,
        schema: ArtifactsSchema,
        system: repairPrompt.system,
        user: repairPrompt.user,
        temperature: 0,
        telemetry: { tag: mode === 'fast' ? 'artifacts.repair.fast' : 'artifacts.repair', onUsage: onAiUsage },
      });
    } catch (e2) {
      const err2 = e2 instanceof Error ? e2.message : String(e2);
      const fallback = fallbackFromEvidence(err2 || err);
      return {
        usedAI: fallback.usedAI,
        fallbackReason: fallback.fallbackReason,
        assistantMessage: fallback.assistantMessage,
        tape: fallback.tape,
        nodes: fallback.nodes,
        edges: fallback.edges,
        clusters: fallback.clusters,
      };
    }
  }

  const evidenceIds = new Set(evidence.map((e) => e.id));
  const evidenceById = new Map<string, EvidenceItem>();
  for (const ev of evidence) evidenceById.set(ev.id, ev);
  const nodes: GraphNode[] = out.nodes.slice(0, 24).map((n) => {
    const normalizedType = normalizeNodeTypeByLabel(n.type, n.label);
    const max =
      normalizedType === 'asset' ? 14 : normalizedType === 'source' ? 22 : normalizedType === 'event' ? 28 : 20;
    return { ...n, type: normalizedType, label: truncateText(n.label, max) };
  });
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: GraphEdge[] = out.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      ...e,
      evidenceIds: e.evidenceIds.filter((id) => evidenceIds.has(id)).slice(0, 6),
      confidence: Math.max(0, Math.min(1, e.confidence)),
      rationale: typeof e.rationale === 'string' ? truncateText(e.rationale, 160) : undefined,
    }))
    .filter((e) => e.from !== e.to)
    .filter((e) => e.evidenceIds.length > 0)
    .slice(0, 36);

  const tape: TapeItem[] = out.tape
    .filter((t) => evidenceIds.has(t.evidenceId))
    .slice(0, 12)
    .map((t, idx) => ({
      id: `t${idx + 1}`,
      title: t.title,
      source: t.source,
      publishedAt:
        evidenceById.get(t.evidenceId)?.publishedAt ??
        (Number.isFinite(t.publishedAt) ? (t.publishedAt as number) : startedAt),
      tags: t.tags.slice(0, 6),
      evidenceId: t.evidenceId,
    }));

  const clusters: StoryCluster[] = out.clusters.slice(0, 5).map((c, idx) => ({
    id: `c${idx + 1}`,
    title: c.title,
    summary: c.summary,
    momentum: c.momentum,
    evidenceIds: c.evidenceIds.filter((id) => evidenceIds.has(id)).slice(0, 8),
    related: Array.from(new Set(c.related.map((r) => truncateText(r, 12)).filter(Boolean))).slice(0, 8),
  }));

  const seeded = ensureMinimumGraph({ topic, evidence, nodes, edges });
  const enriched = enrichGraphFromTapeAndEvidence({
    topic,
    evidence,
    tape,
    nodes: seeded.nodes,
    edges: seeded.edges,
  });
  const withEntities = enrichEntitiesFromEvidence({ topic, evidence, nodes: enriched.nodes, edges: enriched.edges });
  const coherent = enforceLinkCoherence({
    evidence,
    nodes: withEntities.nodes,
    edges: withEntities.edges,
  });
  return {
    usedAI: true,
    assistantMessage: out.assistantMessage,
    tape,
    nodes: coherent.nodes,
    edges: coherent.edges,
    clusters,
  };
}

const GraphExpansionSchema = z.object({
  addNodes: z
    .array(
      z.object({
        id: z.string().min(2).max(40),
        type: z.preprocess((v) => {
          const raw = typeof v === 'string' ? v.toLowerCase().trim() : '';
          if (raw === 'asset' || raw === 'ticker' || raw === 'symbol') return 'asset';
          if (raw === 'event' || raw === 'headline' || raw === 'catalyst') return 'event';
          if (raw === 'source' || raw === 'publisher' || raw === 'site') return 'source';
          if (raw === 'entity' || raw === 'person' || raw === 'org' || raw === 'organization') return 'entity';
          return 'entity';
        }, z.enum(['asset', 'event', 'entity', 'source'])),
        label: z.string().min(1).max(80),
      }),
    )
    .max(10),
  addEdges: z
    .array(
      z.object({
        id: z.string().min(2).max(40),
        from: z.string().min(2).max(40),
        to: z.string().min(2).max(40),
        type: z.preprocess((v) => {
          const raw = typeof v === 'string' ? v.toLowerCase().trim() : '';
          if (raw === 'mentions' || raw === 'cites' || raw === 'source') return 'mentions';
          if (raw === 'co_moves' || raw === 'correlates' || raw === 'correlation') return 'co_moves';
          if (raw === 'same_story' || raw === 'related' || raw === 'linked') return 'same_story';
          if (raw === 'hypothesis' || raw === 'impact' || raw === 'causes') return 'hypothesis';
          return 'hypothesis';
        }, z.enum(['mentions', 'co_moves', 'hypothesis', 'same_story'])),
        confidence: z.number().min(0).max(1),
        evidenceIds: z.preprocess(
          (v) => (Array.isArray(v) ? v.slice(0, 6) : v),
          z.array(z.string().min(3)).max(6),
        ),
        rationale: z.string().min(6).max(180).optional(),
      }),
    )
    .max(16),
});

function shouldExpandImpact({
  topic,
  question,
  evidence,
  nodes,
  edges,
}: {
  topic: string;
  question?: string;
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const densityLow = nodes.length < 12 || edges.length < 10;
  const hay = [
    topic,
    question || '',
    ...evidence.map((e) =>
      [
        e.title,
        e.source,
        e.excerpt || '',
        (e.aiSummary?.entities || []).join(' '),
        (e.aiSummary?.catalysts || []).join(' '),
      ].join(' '),
    ),
  ]
    .join('\n')
    .toLowerCase();

  const macroSignal =
    /(gold|xau|dxy|dollar|rates?|yield|treasury|cpi|inflation|etf|oil|wti|brent|miners?|mstr|microstrategy|nasdaq|equities?|spx|s\\&p)/.test(
      hay,
    );

  if (!macroSignal && !densityLow) return false;

  const assetCount = nodes.filter((n) => n.type === 'asset').length;
  const crossCount = edges.filter((e) => e.type === 'co_moves' || e.type === 'hypothesis').length;
  if (macroSignal && (assetCount < 2 || crossCount < 2)) return true;
  return densityLow;
}

async function expandGraphImpact({
  topic,
  question,
  evidence,
  nodes,
  edges,
  model,
  apiKey,
  onAiUsage,
}: {
  topic: string;
  question?: string;
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  model?: string;
  apiKey?: string;
  onAiUsage?: (u: {
    model: string;
    tag?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }) => void;
}): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] } | null> {
  if (!shouldExpandImpact({ topic, question, evidence, nodes, edges })) return null;

  const canUseClientKey = env.ai.allowClientApiKeys;
  const keyOverride = canUseClientKey ? apiKey : undefined;
  const stageModel = env.ai.openrouter.modelArtifacts;
  const config = getAIConfig({ apiKeyOverride: keyOverride, modelOverride: model || stageModel || undefined });
  if (!config) return null;

  const evidenceCompact = evidence.slice(0, 12).map((e) => ({
    id: e.id,
    title: e.title,
    source: e.source,
    excerpt: truncateText(e.excerpt || '', 240),
    aiSummary: e.aiSummary
      ? {
          bullets: e.aiSummary.bullets.slice(0, 4),
          entities: (e.aiSummary.entities || []).slice(0, 10),
          catalysts: (e.aiSummary.catalysts || []).slice(0, 8),
          sentiment: e.aiSummary.sentiment,
          confidence: e.aiSummary.confidence,
        }
      : undefined,
  }));

  const impactPrompt = buildSignalTerminalImpactPrompt({
    topic,
    question,
    existingGraph: { nodes: nodes.slice(0, 26), edges: edges.slice(0, 40) },
    evidence: evidenceCompact,
  });

  let out: z.infer<typeof GraphExpansionSchema>;
  try {
    out = await chatJson({
      config,
      schema: GraphExpansionSchema,
      system: impactPrompt.system,
      user: impactPrompt.user,
      temperature: 0.15,
      telemetry: { tag: 'impact', onUsage: onAiUsage },
    });
  } catch {
    return null;
  }

  const evidenceIds = new Set(evidence.map((e) => e.id));
  const mergedNodes: GraphNode[] = [...nodes];
  const nodeIds = new Set(mergedNodes.map((n) => n.id));

  for (const n of out.addNodes) {
    if (mergedNodes.length >= 26) break;
    if (!n?.id || nodeIds.has(n.id)) continue;
    const normalizedType = normalizeNodeTypeByLabel(n.type, n.label);
    mergedNodes.push({ id: n.id, type: normalizedType, label: truncateText(n.label, 32) });
    nodeIds.add(n.id);
  }

  const mergedEdges: GraphEdge[] = [...edges];
  const edgeIds = new Set(mergedEdges.map((e) => e.id));
  const edgeKeys = new Set(mergedEdges.map((e) => `${e.from}|${e.to}|${e.type}`));

  for (const e of out.addEdges) {
    if (mergedEdges.length >= 40) break;
    if (!e?.id || edgeIds.has(e.id)) continue;
    if (e.from === e.to) continue;
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    const key = `${e.from}|${e.to}|${e.type}`;
    if (edgeKeys.has(key)) continue;
    const eids = Array.from(new Set(e.evidenceIds)).filter((id) => evidenceIds.has(id)).slice(0, 6);
    if (!eids.length) continue;

    mergedEdges.push({
      id: e.id,
      from: e.from,
      to: e.to,
      type: e.type,
      confidence: Math.max(0, Math.min(1, e.confidence)),
      evidenceIds: eids,
      rationale: typeof e.rationale === 'string' ? truncateText(e.rationale, 160) : undefined,
    });
    edgeIds.add(e.id);
    edgeKeys.add(key);
  }

  const seeded = ensureMinimumGraph({ topic, evidence, nodes: mergedNodes, edges: mergedEdges });
  const connected = enrichGraphFromTapeAndEvidence({
    topic,
    evidence,
    tape: [],
    nodes: seeded.nodes,
    edges: seeded.edges,
  });
  const withEntities = enrichEntitiesFromEvidence({ topic, evidence, nodes: connected.nodes, edges: connected.edges });
  return enforceLinkCoherence({
    evidence,
    nodes: withEntities.nodes,
    edges: withEntities.edges,
  });
}

export async function POST(request: Request) {
  // Orchestrates the end-to-end run and streams incremental SSE updates to the frontend.
  const reqId = crypto.randomUUID();
  const startedAt = Date.now();
  const log = createLogger({ reqId, route: '/api/run' });

  let body: z.infer<typeof RunRequestSchema>;
  try {
    body = RunRequestSchema.parse(await request.json());
  } catch {
    log.warn('run.bad_request', { ms: Date.now() - startedAt });
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const sessionId = crypto.randomUUID();
  const provider = 'openrouter' as const;
  const signal = request.signal;
  const serpFormat = body.serpFormat || 'light';

  log.info('run.request', {
    sessionId,
    topic: body.topic.slice(0, 120),
    mode: body.mode,
    provider,
    serpFormat,
    hasBrightData: hasBrightData(),
    hasDb: hasDb(),
  });

  const dbReady = hasDb();

  if (dbReady) {
    try {
      await createSession(
        sessionId,
        body.topic,
        'running',
        'plan',
        0.05,
        { mode: body.mode, provider, model: body.model || null },
      );
      log.info('run.db.session_inserted', { sessionId });
    } catch {
      // ignore; still stream
      log.warn('run.db.session_insert_failed', { sessionId });
    }
  }

  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const persistEvent = (type: string, payload: unknown) => {
        if (!dbReady) return;
        void insertEvent(sessionId, type, payload)
          .catch((e: any) => log.debug('run.db.event_insert_failed', { sessionId, type, error: String(e) }));
      };

      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        persistEvent(event, data);
      };

      const diag = (stage: string, details: Record<string, unknown> = {}) => {
        const payload = { stage, ts: Date.now(), ...details };
        send('diag', payload);
        log.info('run.diag', { sessionId, ...payload });
      };

      const emitAiUsage = (u: {
        model: string;
        tag?: string;
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }) => {
        // Keep it safe for storage: no prompt content, just counters.
        const payload = {
          model: u.model,
          tag: u.tag || 'ai',
          prompt_tokens: u.prompt_tokens ?? 0,
          completion_tokens: u.completion_tokens ?? 0,
          total_tokens: u.total_tokens ?? 0,
        };
        send('ai.usage', payload);
        log.info('run.ai.usage', { sessionId, ...payload });
      };

      const updateSession = async (step: PipelineStep, progress: number, meta?: Record<string, unknown>) => {
        if (!dbReady) return;
        try {
          await dbUpdateStep(sessionId, step, progress, meta);
        } catch {
          // ignore
        }
      };

      // Lightweight run-level telemetry:
      // - emits granular `perf.mark` events into session_events
      // - emits one `perf.summary` at the end
      // This is intentionally temporary/simple so we can diagnose bottlenecks quickly.
      const perfMarks: PerfMark[] = [];
      const stepDurationsMs: Partial<Record<PipelineStep, number>> = {};
      const apiTotals = new Map<string, { count: number; ms: number; failures: number }>();
      let activeStep: { step: PipelineStep; startedAt: number } | null = null;

      const recordPerfMark = (mark: PerfMark) => {
        perfMarks.push(mark);
        if (perfMarks.length > 800) perfMarks.shift();

        if (mark.phase === 'api') {
          const prev = apiTotals.get(mark.name) || { count: 0, ms: 0, failures: 0 };
          prev.count += 1;
          prev.ms += mark.ms;
          if (!mark.ok) prev.failures += 1;
          apiTotals.set(mark.name, prev);
        }

        send('perf.mark', mark);
      };

      // Wrap any awaited task (API or stage) and capture elapsed time + failure state.
      const timed = async <T>(
        phase: PerfMark['phase'],
        name: string,
        details: Record<string, unknown>,
        fn: () => Promise<T>,
      ): Promise<T> => {
        const markStartedAt = Date.now();
        try {
          const out = await fn();
          recordPerfMark({
            phase,
            name,
            startedAt: markStartedAt,
            endedAt: Date.now(),
            ms: Date.now() - markStartedAt,
            ok: true,
            details,
          });
          return out;
        } catch (e) {
          recordPerfMark({
            phase,
            name,
            startedAt: markStartedAt,
            endedAt: Date.now(),
            ms: Date.now() - markStartedAt,
            ok: false,
            details: { ...details, error: safeErrorText(e) },
          });
          throw e;
        }
      };

      // Step tracker:
      // We close the previous step when a new one starts, so `stepDurationsMs`
      // reflects time spent "between step transitions" (what the UI shows as step bars).
      const emitStep = async (step: PipelineStep, progress: number, meta?: Record<string, unknown>) => {
        const nowTs = Date.now();
        if (activeStep) {
          const elapsed = Math.max(0, nowTs - activeStep.startedAt);
          stepDurationsMs[activeStep.step] = (stepDurationsMs[activeStep.step] || 0) + elapsed;
          recordPerfMark({
            phase: 'step',
            name: activeStep.step,
            startedAt: activeStep.startedAt,
            endedAt: nowTs,
            ms: elapsed,
            ok: true,
            details: { nextStep: step },
          });
        }

        activeStep = { step, startedAt: nowTs };
        await updateSession(step, progress, meta);
        send('step', { step, progress });
      };

      const finalizePerfSummary = (status: 'ready' | 'error') => {
        const endedAt = Date.now();
        if (activeStep) {
          const elapsed = Math.max(0, endedAt - activeStep.startedAt);
          stepDurationsMs[activeStep.step] = (stepDurationsMs[activeStep.step] || 0) + elapsed;
          recordPerfMark({
            phase: 'step',
            name: activeStep.step,
            startedAt: activeStep.startedAt,
            endedAt,
            ms: elapsed,
            ok: true,
            details: { terminalState: status },
          });
          activeStep = null;
        }

        const api = Array.from(apiTotals.entries())
          .map(([name, data]) => ({
            name,
            calls: data.count,
            totalMs: data.ms,
            avgMs: data.count ? Math.round(data.ms / data.count) : 0,
            failures: data.failures,
          }))
          .sort((a, b) => b.totalMs - a.totalMs);

        return {
          status,
          generatedAt: endedAt,
          totalMs: Math.max(0, endedAt - startedAt),
          stepDurationsMs,
          api,
          marksStored: perfMarks.length,
        };
      };

      send('session', {
        sessionId,
        topic: body.topic,
        startedAt,
        mode: body.mode,
        provider,
        hasBrightData: hasBrightData(),
        hasDb: hasDb(),
      });
      diag('run.init', {
        topic: truncateText(body.topic, 120),
        mode: body.mode,
        provider,
        serpFormat,
        hasBrightData: hasBrightData(),
      });

      try {
        await emitStep('plan', 0.08);

        const planModel = selectStageModel({
          stage: 'plan',
          mode: body.mode,
          requestedModel: body.model,
        });
        diag('plan.model', { model: planModel || 'default' });

        const plan = await timed('api', 'ai.plan', { provider, mode: body.mode, model: planModel || 'default' }, () =>
          planQueries({
            topic: body.topic,
            question: body.question,
            model: planModel,
            apiKey: body.apiKey,
            onAiUsage: emitAiUsage,
          }),
        );
        if (!plan.usedAI && plan.reason) {
          const outputPreview = extractOutputPreviewFromReason(plan.reason);
          send('warn', {
            message: `Plan model returned invalid JSON; using deterministic fallback queries. (${truncateText(plan.reason, 160)})`,
          });
          send('plan.fallback', { reason: plan.reason, model: planModel || 'default', outputPreview });
          log.warn('run.plan.fallback', { sessionId, reason: plan.reason, model: planModel || 'default', outputPreview });
        }
        log.info('run.plan', { sessionId, usedAI: plan.usedAI, reason: plan.reason || null, queries: plan.queries.length });
        send('plan', plan);
        await emitStep('search', 0.18, { mode: body.mode, provider, model: body.model || null, plan });

        const queries = plan.queries.slice(0, body.mode === 'deep' ? 6 : 4);
        let serp: SerpResult[] = [];
        const serpResponseFormat =
          serpFormat === 'full'
            ? 'full_json_google'
            : serpFormat === 'markdown'
              ? 'markdown'
              : 'light_json_google';

        if (hasBrightData()) {
          const searchVertical: 'web' | 'news' = body.mode === 'deep' ? 'news' : 'web';
          const searchRecency: 'd' | 'w' = body.mode === 'deep' ? 'd' : 'w';
          // Important: this used to be a serial for-loop (sum of all query latencies).
          // Now we run query workers concurrently so search time trends toward the slowest query,
          // not N * query_time.
          const maxConcurrency = body.mode === 'deep' ? 3 : 4;
          let queryCursor = 0;
          diag('search.config', {
            queries: queries.length,
            maxConcurrency,
            vertical: searchVertical,
            recency: searchRecency,
            format: serpResponseFormat,
          });

          const runQuery = async (q: string) => {
            const queryStartedAt = Date.now();
            diag('search.query.start', { query: truncateText(q, 120), vertical: searchVertical, recency: searchRecency });
            try {
              // Bright Data SERP is remote/unlock-heavy; single calls can take tens of seconds.
              const results = await timed(
                'api',
                'brightdata.serp',
                {
                  query: truncateText(q, 120),
                  vertical: searchVertical,
                  recency: searchRecency,
                  format: serpResponseFormat,
                },
                () =>
                  brightDataSerpGoogle({
                    query: q,
                    format: serpResponseFormat,
                    vertical: searchVertical,
                    recency: searchRecency,
                  }),
              );
              let finalResults = results;
              let finalVertical: 'web' | 'news' = searchVertical;

              // Some SERP formats/verticals may return empty arrays (or parse differently).
              // For deep runs, fall back to the standard web vertical if news returns nothing,
              // so the pipeline never collapses to an empty evidence set.
              if (body.mode === 'deep' && finalVertical === 'news' && finalResults.length === 0) {
                try {
                  diag('search.query.fallback.start', { query: truncateText(q, 120), fromVertical: 'news', toVertical: 'web' });
                  const fallback = await timed(
                    'api',
                    'brightdata.serp.fallback',
                    {
                      query: truncateText(q, 120),
                      vertical: 'web',
                      recency: 'd',
                      format: serpResponseFormat,
                    },
                    () =>
                      brightDataSerpGoogle({
                        query: q,
                        format: serpResponseFormat,
                        vertical: 'web',
                        recency: 'd',
                      }),
                  );
                  if (fallback.length) {
                    finalResults = fallback;
                    finalVertical = 'web';
                    diag('search.query.fallback.hit', { query: truncateText(q, 120), fallbackResults: fallback.length });
                  }
                } catch {
                  // ignore; we already handle query failure below
                  diag('search.query.fallback.failed', { query: truncateText(q, 120) });
                }
              }

              serp = serp.concat(finalResults);
              const partialPicked = pickSerpDiverse(serp, body.mode === 'deep' ? 14 : 12).map((r) => ({
                title: r.title || r.url,
                url: r.url,
                snippet: r.snippet,
              }));
              send('search.partial', {
                query: q,
                added: finalResults.length,
                found: serp.length,
                picked: partialPicked,
                vertical: finalVertical,
              });
              diag('search.query.done', {
                query: truncateText(q, 120),
                vertical: finalVertical,
                added: finalResults.length,
                cumulative: serp.length,
                ms: Date.now() - queryStartedAt,
              });
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              const status = parseStatusFromBrightDataErrorMessage(message);
              const statusLabel = status ? ` (${status})` : '';
              log.warn('run.search.query_failed', { sessionId, query: q.slice(0, 160), message: message.slice(0, 320) });
              send('warn', { message: `Search query failed${statusLabel}; continuing with partial results.`, query: q });
              diag('search.query.failed', {
                query: truncateText(q, 120),
                status: status || null,
                message: truncateText(message, 220),
                ms: Date.now() - queryStartedAt,
              });
            }
          };

          const workers = Array.from({ length: Math.min(maxConcurrency, queries.length) }, async () => {
            while (true) {
              if (signal.aborted) throw new Error('aborted');
              // Pull the next query index synchronously before awaiting.
              const idx = queryCursor;
              queryCursor += 1;
              if (idx >= queries.length) return;
              const q = queries[idx];
              if (!q) return;
              await runQuery(q);
            }
          });
          await Promise.all(workers);

          log.info('run.search', { sessionId, queries: queries.length, serp: serp.length });
        } else {
          send('warn', { message: 'BRIGHTDATA_API_TOKEN is not set. Search/scrape steps will be limited.' });
          log.warn('run.search.no_brightdata', { sessionId, queries: queries.length });
        }

        if (!serp.length) {
          send('warn', { message: 'No SERP results collected. Check Bright Data zones/tokens, then re-run.' });
        }

        const picked = pickSerpDiverse(serp, body.mode === 'deep' ? 14 : 12);
        const pickedDomains = Array.from(new Set(picked.map((r) => domainFromUrl(r.url)))).slice(0, 14);
        log.info('run.search.picked', { sessionId, picked: picked.length, domains: pickedDomains });
        send('search', { queries, results: picked });
        if (body.mode === 'deep') {
          await emitStep('scrape', 0.34);
        } else {
          await updateSession('extract', 0.34);
        }

        let evidence = await timed('stage', 'evidence.build', { mode: body.mode, picked: picked.length }, () =>
          buildEvidenceHybrid({
            results: picked,
            startedAt,
            mode: body.mode,
            signal,
            onScrape: body.mode === 'deep' ? (evt) => send('scrape.page', evt) : undefined,
            onScrapeTiming:
              body.mode === 'deep'
                ? (evt) =>
                    recordPerfMark({
                      phase: 'api',
                      name: 'brightdata.markdown',
                      startedAt: Date.now() - evt.ms,
                      endedAt: Date.now(),
                      ms: evt.ms,
                      ok: evt.ok,
                      details: { url: truncateText(evt.url, 220), domain: domainFromUrl(evt.url) },
                    })
                : undefined,
          }),
        );
        const scrapeMeta = (evidence as any)._scrape as { attempted?: number; failures?: number; firstFailure?: string; concurrency?: number } | undefined;
        diag('evidence.built', {
          mode: body.mode,
          evidence: evidence.length,
          scrapeAttempted: scrapeMeta?.attempted || 0,
          scrapeFailures: scrapeMeta?.failures || 0,
          scrapeConcurrency: scrapeMeta?.concurrency || 0,
        });
        if (body.mode === 'deep' && scrapeMeta?.attempted) {
          if ((scrapeMeta.failures || 0) > 0) {
            send('warn', {
              message: `Deep scrape: ${scrapeMeta.failures}/${scrapeMeta.attempted} pages failed; using SERP excerpts where needed.`,
            });
          }
          diag('scrape.summary', {
            attempted: scrapeMeta.attempted || 0,
            failures: scrapeMeta.failures || 0,
            concurrency: scrapeMeta.concurrency || 0,
            firstFailure: scrapeMeta.firstFailure ? truncateText(scrapeMeta.firstFailure, 160) : null,
          });
        }

        const maxAgeDays = body.mode === 'deep' ? 60 : 180;
        const filtered = filterStaleEvidence(evidence, startedAt, maxAgeDays);
        if (filtered.dropped > 0 && filtered.keep.length >= Math.min(8, evidence.length)) {
          evidence = filtered.keep;
          send('warn', { message: `Filtered ${filtered.dropped} stale results older than ~${maxAgeDays}d.` });
        }

        let evidenceWithSummaries = evidence;
        if (body.mode === 'deep') {
          const summariesModel = selectStageModel({
            stage: 'summaries',
            mode: body.mode,
            requestedModel: body.model,
          });
          evidenceWithSummaries = await timed(
            'api',
            'ai.summaries',
            { provider, evidence: evidence.length, model: summariesModel || 'default' },
            () =>
            summarizeEvidence({
              topic: body.topic,
              evidence,
              model: summariesModel,
              apiKey: body.apiKey,
              onAiUsage: emitAiUsage,
            }),
          );
          send('summaries', {
            items: evidenceWithSummaries
              .filter((e) => Boolean(e.aiSummary?.bullets?.length))
              .map((e) => ({ id: e.id, ...e.aiSummary })),
          });
          diag('summaries.done', {
            model: summariesModel || 'default',
            withSummaries: evidenceWithSummaries.filter((e) => Boolean(e.aiSummary?.bullets?.length)).length,
          });
        }

        const evidenceSources = Array.from(new Set(evidenceWithSummaries.map((e) => e.source))).slice(0, 14);
        log.info('run.evidence', { sessionId, items: evidenceWithSummaries.length, mode: body.mode, sources: evidenceSources });
        send('evidence', { items: evidenceWithSummaries });
        await emitStep('extract', 0.55);

        await emitStep('link', 0.72);

        const artifactsModel = selectStageModel({
          stage: 'artifacts',
          mode: body.mode,
          requestedModel: body.model,
        });

        const artifacts = await timed(
          'api',
          'ai.artifacts',
          { provider, evidence: evidenceWithSummaries.length, model: artifactsModel || 'default' },
          () =>
          buildArtifacts({
            topic: body.topic,
            evidence: evidenceWithSummaries,
            mode: body.mode,
            model: artifactsModel,
            apiKey: body.apiKey,
            onAiUsage: emitAiUsage,
          }),
        );
        if (!artifacts.usedAI) {
          const reasonFull = artifacts.fallbackReason || 'model JSON/format issue';
          const reason = truncateText(reasonFull, 180);
          const outputPreview = extractOutputPreviewFromReason(reasonFull);
          send('warn', { message: `Artifact generation used fallback map output (${reason}).` });
          send('artifacts.fallback', { mode: body.mode, provider, model: artifactsModel || 'default', reason: reasonFull, outputPreview });
          diag('artifacts.fallback', {
            mode: body.mode,
            provider,
            model: artifactsModel || 'default',
            reason: truncateText(reasonFull, 220),
            outputPreview,
          });
        }
        const nodeTypes = artifacts.nodes.reduce<Record<string, number>>((acc, n) => {
          acc[n.type] = (acc[n.type] || 0) + 1;
          return acc;
        }, {});
        log.info('run.artifacts', {
          sessionId,
          usedAI: artifacts.usedAI,
          tape: artifacts.tape.length,
          nodes: artifacts.nodes.length,
          edges: artifacts.edges.length,
          clusters: artifacts.clusters.length,
          nodeTypes,
        });

        // Stream the first map immediately after linking so the UI feels live.
        send('tape', { items: artifacts.tape });
        send('graph', { nodes: artifacts.nodes, edges: artifacts.edges, variant: 'initial' });

        let finalNodes = artifacts.nodes;
        let finalEdges = artifacts.edges;

        if (body.mode === 'deep') {
          const expanded = await timed(
            'api',
            'ai.impact',
            { provider, mode: body.mode, model: artifactsModel || 'default' },
            () =>
            expandGraphImpact({
              topic: body.topic,
              question: body.question,
              evidence: evidenceWithSummaries,
              nodes: artifacts.nodes,
              edges: artifacts.edges,
              model: artifactsModel,
              apiKey: body.apiKey,
              onAiUsage: emitAiUsage,
            }),
          );

          if (expanded && (expanded.nodes.length !== artifacts.nodes.length || expanded.edges.length !== artifacts.edges.length)) {
            finalNodes = expanded.nodes;
            finalEdges = expanded.edges;
            send('graph', { nodes: finalNodes, edges: finalEdges, variant: 'expanded' });
            diag('impact.expanded', { nodes: finalNodes.length, edges: finalEdges.length });
          } else {
            diag('impact.no_change', { nodes: artifacts.nodes.length, edges: artifacts.edges.length });
          }
        }

        await emitStep('cluster', 0.86);

        send('clusters', { items: artifacts.clusters });
        await emitStep('render', 0.94);
        if (artifacts.assistantMessage) send('message', { role: 'assistant', content: artifacts.assistantMessage });

        const readyMeta = {
          mode: body.mode,
          provider,
          model: body.model || null,
          plan,
          selectedUrls: picked.slice(0, 10).map((r) => r.url),
          artifacts: {
            evidence: evidenceWithSummaries,
            tape: artifacts.tape,
            nodes: finalNodes,
            edges: finalEdges,
            clusters: artifacts.clusters,
            price: null,
            videos: null,
          },
        };
        await emitStep('ready', 1, readyMeta);

        if (dbReady) {
          await updateStatus(sessionId, 'ready').catch(() => {});
        }

        const perfSummary = finalizePerfSummary('ready');
        send('perf.summary', perfSummary);
        await updateSession('ready', 1, { ...readyMeta, perf: perfSummary });

        send('done', { sessionId });
        diag('run.complete', { totalMs: perfSummary.totalMs, status: 'ready' });
        log.info('run.done', { sessionId, ms: Date.now() - startedAt, perf: perfSummary });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        const perfSummary = finalizePerfSummary('error');
        send('perf.summary', perfSummary);
        send('error', { message: msg });
        diag('run.error', { message: truncateText(msg, 220), totalMs: perfSummary.totalMs });
        log.error('run.error', { sessionId, message: msg, ms: Date.now() - startedAt, perf: perfSummary });
        if (dbReady) {
          await updateStatus(sessionId, 'error').catch(() => {});
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}
