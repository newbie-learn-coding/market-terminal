'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  Maximize2,
  Network,
  RefreshCw,
  Search,
  Send,
  Share,
  Sparkles,
  Video,
  X,
} from 'lucide-react';

import { cn, apiPath } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadRipple } from '@/components/ui/load-ripple';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';
import { EvidenceGraph } from '@/components/terminal/EvidenceGraph';
import { EvidenceFlow } from '@/components/terminal/EvidenceFlow';
import { EvidenceMindMap } from '@/components/terminal/EvidenceMindMap';
import { EvidenceTimeline, type TimelineItem } from '@/components/terminal/EvidenceTimeline';
import { EvidenceViewToggle, type EvidenceView } from '@/components/terminal/EvidenceViewToggle';
import type { GraphEdge, GraphNode } from '@/components/terminal/types';
import { PipelineTimeline, type PipelineStep, type PlanEvent, type SearchEvent } from '@/components/terminal/PipelineTimeline';
import { ActivityCard, type QueryQueueItem, type ScrapeQueueItem } from '@/components/terminal/ActivityCard';

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

type Session = {
  id: string;
  topic: string;
  startedAt: number;
  step: PipelineStep;
  progress: number;
  tape: TapeItem[];
  clusters: StoryCluster[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidence: EvidenceItem[];
  series: number[];
  seriesTs: number[];
  videosSnapshot?: VideosResponse | null;
  priceSnapshot?: PriceResponse | null;
  snapshotMode?: boolean;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

type VideoItem = {
  id: string;
  title: string;
  url: string;
  channel: string;
  thumbnail: string;
  provider: 'YouTube';
};

type VideosResponse = {
  topic: string;
  fetchedAt: number;
  mode: 'brightdata' | 'mock';
  items: VideoItem[];
  error?: string;
};

type PriceResponse = {
  ok: boolean;
  topic: string;
  symbol?: string;
  provider: string;
  fetchedAt: number;
  series: number[];
  timestamps: number[];
  last?: number | null;
  error?: string;
};

type TraceEventRow = {
  id: number;
  created_at: string;
  type: string;
  payload: any;
};

type TraceResponse = {
  session: {
    id: string;
    created_at: string;
    topic: string;
    status: string;
    step: string;
    progress: number;
    meta: any;
  };
  events: TraceEventRow[];
};

type SessionSnapshotArtifacts = {
  evidence?: EvidenceItem[];
  tape?: TapeItem[];
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  clusters?: StoryCluster[];
  price?: PriceResponse | null;
  videos?: VideosResponse | null;
};

type SessionSnapshotMeta = {
  mode?: 'fast' | 'deep';
  provider?: string;
  model?: string;
  plan?: PlanEvent;
  selectedUrls?: string[];
  artifacts?: SessionSnapshotArtifacts;
};

type SessionsListItem = {
  id: string;
  status?: string;
};

type SessionsListResponse = {
  sessions?: SessionsListItem[];
};

type ReferenceToken =
  | { kind: 'node'; id: string }
  | { kind: 'evidence'; id: string }
  | { kind: 'tag'; id: string };

const STEP_LABEL: Record<PipelineStep, string> = {
  idle: 'Waiting',
  plan: 'Planning',
  search: 'Searching',
  scrape: 'Scraping',
  extract: 'Extracting',
  link: 'Linking',
  cluster: 'Clustering',
  render: 'Rendering',
  ready: 'Ready',
};

const CHAT_SUGGESTIONS = [
  'What is moving Bitcoin today?',
  'Is Bitcoin related to gold or DXY today?',
  'NVDA headline map and spillovers',
  'Oil: what changed since market open?',
  'Show competing explanations for the last 2 hours',
  'What should I watch next for BTC risk?',
] as const;

const TOPIC_TYPED_EXAMPLES = [
  'Why is BTC down today? Map catalysts in the last 6 hours.',
  'NVDA move after earnings: what are the strongest evidence links?',
  'Oil, DXY, and rates: what changed since market open?',
  'Gold vs Bitcoin today: show competing explanations with sources.',
  'Show macro headlines driving crypto sentiment right now.',
] as const;

const TOPIC_QUICK_STARTS = [
  'Bitcoin move today',
  'NVDA post-earnings impact',
  'DXY and crypto correlation',
  'Oil shock and equities',
] as const;

type PriceScaleMode = 'price' | 'indexed';

const PRICE_COMPARE_PRESETS = [
  { label: 'BTC', topic: 'Bitcoin' },
  { label: 'ETH', topic: 'Ethereum' },
  { label: 'SOL', topic: 'Solana' },
  { label: 'XAU', topic: 'Gold' },
] as const;

const LAST_ACTIVE_SESSION_KEY = 'market_terminal:last_session_id';

const now = () => Date.now();

function normalizeTopicKey(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return '';
  if (/\b(btc|bitcoin)\b/.test(s)) return 'bitcoin';
  if (/\b(eth|ethereum)\b/.test(s)) return 'ethereum';
  if (/\b(sol|solana)\b/.test(s)) return 'solana';
  if (/\b(xau|gold)\b/.test(s)) return 'gold';
  if (/\b(wti|brent|oil)\b/.test(s)) return 'oil';
  if (/\b(dxy|dollar index)\b/.test(s)) return 'dxy';
  return s;
}

function tradingViewSymbolForTopic(topic: string): string {
  const key = normalizeTopicKey(topic);
  if (key === 'bitcoin') return 'BITSTAMP:BTCUSD';
  if (key === 'ethereum') return 'BITSTAMP:ETHUSD';
  if (key === 'solana') return 'BINANCE:SOLUSDT';
  if (key === 'gold') return 'OANDA:XAUUSD';
  if (key === 'oil') return 'TVC:USOIL';
  if (key === 'dxy') return 'TVC:DXY';

  const ticker = topic.trim().match(/\$?([A-Za-z]{1,10})\b/)?.[1];
  if (ticker) return ticker.toUpperCase();
  return topic.trim().toUpperCase().replace(/\s+/g, '');
}

function buildExternalChartLinks(topic: string) {
  const clean = topic.trim();
  const tvSymbol = tradingViewSymbolForTopic(clean);
  return {
    tradingView: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`,
    google: `https://www.google.com/search?q=${encodeURIComponent(`${clean} price chart`)}`,
  };
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toneForTag(tag: string): 'neutral' | 'blue' | 'orange' | 'teal' {
  const t = String(tag || '').toLowerCase();
  if (!t) return 'neutral';
  if (/(fed|rates?|yield|treasury|cpi|inflation|macro|dxy|dollar|gold|xau|oil|wti|brent)/.test(t)) return 'blue';
  if (/(etf|sec|regulat|lawsuit|policy|approval|ban|sanction)/.test(t)) return 'orange';
  if (/(flow|liquidity|volume|derivatives|funding|miners?|spillover|correlat|co[_-]?move)/.test(t)) return 'teal';
  if (/(rumou?r|unverified|speculation)/.test(t)) return 'orange';
  return 'neutral';
}

function sanitizeExcerpt(raw: string) {
  let s = String(raw || '').trim();
  if (!s) return '';

  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/```[\s\S]*?```/g, '\n');
  s = s.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');
  s = s.replace(/\[([^\]]{0,220})]\(([^)]+)\)/g, (_, label) => String(label || '').trim());
  s = s.replace(/\[\s*]\([^)]+\)/g, ' ');
  s = s.replace(/[*_`>#]/g, ' ');

  s = s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  const best =
    lines.find((l) => l.length >= 90 && /[.!?]/.test(l)) ||
    lines.find((l) => l.length >= 140) ||
    lines[0] ||
    '';
  return best.replace(/\s+/g, ' ').trim();
}

function normalizeToken(raw: string) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(raw: string) {
  const s = normalizeToken(raw);
  if (!s) return [];
  return s.split(/\s+/).filter((t) => t.length > 2);
}

function overlapScore(a: string, b: string) {
  const aa = new Set(tokenize(a));
  const bb = tokenize(b);
  if (!aa.size || !bb.length) return 0;
  let hit = 0;
  for (const t of bb) {
    if (aa.has(t)) hit += 1;
  }
  return hit / Math.max(1, Math.min(aa.size, bb.length));
}

function parseReferenceTokens(content: string): ReferenceToken[] {
  const out: ReferenceToken[] = [];
  const re = /\[([^\]]{1,64})\]/g;
  for (let m = re.exec(content); m; m = re.exec(content)) {
    const token = (m[1] || '').trim();
    if (!token) continue;
    if (/^ev_[a-z0-9_:-]+$/i.test(token)) out.push({ kind: 'evidence', id: token });
    else if (/^n_[a-z0-9_:-]+$/i.test(token)) out.push({ kind: 'node', id: token });
    else if (/^[a-z][a-z0-9_-]{1,30}$/i.test(token)) out.push({ kind: 'tag', id: token });
  }
  return out;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      el.style.top = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

function buildMediaGraph({
  topic,
  videos,
  evidence,
  baseNodes,
}: {
  topic: string;
  videos: VideosResponse | null;
  evidence: EvidenceItem[];
  baseNodes: GraphNode[];
}): { mediaNodes: GraphNode[]; mediaEdges: GraphEdge[] } {
  const items = videos?.items || [];
  if (!items.length || !evidence.length) return { mediaNodes: [], mediaEdges: [] };

  const assetId =
    baseNodes.find((n) => n.type === 'asset')?.id ||
    `n_${topic.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'asset'}`;

  const mediaNodes: GraphNode[] = [];
  const mediaEdges: GraphEdge[] = [];

  for (const v of items.slice(0, 8)) {
    const nodeId = `n_media_${String(v.id || '').slice(0, 20)}`;
    mediaNodes.push({
      id: nodeId,
      type: 'media',
      label: v.title.slice(0, 42),
      meta: {
        provider: 'youtube',
        kind: 'video',
        url: v.url,
      },
    });

    const ranked = evidence
      .map((ev) => ({
        ev,
        score: Math.max(
          overlapScore(v.title, ev.title),
          overlapScore(v.title, ev.excerpt || ''),
          overlapScore(v.channel, ev.source),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    const linkedEvidence = ranked.filter((r) => r.score > 0).map((r) => r.ev.id);
    const fallbackEvidence = evidence[0]?.id ? [evidence[0].id] : [];
    const eids = linkedEvidence.length ? linkedEvidence : fallbackEvidence;

    mediaEdges.push({
      id: `e_media_${String(v.id || '').slice(0, 20)}_asset`,
      from: nodeId,
      to: assetId,
      type: 'same_story',
      confidence: linkedEvidence.length ? 0.44 : 0.2,
      evidenceIds: eids,
      rationale: linkedEvidence.length
        ? 'Video headline overlaps with evidence headlines.'
        : 'Related market video captured for this run.',
    });
  }

  return { mediaNodes, mediaEdges };
}

function uniqueTagsFromSession(session: Session | null): string[] {
  if (!session) return [];
  const tags = new Set<string>();
  for (const t of session.tape || []) {
    for (const raw of t.tags || []) {
      const v = String(raw || '').trim();
      if (v) tags.add(v);
    }
  }
  for (const e of session.evidence || []) {
    for (const raw of e.aiSummary?.catalysts || []) {
      const v = String(raw || '').trim();
      if (v) tags.add(v);
    }
  }
  return Array.from(tags).slice(0, 22);
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace('/', '');
      return id.length === 11 ? id : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && v.length === 11) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      const shortsIdx = parts.indexOf('shorts');
      if (shortsIdx >= 0) {
        const id = parts[shortsIdx + 1];
        return id?.length === 11 ? id : null;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function buildSeries(startAt: number): { y: number[]; t: number[] } {
  const points = 120; // 24h @ 12m
  const y: number[] = [];
  const t: number[] = [];
  let p = 100;
  for (let i = 0; i < points; i += 1) {
    const ts = startAt - (points - 1 - i) * 12 * 60_000;
    t.push(ts);
    const drift = Math.sin(i / 11) * 0.32 + Math.cos(i / 8) * 0.2;
    const noise = (Math.random() - 0.5) * 0.8;
    p = Math.max(74, Math.min(132, p + drift + noise));
    y.push(Number(p.toFixed(2)));
  }
  return { y, t };
}

function guessTopicFromQuery(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  const dollar = s.match(/\$([A-Za-z]{1,6})\b/)?.[1];
  if (dollar) return dollar.toUpperCase();

  const lower = s.toLowerCase();
  if (/\bbitcoin\b|\bbtc\b/.test(lower)) return 'Bitcoin';
  if (/\bethereum\b|\beth\b/.test(lower)) return 'Ethereum';
  if (/\bgold\b|\bxau\b/.test(lower)) return 'Gold';
  if (/\boil\b|\bwti\b|\bbrent\b/.test(lower)) return 'Oil';
  if (/\bnvidia\b|\bnvda\b/.test(lower)) return 'NVDA';
  if (/\btesla\b|\btsla\b/.test(lower)) return 'TSLA';
  if (/\bapple\b|\baapl\b/.test(lower)) return 'AAPL';
  if (/\bmicrostrategy\b|\bmstr\b/.test(lower)) return 'MSTR';
  if (/\bcoinbase\b|\bcoin\b/.test(lower)) return 'COIN';
  if (/\bcpi\b/.test(lower)) return 'CPI';

  return null;
}

function parseSseMessage(raw: string): { event: string; data: unknown } | null {
  const lines = raw.split('\n');
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  const dataText = dataLines.join('\n');
  if (!dataText) return null;

  try {
    return { event, data: JSON.parse(dataText) };
  } catch {
    return { event, data: dataText };
  }
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error || '');
  return /abort|unmount/i.test(message);
}

async function consumeSseStream({
  response,
  signal,
  onEvent,
}: {
  response: Response;
  signal: AbortSignal;
  onEvent: (event: string, data: any) => void;
}) {
  if (!response.body) throw new Error('Missing response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal.aborted) break;
    let value: Uint8Array | undefined;
    let done = false;
    try {
      const next = await reader.read();
      value = next.value;
      done = next.done;
    } catch (e) {
      if (signal.aborted || isAbortError(e)) break;
      throw e;
    }
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!raw.trim()) continue;
      const msg = parseSseMessage(raw);
      if (!msg) continue;
      onEvent(msg.event, msg.data);
    }
  }
}

type PriceMarker = {
  ts: number;
  label: string;
  tone?: 'blue' | 'orange' | 'teal';
};

const sparkNumberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function formatSparkValue(value: number, mode: PriceScaleMode): string {
  if (!Number.isFinite(value)) return '--';
  if (mode === 'indexed') return value.toFixed(2);
  const abs = Math.abs(value);
  if (abs >= 1000) return sparkNumberFmt.format(value);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function toIndexedSeries(values: number[]): number[] {
  if (!values.length) return [];
  const baseRaw = values[0] ?? 1;
  const base = Math.abs(baseRaw) > 1e-8 ? baseRaw : 1;
  return values.map((v) => Number(((v / base) * 100).toFixed(4)));
}

function alignSeriesForComparison({
  targetSize,
  targetTs,
  sourceValues,
  sourceTs,
}: {
  targetSize: number;
  targetTs?: number[];
  sourceValues: number[];
  sourceTs?: number[];
}): number[] {
  if (!targetSize || !sourceValues.length) return [];

  const sourceLast = sourceValues.length - 1;
  const at = (idx: number) => sourceValues[Math.max(0, Math.min(sourceLast, idx))]!;

  if (
    targetTs &&
    targetTs.length === targetSize &&
    sourceTs &&
    sourceTs.length === sourceValues.length &&
    targetSize > 0 &&
    sourceValues.length > 0
  ) {
    const out: number[] = [];
    let j = 0;
    for (let i = 0; i < targetTs.length; i += 1) {
      const ts = targetTs[i]!;
      while (j + 1 < sourceTs.length && Math.abs(sourceTs[j + 1]! - ts) <= Math.abs(sourceTs[j]! - ts)) j += 1;
      out.push(at(j));
    }
    return out;
  }

  if (targetSize === 1) return [at(sourceLast)];
  const denom = Math.max(1, targetSize - 1);
  return Array.from({ length: targetSize }, (_, i) => {
    const ratio = i / denom;
    const idx = Math.round(ratio * sourceLast);
    return at(idx);
  });
}

function Sparkline({
  values,
  timestamps,
  markers,
  compareValues,
  compareTimestamps,
  compareLabel,
  scaleMode = 'price',
}: {
  values: number[];
  timestamps?: number[];
  markers?: PriceMarker[];
  compareValues?: number[];
  compareTimestamps?: number[];
  compareLabel?: string;
  scaleMode?: PriceScaleMode;
}) {
  const w = 720;
  const h = 160;
  const pad = 12;
  const id = useId().replace(/:/g, '');

  const hasTs = Boolean(timestamps && timestamps.length === values.length && values.length > 0);
  const t0 = hasTs ? timestamps![0] : null;
  const t1 = hasTs ? timestamps![timestamps!.length - 1] : null;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const alignedCompareValues = useMemo(
    () =>
      compareValues?.length
        ? alignSeriesForComparison({
            targetSize: values.length,
            targetTs: hasTs ? timestamps : undefined,
            sourceValues: compareValues,
            sourceTs: compareTimestamps,
          })
        : [],
    [compareTimestamps, compareValues, hasTs, timestamps, values.length],
  );

  const baseValues = useMemo(() => (scaleMode === 'indexed' ? toIndexedSeries(values) : values), [scaleMode, values]);
  const compareSeries = useMemo(() => {
    if (!alignedCompareValues.length) return null;
    return scaleMode === 'indexed' ? toIndexedSeries(alignedCompareValues) : alignedCompareValues;
  }, [alignedCompareValues, scaleMode]);

  const scaleValues = useMemo(
    () => (compareSeries?.length ? [...baseValues, ...compareSeries] : baseValues),
    [baseValues, compareSeries],
  );
  const min = Math.min(...(scaleValues.length ? scaleValues : [0]));
  const max = Math.max(...(scaleValues.length ? scaleValues : [1]));
  const span = Math.max(1e-6, max - min);
  const mid = (min + max) / 2;

  const xForIndex = useCallback(
    (i: number) => {
      const denom = Math.max(1, baseValues.length - 1);
      return pad + (i / denom) * (w - pad * 2);
    },
    [baseValues.length, pad],
  );

  const yForValue = useCallback(
    (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2),
    [h, min, pad, span],
  );

  const d = baseValues
    .map((v, i) => {
      const x = xForIndex(i);
      const y = yForValue(v);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const compareD = compareSeries?.length
    ? compareSeries
        .map((v, i) => {
          const x = xForIndex(i);
          const y = yForValue(v);
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(' ')
    : null;

  const hover = useMemo(() => {
    if (hoverIdx === null || !baseValues.length) return null;
    const i = Math.max(0, Math.min(baseValues.length - 1, hoverIdx));
    const v = baseValues[i]!;
    const ts = hasTs ? timestamps![i]! : null;
    const compareV = compareSeries?.[i];
    const x = xForIndex(i);
    const y = yForValue(v);
    const compareY = typeof compareV === 'number' && Number.isFinite(compareV) ? yForValue(compareV) : null;
    return { i, v, ts, x, y, compareV: compareV ?? null, compareY };
  }, [baseValues, compareSeries, hasTs, hoverIdx, timestamps, xForIndex, yForValue]);

  const markerXs = useMemo(() => {
    if (!hasTs || !t0 || !t1 || !markers?.length) return [];
    const denom = Math.max(1, t1 - t0);
    return markers
      .map((m) => {
        const r = Math.max(0, Math.min(1, (m.ts - t0) / denom));
        const x = pad + r * (w - pad * 2);
        const tone = m.tone ?? 'teal';
        const stroke =
          tone === 'blue'
            ? 'rgba(0,102,255,0.42)'
            : tone === 'orange'
              ? 'rgba(255,82,28,0.38)'
              : 'rgba(20,184,166,0.34)';
        return { x, stroke, label: m.label };
      })
      .filter((m) => Number.isFinite(m.x));
  }, [hasTs, markers, pad, t0, t1, w]);

  const onMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * w;
      const pct = (x - pad) / (w - pad * 2);
      const idx = Math.round(pct * Math.max(1, baseValues.length - 1));
      setHoverIdx(Math.max(0, Math.min(Math.max(0, baseValues.length - 1), idx)));
    },
    [baseValues.length, pad, w],
  );

  return (
    <svg
      viewBox={`0 0 ${w}  ${h}`}
      className="h-28 w-full"
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <defs>
        <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(0, 102, 255, 0.85)" />
          <stop offset="0.55" stopColor="rgba(255, 82, 28, 0.85)" />
          <stop offset="1" stopColor="rgba(20, 184, 166, 0.85)" />
        </linearGradient>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(0, 102, 255, 0.18)" />
          <stop offset="1" stopColor="rgba(0, 0, 0, 0)" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = pad + p * (h - pad * 2);
        return <line key={p} x1={pad} x2={w - pad} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />;
      })}
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => {
        const x = pad + p * (w - pad * 2);
        return <line key={p} y1={pad} y2={h - pad} x1={x} x2={x} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />;
      })}

      {markerXs.slice(0, 10).map((m, idx) => (
        <line
          key={`${m.x}-${idx}`}
          x1={m.x}
          x2={m.x}
          y1={pad}
          y2={h - pad}
          stroke={m.stroke}
          strokeWidth="1"
          opacity="0.75"
        />
      ))}

      <text x={pad} y={pad + 10} fontSize="10" fill="rgba(255,255,255,0.45)">
        {formatSparkValue(max, scaleMode)}
      </text>
      <text x={pad} y={pad + (h - pad * 2) / 2 + 3} fontSize="10" fill="rgba(255,255,255,0.35)">
        {formatSparkValue(mid, scaleMode)}
      </text>
      <text x={pad} y={h - pad + 10} fontSize="10" fill="rgba(255,255,255,0.45)">
        {formatSparkValue(min, scaleMode)}
      </text>

      <path d={d} fill="none" stroke={`url(#line-${id})`} strokeWidth="2.35" />
      {compareD ? (
        <path
          d={compareD}
          fill="none"
          stroke="rgba(255, 188, 92, 0.86)"
          strokeWidth="1.65"
          strokeDasharray="5 4"
        />
      ) : null}
      <path
        d={`${d} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`}
        fill={`url(#fill-${id})`}
        opacity="0.92"
      />

      {hover ? (
        <g>
          <line x1={hover.x} x2={hover.x} y1={pad} y2={h - pad} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          <line x1={pad} x2={w - pad} y1={hover.y} y2={hover.y} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <circle cx={hover.x} cy={hover.y} r={4.2} fill="rgba(255,255,255,0.9)" />
          <circle cx={hover.x} cy={hover.y} r={7.5} fill="rgba(0,102,255,0.22)" />
          {hover.compareY !== null ? (
            <>
              <line
                x1={pad}
                x2={w - pad}
                y1={hover.compareY}
                y2={hover.compareY}
                stroke="rgba(255, 188, 92, 0.16)"
                strokeWidth="1"
              />
              <circle cx={hover.x} cy={hover.compareY} r={3.2} fill="rgba(255, 188, 92, 0.95)" />
            </>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-white/65">{label}</div>
        <div className="h-2 w-20 overflow-hidden rounded-full bg-white/10">
          <div className="h-2 w-10 rounded-full bg-white/20" />
        </div>
      </div>
      <div className="mt-2 h-10 rounded-xl border border-dashed border-white/10 bg-black/10" />
    </div>
  );
}

function WorkspaceLoading({
  title,
  subtitle,
  stage,
}: {
  title: string;
  subtitle: string;
  stage?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/25">
      <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:radial-gradient(circle_at_20%_20%,rgba(0,102,255,0.18),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(255,82,28,0.14),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:54px_54px]" />
      <div className="relative grid h-[56vh] min-h-[340px] place-items-center px-4">
        <div className="flex flex-col items-center text-center">
          <LoadRipple compact />
          <div className="mt-3 text-sm font-semibold text-white/86">{title}</div>
          <div className="mt-1 max-w-md text-xs leading-relaxed text-white/55">{subtitle}</div>
          {stage ? <div className="mt-2 text-[11px] text-[rgba(173,212,255,0.95)]">{stage}</div> : null}
        </div>
      </div>
    </div>
  );
}

function Drawer({
  open,
  title,
  subtitle,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={cn('fixed inset-0 z-[60] transition-opacity', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
      <div
        className={cn('absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute right-3 top-20 bottom-4 w-[min(520px,calc(100%-1.5rem))] transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-[110%]',
        )}
      >
        <div className="h-full overflow-hidden rounded-3xl border border-white/10 bg-[#070b14]/95 shadow-[0_40px_100px_-55px_var(--shadow)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-white/90">{title}</div>
              <div className="text-[11px] text-white/45">{subtitle || 'Evidence and excerpts'}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close drawer">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-full overflow-auto px-4 py-3 pb-24">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Terminal() {
  const searchParams = useSearchParams();
  const [topic, setTopic] = useState('');
  const [typedTopicHint, setTypedTopicHint] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [plan, setPlan] = useState<PlanEvent | null>(null);
  const [search, setSearch] = useState<SearchEvent | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [runMeta, setRunMeta] = useState<{ mode: 'fast' | 'deep'; provider: string } | null>(null);
  const [mode, setMode] = useState<'fast' | 'deep'>('fast');
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [queryQueue, setQueryQueue] = useState<QueryQueueItem[]>([]);
  const [scrapeQueue, setScrapeQueue] = useState<ScrapeQueueItem[]>([]);
  const [summariesCount, setSummariesCount] = useState(0);
  const [graphVariant, setGraphVariant] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const traceInFlightRef = useRef(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [snapshotMode, setSnapshotMode] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [panelOpen, setPanelOpen] = useState({
    tape: false,
    sources: false,
    narratives: false,
    price: false,
    media: false,
  });

  const [debugBrowserLogs, setDebugBrowserLogs] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [chatMode, setChatMode] = useState<'fetch' | 'explain'>('fetch');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'm0',
      role: 'assistant',
      content:
        'Start empty, then build: ask a topic and I will stream sources, a graph map, and narrative clusters.',
      createdAt: now(),
    },
  ]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [flowFocusNodeId, setFlowFocusNodeId] = useState<string | null>(null);
  const [flowFocusEdgeId, setFlowFocusEdgeId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState('Inspector');
  const [drawerNote, setDrawerNote] = useState<string | null>(null);
  const [drawerEvidence, setDrawerEvidence] = useState<EvidenceItem[]>([]);

  const [videos, setVideos] = useState<VideosResponse | null>(null);
  const [videosLoading, setVideosLoading] = useState(false);
  const videosInFlightRef = useRef(false);
  const [videoView, setVideoView] = useState<'player' | 'list'>('player');
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [videoAutoPoll, setVideoAutoPoll] = useState(false);

  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const priceInFlightRef = useRef(false);
  const [priceCompareTopic, setPriceCompareTopic] = useState<string | null>(null);
  const [priceCompare, setPriceCompare] = useState<PriceResponse | null>(null);
  const [priceCompareLoading, setPriceCompareLoading] = useState(false);
  const [priceScaleMode, setPriceScaleMode] = useState<PriceScaleMode>('price');
  const priceCompareSeqRef = useRef(0);

  const autoBriefSentRef = useRef<string | null>(null);
  const autoBriefInFlightRef = useRef(false);

  const [evidenceView, setEvidenceView] = useState<EvidenceView>('graph');
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  const [graphFitSignal, setGraphFitSignal] = useState(0);

  const runAbortRef = useRef<AbortController | null>(null);
  const runInFlightRef = useRef(false);
  const autoRunTopicRef = useRef<string | null>(null);
  const latestSearchResultsRef = useRef<string[]>([]);
  const hydratedSnapshotIdRef = useRef<string | null>(null);
  const bootstrapTriedRef = useRef(false);

  const queryTopic = useMemo(() => {
    const raw = searchParams.get('q') || searchParams.get('topic') || '';
    return raw.trim();
  }, [searchParams]);
  const queryRunAt = useMemo(() => searchParams.get('runAt') || '', [searchParams]);
  const autoRunKey = useMemo(() => `${queryTopic}::${queryRunAt}`, [queryRunAt, queryTopic]);

  const snapshotSessionId = useMemo(() => {
    const id = searchParams.get('sessionId') || '';
    return isUuid(id) ? id : null;
  }, [searchParams]);
  const snapshotOpening = Boolean(snapshotSessionId && session?.id !== snapshotSessionId);
  const snapshotReadOnly = snapshotMode || snapshotLoading || snapshotOpening;

  const replaceUrlWithSessionId = useCallback((sessionId: string) => {
    if (typeof window === 'undefined') return;
    if (!isUuid(sessionId)) return;
    const params = new URLSearchParams(window.location.search);
    const sameSession = params.get('sessionId') === sessionId;
    const hasAutoRunParams = params.has('q') || params.has('topic') || params.has('runAt');
    if (sameSession && !hasAutoRunParams) return;
    params.set('sessionId', sessionId);
    params.delete('q');
    params.delete('topic');
    params.delete('runAt');
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, []);

  useEffect(() => {
    return () => {
      // Avoid abort-on-unmount in dev: certain injected scripts/HMR paths surface noisy
      // unhandled AbortError logs even though cancellation is expected.
      runInFlightRef.current = false;
      runAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!copiedKey) return;
    const t = window.setTimeout(() => setCopiedKey(null), 1200);
    return () => window.clearTimeout(t);
  }, [copiedKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qp = new URLSearchParams(window.location.search);
    const enabled = qp.get('debug') === '1';
    setDebugBrowserLogs(enabled);
  }, []);

  useEffect(() => {
    if (topic.trim()) {
      setTypedTopicHint('');
      return;
    }

    let stopped = false;
    let timer: number | null = null;
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;

    const schedule = (ms: number) => {
      timer = window.setTimeout(tick, ms);
    };

    const tick = () => {
      if (stopped) return;
      const phrase = TOPIC_TYPED_EXAMPLES[phraseIndex % TOPIC_TYPED_EXAMPLES.length];

      if (!deleting) {
        charIndex = Math.min(phrase.length, charIndex + 1);
        setTypedTopicHint(phrase.slice(0, charIndex));
        if (charIndex === phrase.length) {
          deleting = true;
          schedule(1200);
          return;
        }
        schedule(30);
        return;
      }

      charIndex = Math.max(0, charIndex - 1);
      setTypedTopicHint(phrase.slice(0, charIndex));
      if (charIndex === 0) {
        deleting = false;
        phraseIndex += 1;
        schedule(240);
        return;
      }
      schedule(18);
    };

    schedule(300);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [topic]);

  const appendTimeline = useCallback((item: TimelineItem) => {
    setTimelineItems((prev) => {
      const next = [...prev.filter((x) => x.id !== item.id), item];
      next.sort((a, b) => a.ts - b.ts);
      return next.slice(-260);
    });
  }, []);

  const evidenceById = useMemo(() => {
    const map = new Map<string, EvidenceItem>();
    (session?.evidence ?? []).forEach((e) => map.set(e.id, e));
    return map;
  }, [session?.evidence]);

  const tapeTagsByEvidenceId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of session?.tape ?? []) {
      const key = String(t.evidenceId || '');
      if (!key) continue;
      const prev = map.get(key) || [];
      prev.push(...(t.tags || []));
      map.set(key, prev);
    }
    for (const [k, arr] of map.entries()) {
      const uniq = Array.from(new Set(arr.map((x) => String(x || '').trim()).filter(Boolean))).slice(0, 8);
      map.set(k, uniq);
    }
    return map;
  }, [session?.tape]);

  const sourceStats = useMemo(() => {
    const map = new Map<string, { source: string; count: number; latestAt: number; latestKind: EvidenceItem['timeKind'] }>();
    for (const ev of session?.evidence ?? []) {
      const key = String(ev.source || 'unknown');
      const prev = map.get(key);
      const ts = typeof ev.publishedAt === 'number' ? ev.publishedAt : 0;
      const kind = ev.timeKind;
      if (!prev) {
        map.set(key, { source: key, count: 1, latestAt: ts, latestKind: kind });
      } else {
        prev.count += 1;
        if (ts > prev.latestAt) {
          prev.latestAt = ts;
          prev.latestKind = kind;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.latestAt - a.latestAt);
  }, [session?.evidence]);

  const tapeStats = useMemo(() => {
    const tape = session?.tape ?? [];
    const uniqueSources = new Set<string>();
    const tagCounts = new Map<string, number>();
    let pub = 0;
    let seen = 0;

    for (const t of tape) {
      if (t?.source) uniqueSources.add(String(t.source));
      for (const raw of t?.tags ?? []) {
        const tag = String(raw || '').trim();
        if (!tag) continue;
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    for (const ev of session?.evidence ?? []) {
      if (ev.timeKind === 'published') pub += 1;
      else seen += 1;
    }

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));

    return {
      headlineCount: tape.length,
      uniqueSourceCount: uniqueSources.size,
      topTags,
      evidenceCount: session?.evidence?.length ?? 0,
      publishedCount: pub,
      seenCount: seen,
    };
  }, [session?.evidence, session?.tape]);

  const narrativeStats = useMemo(() => {
    const clusters = session?.clusters ?? [];
    const counts = { rising: 0, steady: 0, fading: 0 };
    for (const c of clusters) counts[c.momentum] += 1;
    return { count: clusters.length, ...counts };
  }, [session?.clusters]);

  const openEvidence = useCallback(
    (title: string, evidenceIds: string[], note?: string | null) => {
      const items = evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((v): v is EvidenceItem => Boolean(v));
      setDrawerTitle(title);
      setDrawerNote(note ? note : null);
      setDrawerEvidence(items);
      if (!graphFullscreen) setDrawerOpen(true);
    },
    [evidenceById, graphFullscreen],
  );

  const fetchTrace = useCallback(async (sessionId: string) => {
    if (!isUuid(sessionId)) return;
    if (traceInFlightRef.current) return;
    traceInFlightRef.current = true;
    setTraceLoading(true);
    setTraceError(null);
    try {
      const res = await fetch(apiPath(`/api/sessions/events?sessionId=${encodeURIComponent(sessionId)}&limit=400`), {
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text ? `Trace fetch failed (${res.status}): ${text}` : `Trace fetch failed (${res.status})`);
      }
      const data = (await res.json()) as TraceResponse;
      setTrace(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Trace fetch failed';
      setTraceError(message);
      setTrace(null);
    } finally {
      traceInFlightRef.current = false;
      setTraceLoading(false);
    }
  }, []);

  const persistSnapshot = useCallback(
    async ({ price, videos }: { price?: PriceResponse; videos?: VideosResponse }) => {
      const sessionId = session?.id;
      if (snapshotReadOnly) return;
      if (!sessionId || !isUuid(sessionId)) return;
      if (!price && !videos) return;

      try {
        await fetch(apiPath('/api/sessions/snapshot'), {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            ...(price ? { price } : null),
            ...(videos ? { videos } : null),
          }),
        });
      } catch {
        // Best effort persistence; UI should not fail if this write fails.
      }
    },
    [session?.id, snapshotReadOnly],
  );

  const hydrateSnapshot = useCallback(async (sessionId: string) => {
    if (!isUuid(sessionId)) return;
    setSnapshotLoading(true);
    setSnapshotMode(true);
    setRunning(false);
    runInFlightRef.current = false;
    runAbortRef.current?.abort();
    runAbortRef.current = null;
    setTraceError(null);

    try {
      const res = await fetch(apiPath(`/api/sessions/events?sessionId=${encodeURIComponent(sessionId)}&limit=600`), {
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text ? `Snapshot load failed (${res.status}): ${text}` : `Snapshot load failed (${res.status})`);
      }

      const data = (await res.json()) as TraceResponse;
      setTrace(data);
      setTraceOpen(false);

      const meta = ((data.session.meta || {}) as SessionSnapshotMeta) || {};
      const artifacts = (meta.artifacts || {}) as SessionSnapshotArtifacts;
      const topic = String(data.session.topic || '');
      const startedAt = Date.parse(data.session.created_at) || now();

      const savedPrice = artifacts.price || null;
      const savedVideos = artifacts.videos || null;
      const hasSavedSeries =
        Boolean(savedPrice?.series?.length) && Boolean(savedPrice?.timestamps?.length) && savedPrice?.series?.length === savedPrice?.timestamps?.length;
      const fallbackSeries = buildSeries(startedAt);

      setSession({
        id: data.session.id,
        topic,
        startedAt,
        step:
          data.session.step === 'idle' ||
          data.session.step === 'plan' ||
          data.session.step === 'search' ||
          data.session.step === 'scrape' ||
          data.session.step === 'extract' ||
          data.session.step === 'link' ||
          data.session.step === 'cluster' ||
          data.session.step === 'render' ||
          data.session.step === 'ready'
            ? data.session.step
            : 'ready',
        progress: typeof data.session.progress === 'number' ? data.session.progress : 1,
        tape: Array.isArray(artifacts.tape) ? artifacts.tape : [],
        clusters: Array.isArray(artifacts.clusters) ? artifacts.clusters : [],
        nodes: Array.isArray(artifacts.nodes) ? artifacts.nodes : [],
        edges: Array.isArray(artifacts.edges) ? artifacts.edges : [],
        evidence: Array.isArray(artifacts.evidence) ? artifacts.evidence : [],
        series: hasSavedSeries ? savedPrice!.series : fallbackSeries.y,
        seriesTs: hasSavedSeries ? savedPrice!.timestamps : fallbackSeries.t,
        videosSnapshot: savedVideos,
        priceSnapshot: savedPrice,
        snapshotMode: true,
      });

      setRunMeta({
        mode: meta.mode === 'deep' ? 'deep' : 'fast',
        provider: typeof meta.provider === 'string' ? meta.provider : 'openrouter',
      });
      setMode(meta.mode === 'deep' ? 'deep' : 'fast');
      setTopic(topic);
      setPlan(meta.plan || null);
      setSearch(null);
      setWarnings(
        data.events
          .filter((ev) => ev.type === 'warn')
          .map((ev) => String((ev.payload as Record<string, unknown>)?.message || 'Warning')),
      );
      setVideos(savedVideos || null);
      setPrice(savedPrice || null);
      setPriceCompare(null);
      setPriceCompareTopic(null);
      setPriceCompareLoading(false);
      setChatMode('explain');
      setChatPanelOpen(false);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setFlowFocusNodeId(null);
      setFlowFocusEdgeId(null);
      setDrawerOpen(false);

      const nextTimeline: TimelineItem[] = [];
      for (const ev of data.events) {
        const ts = Date.parse(ev.created_at) || now();
        if (ev.type === 'price.snapshot') {
          const payload = ev.payload as PriceResponse;
          nextTimeline.push({
            id: `tl_hist_price_${ev.id}`,
            ts,
            kind: 'price',
            title: `Price snapshot (${payload.provider || 'price'})`,
            subtitle: payload.error || `${payload.series?.length || 0} points`,
            tags: ['price', payload.provider || 'unknown'],
          });
        } else if (ev.type === 'videos.snapshot') {
          const payload = ev.payload as VideosResponse;
          nextTimeline.push({
            id: `tl_hist_media_${ev.id}`,
            ts,
            kind: 'media',
            title: `Video snapshot (${payload.mode || 'media'})`,
            subtitle: `${payload.items?.length || 0} items`,
            tags: ['media', payload.mode || 'snapshot'],
          });
        } else if (ev.type === 'warn') {
          const payload = ev.payload as Record<string, unknown>;
          nextTimeline.push({
            id: `tl_hist_warn_${ev.id}`,
            ts,
            kind: 'note',
            title: 'Warning',
            subtitle: String(payload.message || ''),
            tags: ['warn'],
          });
        }
      }

      for (const ev of Array.isArray(artifacts.evidence) ? artifacts.evidence : []) {
        nextTimeline.push({
          id: `tl_hist_ev_${ev.id}`,
          ts: typeof ev.publishedAt === 'number' ? ev.publishedAt : startedAt,
          kind: 'evidence',
          title: ev.title,
          subtitle: ev.source,
          evidenceIds: [ev.id],
          tags: [...(ev.aiSummary?.catalysts || []).slice(0, 4), ...(ev.aiSummary?.entities || []).slice(0, 2)],
        });
      }
      setTimelineItems(nextTimeline.sort((a, b) => a.ts - b.ts).slice(-280));
      replaceUrlWithSessionId(data.session.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load snapshot';
      setTraceError(message);
      setSnapshotMode(false);
    } finally {
      setSnapshotLoading(false);
    }
  }, [replaceUrlWithSessionId]);

  const hydrateLatestSession = useCallback(async () => {
    if (bootstrapTriedRef.current) return;
    bootstrapTriedRef.current = true;
    try {
      const res = await fetch(apiPath('/api/sessions?limit=1'), { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as SessionsListResponse;
      const first = Array.isArray(data?.sessions) ? data.sessions[0] : null;
      const id = typeof first?.id === 'string' ? first.id : '';
      if (!isUuid(id)) return;
      if (hydratedSnapshotIdRef.current === id) return;
      hydratedSnapshotIdRef.current = id;
      await hydrateSnapshot(id);
    } catch {
      // Bootstrap fallback is best effort.
    }
  }, [hydrateSnapshot]);

  useEffect(() => {
    if (!snapshotSessionId) {
      hydratedSnapshotIdRef.current = null;
      return;
    }
    if (hydratedSnapshotIdRef.current === snapshotSessionId) return;
    hydratedSnapshotIdRef.current = snapshotSessionId;
    void hydrateSnapshot(snapshotSessionId);
  }, [hydrateSnapshot, snapshotSessionId]);

  useEffect(() => {
    if (snapshotSessionId) return;
    if (queryTopic) return;
    if (session) return;
    if (snapshotLoading || running || runInFlightRef.current) return;
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem(LAST_ACTIVE_SESSION_KEY) || '';
    if (isUuid(stored)) {
      if (hydratedSnapshotIdRef.current === stored) return;
      hydratedSnapshotIdRef.current = stored;
      void hydrateSnapshot(stored);
      return;
    }
    void hydrateLatestSession();
  }, [hydrateLatestSession, hydrateSnapshot, queryTopic, running, session, snapshotLoading, snapshotSessionId]);

  useEffect(() => {
    const id = session?.id;
    if (!id || !isUuid(id)) return;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LAST_ACTIVE_SESSION_KEY, id);
  }, [session?.id]);

  const reset = useCallback(() => {
    runAbortRef.current?.abort();
    runAbortRef.current = null;
    runInFlightRef.current = false;
    setRunning(false);
    setSession(null);
    setPlan(null);
    setSearch(null);
    setWarnings([]);
    setRunMeta(null);
    setLastQuestion(null);
    setQueryQueue([]);
    setScrapeQueue([]);
    setSummariesCount(0);
    setGraphVariant(null);
    setTraceOpen(false);
    setTraceLoading(false);
    setTraceError(null);
    setTrace(null);
    traceInFlightRef.current = false;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setFlowFocusNodeId(null);
    setFlowFocusEdgeId(null);
    setDrawerOpen(false);
    setDrawerEvidence([]);
    setDrawerTitle('Inspector');
    setDrawerNote(null);
    setVideos(null);
    setVideosLoading(false);
    setPrice(null);
    setPriceLoading(false);
    priceInFlightRef.current = false;
    setPriceCompareTopic(null);
    setPriceCompare(null);
    setPriceCompareLoading(false);
    setPriceScaleMode('price');
    priceCompareSeqRef.current += 1;
    setGraphFullscreen(false);
    setChatPanelOpen(false);
    setSnapshotMode(false);
    setSnapshotLoading(false);
    setSelectedTag(null);
    setTimelineItems([]);
    setPanelOpen({
      tape: false,
      sources: false,
      narratives: false,
      price: false,
      media: false,
    });
    setMessages([
      {
        id: 'm0',
        role: 'assistant',
        content:
          'Start empty, then build: ask a topic and I will stream sources, a graph map, and narrative clusters.',
        createdAt: now(),
      },
    ]);
    setChatInput('');
    setChatMode('fetch');
  }, []);

  const fetchVideos = useCallback(
    async (q: string) => {
      const cleaned = q.trim();
      if (!cleaned) return;
      if (videosInFlightRef.current) return;
      videosInFlightRef.current = true;
      setVideosLoading(true);
      try {
        const res = await fetch(apiPath(`/api/videos?topic=${encodeURIComponent(cleaned)}&limit=6`), {
          cache: 'no-store',
        });
        const data = (await res.json()) as VideosResponse;
        setVideos(data);
        setSession((prev) => (prev ? { ...prev, videosSnapshot: data } : prev));
        await persistSnapshot({ videos: data });
        appendTimeline({
          id: `tl_media_${data.fetchedAt}`,
          ts: data.fetchedAt,
          kind: 'media',
          title: `Video snapshot (${data.mode})`,
          subtitle: `${data.items.length} items`,
          tags: ['media', data.mode],
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Video fetch failed';
        setVideos({
          topic: cleaned,
          fetchedAt: now(),
          mode: 'mock',
          items: [],
          error: message,
        });
      } finally {
        videosInFlightRef.current = false;
        setVideosLoading(false);
      }
    },
    [appendTimeline, persistSnapshot],
  );

  const fetchPriceData = useCallback(async (q: string): Promise<PriceResponse> => {
    const cleaned = q.trim();
    if (!cleaned) {
      return {
        ok: false,
        topic: '',
        provider: 'error',
        fetchedAt: now(),
        series: [],
        timestamps: [],
        error: 'Missing topic',
      };
    }

    try {
      const res = await fetch(apiPath(`/api/price?topic=${encodeURIComponent(cleaned)}`), { cache: 'no-store' });
      const raw = (await res.json().catch(() => ({}))) as Partial<PriceResponse>;
      const series = Array.isArray(raw.series)
        ? raw.series.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
        : [];
      const timestamps = Array.isArray(raw.timestamps)
        ? raw.timestamps.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
        : [];

      return {
        ok: Boolean(raw.ok),
        topic: typeof raw.topic === 'string' ? raw.topic : cleaned,
        symbol: typeof raw.symbol === 'string' ? raw.symbol : undefined,
        provider: typeof raw.provider === 'string' ? raw.provider : 'unknown',
        fetchedAt: typeof raw.fetchedAt === 'number' ? raw.fetchedAt : now(),
        series,
        timestamps,
        last: typeof raw.last === 'number' || raw.last === null ? raw.last : undefined,
        error: typeof raw.error === 'string' ? raw.error : undefined,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Price fetch failed';
      return {
        ok: false,
        topic: cleaned,
        provider: 'error',
        fetchedAt: now(),
        series: [],
        timestamps: [],
        error: message,
      };
    }
  }, []);

  const fetchPrice = useCallback(
    async (q: string) => {
      const cleaned = q.trim();
      if (!cleaned) return;
      if (priceInFlightRef.current) return;
      priceInFlightRef.current = true;
      setPriceLoading(true);
      try {
        const data = await fetchPriceData(cleaned);
        setPrice(data);
        setSession((prev) => (prev ? { ...prev, priceSnapshot: data } : prev));
        await persistSnapshot({ price: data });
        appendTimeline({
          id: `tl_price_${data.fetchedAt}`,
          ts: data.fetchedAt,
          kind: 'price',
          title: `Price snapshot (${data.provider})`,
          subtitle: data.error ? data.error : `${data.series.length} points`,
          tags: ['price', data.provider, data.ok ? 'ok' : 'fallback'],
        });
        if (data.ok && data.series.length > 1 && data.series.length === data.timestamps.length) {
          setSession((prev) => (prev ? { ...prev, series: data.series, seriesTs: data.timestamps } : prev));
        }
      } finally {
        priceInFlightRef.current = false;
        setPriceLoading(false);
      }
    },
    [appendTimeline, fetchPriceData, persistSnapshot],
  );

  const fetchComparePrice = useCallback(
    async (baseTopic: string, compareTopic: string) => {
      const base = baseTopic.trim();
      const compare = compareTopic.trim();
      if (!base || !compare || normalizeTopicKey(base) === normalizeTopicKey(compare)) {
        setPriceCompare(null);
        setPriceCompareLoading(false);
        return;
      }

      const seq = (priceCompareSeqRef.current += 1);
      setPriceCompareLoading(true);
      try {
        const data = await fetchPriceData(compare);
        if (seq !== priceCompareSeqRef.current) return;
        setPriceCompare(data);
      } finally {
        if (seq === priceCompareSeqRef.current) setPriceCompareLoading(false);
      }
    },
    [fetchPriceData],
  );

  const runSeqRef = useRef(0);

  const start = useCallback(
    async (rawTopic: string, question?: string) => {
      const cleaned = rawTopic.trim() || 'Bitcoin';
      const cleanedQ = typeof question === 'string' ? question.trim() : '';

      runAbortRef.current?.abort();
      const abort = new AbortController();
      runAbortRef.current = abort;
      const runSeq = (runSeqRef.current += 1);
      runInFlightRef.current = true;

      setRunning(true);
      setLastQuestion(cleanedQ ? cleanedQ : null);
      setPlan(null);
      setSearch(null);
      setWarnings([]);
      setRunMeta({ mode, provider: 'openrouter' });
      setQueryQueue([]);
      setScrapeQueue([]);
      setSummariesCount(0);
      setGraphVariant(null);
      latestSearchResultsRef.current = [];
      setTrace(null);
      setTraceError(null);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setFlowFocusNodeId(null);
      setFlowFocusEdgeId(null);
      setDrawerOpen(false);
      setDrawerEvidence([]);
      setDrawerTitle('Inspector');
      setDrawerNote(null);
      setGraphFullscreen(false);
      setChatPanelOpen(false);
      setSnapshotMode(false);
      setSelectedTag(null);
      setTimelineItems([]);
      setGraphFitSignal((v) => v + 1);
      setVideos(null);
      setVideosLoading(false);
      setActiveVideoId(null);
      setPrice(null);
      setPriceLoading(false);
      priceInFlightRef.current = false;
      setPriceCompareTopic(null);
      setPriceCompare(null);
      setPriceCompareLoading(false);
      setPriceScaleMode('price');
      priceCompareSeqRef.current += 1;

      const startedAtLocal = now();
      const localId = `local_${Math.random().toString(16).slice(2)}`;
      const { y, t } = buildSeries(startedAtLocal);

      setSession({
        id: localId,
        topic: cleaned,
        startedAt: startedAtLocal,
        step: 'plan',
        progress: 0.06,
        tape: [],
        clusters: [],
        nodes: [],
        edges: [],
        evidence: [],
        series: y,
        seriesTs: t,
      });

      try {
        const res = await fetch(apiPath('/api/run'), {
          method: 'POST',
          cache: 'no-store',
          signal: abort.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            topic: cleaned,
            ...(cleanedQ ? { question: cleanedQ } : null),
            mode,
            serpFormat: 'light',
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text ? `Run failed (${res.status}): ${text}` : `Run failed (${res.status})`);
        }

        await consumeSseStream({
          response: res,
          signal: abort.signal,
          onEvent: (event, data) => {
            if (abort.signal.aborted) return;
            if (runSeq !== runSeqRef.current) return;

            if (debugBrowserLogs) {
              // eslint-disable-next-line no-console
              console.info('[signal-terminal]', event, data);
            }

            if (event === 'session' && data && typeof data === 'object') {
              const d = data as any;
              const serverMode: 'fast' | 'deep' = d.mode === 'deep' ? 'deep' : 'fast';
              const provider = typeof d.provider === 'string' ? d.provider : 'openrouter';
              const sessionId = typeof d.sessionId === 'string' ? d.sessionId : localId;
              const serverTopic = typeof d.topic === 'string' ? d.topic : cleaned;
              const serverStartedAt = typeof d.startedAt === 'number' ? d.startedAt : startedAtLocal;
              const { y, t } = buildSeries(serverStartedAt);

              setRunMeta({ mode: serverMode, provider });
              setTopic(serverTopic);
              setGraphVariant(null);
              setSummariesCount(0);
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      id: sessionId,
                      topic: serverTopic,
                      startedAt: serverStartedAt,
                      series: y,
                      seriesTs: t,
                    }
                  : {
                      id: sessionId,
                      topic: serverTopic,
                      startedAt: serverStartedAt,
                      step: 'plan',
                      progress: 0.06,
                      tape: [],
                      clusters: [],
                      nodes: [],
                      edges: [],
                      evidence: [],
                      series: y,
                      seriesTs: t,
                  },
              );
              if (isUuid(sessionId)) replaceUrlWithSessionId(sessionId);
              return;
            }

            if (event === 'step' && data && typeof data === 'object') {
              const d = data as any;
              const step = typeof d.step === 'string' ? d.step : '';
              const p = typeof d.progress === 'number' ? d.progress : undefined;

              const isStep = (value: string): value is PipelineStep =>
                value === 'idle' ||
                value === 'plan' ||
                value === 'search' ||
                value === 'scrape' ||
                value === 'extract' ||
                value === 'link' ||
                value === 'cluster' ||
                value === 'render' ||
                value === 'ready';

              setSession((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  step: isStep(step) ? step : prev.step,
                  progress: typeof p === 'number' ? Math.max(prev.progress, Math.min(1, p)) : prev.progress,
                };
              });

              if (step === 'search') {
                setQueryQueue((prev) => {
                  if (!prev.length) return prev;
                  if (prev.some((it) => it.state === 'running')) return prev;
                  const next = [...prev];
                  const firstIdx = next.findIndex((it) => it.state === 'queued');
                  if (firstIdx >= 0) next[firstIdx] = { ...next[firstIdx], state: 'running' };
                  return next;
                });
              }

              if (step === 'scrape') {
                setScrapeQueue((prev) => {
                  if (prev.length) return prev;
                  const top = latestSearchResultsRef.current.slice(0, 4).filter(Boolean);
                  return top.map((url) => ({ url, state: 'queued' }));
                });
              }
              return;
            }

            if (event === 'plan') {
              const p = data as PlanEvent;
              setPlan(p);
              setSearch((prev) => prev || { queries: p.queries || [], results: [] });
              const cap = mode === 'deep' ? 6 : 4;
              setQueryQueue(p.queries.slice(0, cap).map((q) => ({ query: q, state: 'queued' })));
              return;
            }

            if (event === 'search.partial' && data && typeof data === 'object') {
              const d = data as any;
              const picked = d?.picked;
              if (!Array.isArray(picked)) return;
              latestSearchResultsRef.current = picked
                .map((r: any) => String(r?.url || ''))
                .filter(Boolean)
                .slice(0, 20);
              setSearch((prev) => ({
                queries: prev?.queries?.length ? prev.queries : [],
                results: picked,
              }));

              const q = typeof d?.query === 'string' ? d.query : '';
              const added = typeof d?.added === 'number' ? d.added : undefined;
              const foundTotal = typeof d?.found === 'number' ? d.found : undefined;
              if (q) {
                setQueryQueue((prev) => {
                  if (!prev.length) return prev;
                  const next = [...prev];
                  const idx = next.findIndex((it) => it.query === q);
                  if (idx >= 0) next[idx] = { ...next[idx], state: 'done', added, foundTotal };

                  const runningIdx = next.findIndex((it) => it.state === 'running');
                  if (runningIdx >= 0 && next[runningIdx]?.query !== q) {
                    next[runningIdx] = { ...next[runningIdx], state: 'done' };
                  }

                  const nextIdx = next.findIndex((it) => it.state === 'queued');
                  if (nextIdx >= 0) next[nextIdx] = { ...next[nextIdx], state: 'running' };
                  return next;
                });
              }
              return;
            }

            if (event === 'search') {
              try {
                const results = (data as any)?.results;
                if (Array.isArray(results)) {
                  latestSearchResultsRef.current = results
                    .map((r: any) => String(r?.url || ''))
                    .filter(Boolean)
                    .slice(0, 20);
                }
              } catch {
                // ignore
              }
              setSearch(data as SearchEvent);
              setQueryQueue((prev) => prev.map((it) => (it.state === 'queued' || it.state === 'running' ? { ...it, state: 'done' } : it)));
              return;
            }

            if (event === 'scrape.page' && data && typeof data === 'object') {
              const d = data as any;
              const url = typeof d?.url === 'string' ? d.url : '';
              const status = typeof d?.status === 'string' ? d.status : '';
              if (!url) return;
              setScrapeQueue((prev) => {
                const next = [...prev];
                const idx = next.findIndex((it) => it.url === url);
                const state = status === 'start' ? 'running' : status === 'done' ? 'done' : status === 'fail' ? 'failed' : 'queued';
                if (idx >= 0) next[idx] = { ...next[idx], state };
                else next.push({ url, state });
                return next;
              });
              return;
            }

            if (event === 'evidence' && data && typeof data === 'object') {
              const items = (data as any).items;
              if (Array.isArray(items)) {
                setSession((prev) => (prev ? { ...prev, evidence: items as EvidenceItem[] } : prev));
                for (const ev of (items as EvidenceItem[]).slice(0, 16)) {
                  appendTimeline({
                    id: `tl_ev_${ev.id}`,
                    ts: typeof ev.publishedAt === 'number' ? ev.publishedAt : now(),
                    kind: 'evidence',
                    title: ev.title,
                    subtitle: ev.source,
                    evidenceIds: [ev.id],
                    tags: [
                      ...(ev.aiSummary?.catalysts || []).slice(0, 4),
                      ...(ev.aiSummary?.entities || []).slice(0, 2),
                    ],
                  });
                }
              }
              return;
            }

            if (event === 'summaries' && data && typeof data === 'object') {
              const items = (data as any).items;
              if (!Array.isArray(items)) return;
              setSummariesCount(items.length);
              const byId = new Map<string, any>();
              for (const it of items) {
                const id = typeof it?.id === 'string' ? it.id : '';
                if (!id) continue;
                byId.set(id, it);
              }
              setSession((prev) => {
                if (!prev || !prev.evidence?.length) return prev;
                const nextEvidence = prev.evidence.map((e) => {
                  const s = byId.get(e.id);
                  if (!s) return e;
                  return {
                    ...e,
                    aiSummary: {
                      bullets: Array.isArray(s.bullets) ? s.bullets.slice(0, 5) : [],
                      entities: Array.isArray(s.entities) ? s.entities.slice(0, 12) : undefined,
                      catalysts: Array.isArray(s.catalysts) ? s.catalysts.slice(0, 10) : undefined,
                      sentiment: typeof s.sentiment === 'string' ? s.sentiment : undefined,
                      confidence: typeof s.confidence === 'number' ? s.confidence : undefined,
                    },
                  } as EvidenceItem;
                });
                return { ...prev, evidence: nextEvidence };
              });
              return;
            }

            if (event === 'tape' && data && typeof data === 'object') {
              const items = (data as any).items;
              if (Array.isArray(items)) setSession((prev) => (prev ? { ...prev, tape: items as TapeItem[] } : prev));
              return;
            }

            if (event === 'graph' && data && typeof data === 'object') {
              const nodes = (data as any).nodes;
              const edges = (data as any).edges;
              const variant = typeof (data as any).variant === 'string' ? String((data as any).variant) : null;
              if (!Array.isArray(nodes) || !Array.isArray(edges)) return;
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      nodes: nodes as GraphNode[],
                      edges: edges as GraphEdge[],
                      step: prev.step === 'extract' ? 'link' : prev.step,
                      progress: Math.max(prev.progress, 0.78),
                    }
                  : prev,
              );
              if (variant) setGraphVariant(variant);
              setGraphFitSignal((v) => v + 1);
              return;
            }

            if (event === 'clusters' && data && typeof data === 'object') {
              const items = (data as any).items;
              if (!Array.isArray(items)) return;
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      clusters: items as StoryCluster[],
                      step: prev.step === 'link' ? 'cluster' : prev.step,
                      progress: Math.max(prev.progress, 0.9),
                    }
                  : prev,
              );
              return;
            }

            if (event === 'message' && data && typeof data === 'object') {
              const content = typeof (data as any).content === 'string' ? ((data as any).content as string).trim() : '';
              if (!content) return;
              setMessages((prev) => [
                ...prev,
                { id: `m_${Math.random().toString(16).slice(2)}`, role: 'assistant', content, createdAt: now() },
              ]);
              return;
            }

            if (event === 'warn' && data && typeof data === 'object') {
              const message = String((data as any).message || 'Warning');
              setWarnings((prev) => [...prev, message]);
              appendTimeline({
                id: `tl_warn_${now()}`,
                ts: now(),
                kind: 'note',
                title: 'Warning',
                subtitle: message,
                tags: ['warn'],
              });
              const q = typeof (data as any).query === 'string' ? String((data as any).query) : '';
              if (q) {
                setQueryQueue((prev) => {
                  if (!prev.length) return prev;
                  const next = [...prev];
                  const idx = next.findIndex((it) => it.query === q);
                  if (idx >= 0) next[idx] = { ...next[idx], state: 'failed' };
                  const nextIdx = next.findIndex((it) => it.state === 'queued');
                  if (nextIdx >= 0 && !next.some((it) => it.state === 'running')) next[nextIdx] = { ...next[nextIdx], state: 'running' };
                  return next;
                });
              }
              return;
            }

            if (event === 'error' && data && typeof data === 'object') {
              const message = String((data as any).message || 'Unknown error');
              setWarnings((prev) => [...prev, message]);
              setMessages((prev) => [
                ...prev,
                {
                  id: `m_${Math.random().toString(16).slice(2)}`,
                  role: 'assistant',
                  content: `Error: ${message}`,
                  createdAt: now(),
                },
              ]);
              setSession((prev) => (prev ? { ...prev, step: 'ready', progress: 1 } : prev));
              appendTimeline({
                id: `tl_error_${now()}`,
                ts: now(),
                kind: 'note',
                title: 'Run error',
                subtitle: message,
                tags: ['error'],
              });
              return;
            }

            if (event === 'done') {
              setSession((prev) => (prev ? { ...prev, step: 'ready', progress: 1 } : prev));
            }
          },
        });
      } catch (e) {
        if (abort.signal.aborted) return;
        if (runSeq !== runSeqRef.current) return;
        const message = e instanceof Error ? e.message : 'Run failed';
        setWarnings((prev) => [...prev, message]);
        setMessages((prev) => [
          ...prev,
          { id: `m_${Math.random().toString(16).slice(2)}`, role: 'assistant', content: `Error: ${message}`, createdAt: now() },
        ]);
        setSession((prev) => (prev ? { ...prev, step: 'ready', progress: 1 } : prev));
      } finally {
        if (runSeq === runSeqRef.current && !abort.signal.aborted) {
          runInFlightRef.current = false;
          setRunning(false);
        }
      }
    },
    [appendTimeline, debugBrowserLogs, mode, replaceUrlWithSessionId],
  );

  useEffect(() => {
    if (!traceOpen) return;
    const id = session?.id;
    if (!id || !isUuid(id)) return;
    void fetchTrace(id);
  }, [fetchTrace, session?.id, traceOpen]);

  useEffect(() => {
    if (snapshotSessionId) return;
    if (!queryTopic) {
      autoRunTopicRef.current = null;
      return;
    }
    if (autoRunTopicRef.current === autoRunKey) return;
    if (running || runInFlightRef.current) return;
    autoRunTopicRef.current = autoRunKey;
    setTopic(queryTopic);
    void start(queryTopic).catch(() => undefined);
  }, [autoRunKey, queryTopic, running, snapshotSessionId, start]);

  const runChat = useCallback(
    (q: string) => {
      const cleaned = q.trim();
      if (!cleaned) return;

      const inferred = guessTopicFromQuery(cleaned);
      const topicForRun = inferred || (session ? topic : cleaned);

      setMessages((prev) => [
        ...prev,
        { id: `m_${Math.random().toString(16).slice(2)}`, role: 'user', content: cleaned, createdAt: now() },
      ]);
      setChatInput('');
      setTopic(topicForRun);
      setLastQuestion(cleaned);
      void start(topicForRun, cleaned).catch(() => undefined);
    },
    [session, start, topic],
  );

  const askWithContext = useCallback(
    async (q: string, opts?: { focusEvidenceIds?: string[] }) => {
      const cleaned = q.trim();
      if (!cleaned) return;
      if (!session || !isUuid(session.id)) {
        // No server session to load artifacts from; fall back to a fetch run.
        runChat(cleaned);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { id: `m_${Math.random().toString(16).slice(2)}`, role: 'user', content: cleaned, createdAt: now() },
      ]);
      setChatInput('');

      const mentions = Array.from(new Set((cleaned.match(/@([a-zA-Z0-9_-]+)/g) || []).map((m) => m.slice(1))));
      const mentionEvidence = mentions.filter((m) => /^ev_[a-z0-9_:-]+$/i.test(m));
      const mentionNodes = mentions.filter((m) => /^n_[a-z0-9_:-]+$/i.test(m));
      const mentionTags = mentions.filter((m) => !/^ev_[a-z0-9_:-]+$/i.test(m) && !/^n_[a-z0-9_:-]+$/i.test(m));

      const mentionNodeEvidence = mentionNodes.flatMap((nodeId) =>
        (session?.edges || [])
          .filter((e) => e.from === nodeId || e.to === nodeId)
          .flatMap((e) => e.evidenceIds || []),
      );
      const mentionTagEvidence = mentionTags.flatMap((tag) =>
        (session?.evidence || [])
          .filter((ev) => {
            const tags = [
              ...(tapeTagsByEvidenceId.get(ev.id) || []),
              ...(ev.aiSummary?.catalysts || []),
              ...(ev.aiSummary?.entities || []),
            ].map((t) => String(t || '').toLowerCase());
            return tags.includes(tag.toLowerCase());
          })
          .map((ev) => ev.id),
      );
      const effectiveFocus = Array.from(
        new Set([...(opts?.focusEvidenceIds || []), ...mentionEvidence, ...mentionNodeEvidence, ...mentionTagEvidence]),
      ).slice(0, 24);

      try {
        const res = await fetch(apiPath('/api/chat'), {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            message: cleaned,
            ...(effectiveFocus.length ? { focusEvidenceIds: effectiveFocus } : null),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(data?.error || `Chat failed (${res.status})`);
        const content = typeof data?.content === 'string' ? data.content.trim() : '';
        setMessages((prev) => [
          ...prev,
          {
            id: `m_${Math.random().toString(16).slice(2)}`,
            role: 'assistant',
            content: content || 'No response.',
            createdAt: now(),
          },
        ]);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Chat failed';
        setMessages((prev) => [
          ...prev,
          { id: `m_${Math.random().toString(16).slice(2)}`, role: 'assistant', content: `Error: ${message}`, createdAt: now() },
        ]);
      }
    },
    [runChat, session, tapeTagsByEvidenceId],
  );

  const fetchAutoBrief = useCallback(
    async (opts: { sessionId: string; topic: string; focusEvidenceIds: string[] }) => {
      if (!isUuid(opts.sessionId)) return;
      if (autoBriefInFlightRef.current) return;
      autoBriefInFlightRef.current = true;

      try {
        const res = await fetch(apiPath('/api/chat'), {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: opts.sessionId,
            message: `Give a short paragraph (3-5 sentences, no bullets) explaining what is happening with ${opts.topic} right now. Cite evidence IDs like [ev_3].`,
            ...(opts.focusEvidenceIds.length ? { focusEvidenceIds: opts.focusEvidenceIds.slice(0, 24) } : null),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(data?.error || `Brief failed (${res.status})`);
        const content = typeof data?.content === 'string' ? data.content.trim() : '';
        if (!content) return;
        setMessages((prev) => [
          ...prev,
          {
            id: `m_${Math.random().toString(16).slice(2)}`,
            role: 'assistant',
            content: `Brief: ${content}`,
            createdAt: now(),
          },
        ]);
      } catch {
        // Silent failure: the run results are still usable.
      } finally {
        autoBriefInFlightRef.current = false;
      }
    },
    [],
  );

  const rerun = useCallback(() => {
    const t = session?.topic || topic;
    if (!t.trim()) return;
    void start(t, lastQuestion || undefined).catch(() => undefined);
  }, [lastQuestion, session?.topic, start, topic]);

  useEffect(() => {
    if (!session) return;
    // After a run exists, default chat to "explain" so users can ask follow-ups without re-running.
    setChatMode('explain');
  }, [session?.id]);

  useEffect(() => {
    if (!session || !isUuid(session.id)) return;
    if (snapshotReadOnly) return;
    if (running) return;
    if (session.step !== 'ready') return;
    if (!session.evidence.length) return;
    if (autoBriefSentRef.current === session.id) return;

    autoBriefSentRef.current = session.id;
    const focusEvidenceIds = Array.from(new Set((session.tape || []).map((t) => String(t.evidenceId || '')).filter(Boolean))).slice(0, 24);
    void fetchAutoBrief({ sessionId: session.id, topic: session.topic, focusEvidenceIds });
  }, [fetchAutoBrief, running, session, snapshotReadOnly]);

  useEffect(() => {
    if (!session) return;
    if (selectedNodeId) {
      const node = session.nodes.find((n) => n.id === selectedNodeId);
      if (!node) return;
      const edges = session.edges.filter((e) => e.from === node.id || e.to === node.id);
      const ids = Array.from(new Set(edges.flatMap((e) => e.evidenceIds)));
      if (ids.length) openEvidence(`Node: ${node.label}`, ids);
    }
  }, [openEvidence, selectedNodeId, session]);

  useEffect(() => {
    if (!session) return;
    if (selectedEdgeId) {
      const edge = session.edges.find((e) => e.id === selectedEdgeId);
      if (!edge) return;
      openEvidence(
        `Edge: ${edge.type.replace(/_/g, ' ')} (${Math.round(edge.confidence * 100)}%)`,
        edge.evidenceIds,
        edge.rationale || null,
      );
    }
  }, [openEvidence, selectedEdgeId, session]);

  useEffect(() => {
    if (snapshotReadOnly) return;
    const sessionId = session?.id;
    const sessionTopic = session?.topic;
    if (!sessionId || !sessionTopic) {
      setVideos(null);
      setVideosLoading(false);
      setActiveVideoId(null);
      return;
    }
    void fetchVideos(sessionTopic);
  }, [fetchVideos, session?.id, session?.topic, snapshotReadOnly]);

  useEffect(() => {
    if (snapshotReadOnly) return;
    const sessionId = session?.id;
    const sessionTopic = session?.topic;
    if (!sessionId || !sessionTopic) {
      setPrice(null);
      setPriceLoading(false);
      setPriceCompare(null);
      setPriceCompareLoading(false);
      priceCompareSeqRef.current += 1;
      return;
    }
    void fetchPrice(sessionTopic);
  }, [fetchPrice, session?.id, session?.topic, snapshotReadOnly]);

  useEffect(() => {
    if (snapshotReadOnly) return;
    const sessionTopic = session?.topic;
    const compareTopic = priceCompareTopic;
    if (!sessionTopic || !compareTopic) {
      setPriceCompare(null);
      setPriceCompareLoading(false);
      priceCompareSeqRef.current += 1;
      return;
    }
    if (normalizeTopicKey(sessionTopic) === normalizeTopicKey(compareTopic)) {
      setPriceCompare(null);
      setPriceCompareLoading(false);
      priceCompareSeqRef.current += 1;
      return;
    }
    void fetchComparePrice(sessionTopic, compareTopic);
  }, [fetchComparePrice, priceCompareTopic, session?.id, session?.topic, snapshotReadOnly]);

  useEffect(() => {
    if (snapshotReadOnly) return;
    if (!videoAutoPoll) return;
    const sessionTopic = session?.topic;
    if (!sessionTopic) return;
    const poll = window.setInterval(() => {
      void fetchVideos(sessionTopic);
    }, 5 * 60_000);
    return () => window.clearInterval(poll);
  }, [fetchVideos, session?.topic, snapshotReadOnly, videoAutoPoll]);

  useEffect(() => {
    if (!videos?.items?.length) {
      setActiveVideoId(null);
      return;
    }
    setActiveVideoId((prev) => (prev && videos.items.some((v) => v.id === prev) ? prev : videos.items[0].id));
  }, [videos?.fetchedAt, videos?.topic, videos?.items]);

  const isEmpty = session === null;
  const stepLabel = session ? STEP_LABEL[session.step] : STEP_LABEL.idle;
  const progress = session?.progress ?? 0;
  const hasUserMessage = useMemo(() => messages.some((m) => m.role === 'user'), [messages]);
  const showChatSuggestions = !running && !hasUserMessage;
  const chartLinks = useMemo(() => (session?.topic ? buildExternalChartLinks(session.topic) : null), [session?.topic]);
  const comparePresets = useMemo(() => {
    const key = normalizeTopicKey(session?.topic || '');
    return PRICE_COMPARE_PRESETS.filter((p) => normalizeTopicKey(p.topic) !== key);
  }, [session?.topic]);
  const compareSeries = priceCompare?.series.length ? priceCompare.series : null;
  const compareTimestamps = priceCompare?.timestamps.length ? priceCompare.timestamps : undefined;
  const compareLabel = useMemo(() => {
    if (!priceCompareTopic) return null;
    return priceCompare?.symbol || priceCompareTopic;
  }, [priceCompare?.symbol, priceCompareTopic]);
  const togglePanel = useCallback((k: keyof typeof panelOpen) => {
    setPanelOpen((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);

  const tagOptions = useMemo(() => uniqueTagsFromSession(session), [session]);

  const workspaceGraph = useMemo(() => {
    if (!session) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };

    const baseNodes = session.nodes || [];
    const baseEdges = session.edges || [];
    const { mediaNodes, mediaEdges } = buildMediaGraph({
      topic: session.topic,
      videos: videos || session.videosSnapshot || null,
      evidence: session.evidence || [],
      baseNodes,
    });

    const allNodes = [...baseNodes, ...mediaNodes];
    const allEdges = [...baseEdges, ...mediaEdges];
    if (!selectedTag) return { nodes: allNodes, edges: allEdges };

    const matchEvidenceIds = new Set<string>();
    for (const ev of session.evidence || []) {
      const tags = [
        ...(tapeTagsByEvidenceId.get(ev.id) || []),
        ...(ev.aiSummary?.catalysts || []),
        ...(ev.aiSummary?.entities || []),
      ];
      if (tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase())) {
        matchEvidenceIds.add(ev.id);
      }
    }

    const keptEdges = allEdges.filter((e) => e.evidenceIds.some((id) => matchEvidenceIds.has(id)));
    const keepNodeIds = new Set<string>();
    for (const e of keptEdges) {
      keepNodeIds.add(e.from);
      keepNodeIds.add(e.to);
    }
    const keptNodes = allNodes.filter((n) => keepNodeIds.has(n.id));
    return { nodes: keptNodes, edges: keptEdges };
  }, [selectedTag, session, tapeTagsByEvidenceId, videos]);
  const hasWorkspaceGraph = workspaceGraph.nodes.length > 0;

  const timelineData = useMemo(() => {
    const out = timelineItems.filter((it) => it.kind !== 'step');
    const mediaNodeIds = new Set(
      (workspaceGraph.nodes || [])
        .filter((n) => n.type === 'media')
        .map((n) => n.id),
    );
    const mediaFocusNodeId = mediaNodeIds.values().next().value || null;
    const mediaEvidenceIds = Array.from(
      new Set(
        (workspaceGraph.edges || [])
          .filter((e) => mediaNodeIds.has(e.from) || mediaNodeIds.has(e.to))
          .flatMap((e) => e.evidenceIds || []),
      ),
    ).slice(0, 8);

    if (price?.fetchedAt) {
      out.push({
        id: `tl_price_live_${price.fetchedAt}`,
        ts: price.fetchedAt,
        kind: 'price',
        title: `Price snapshot (${price.provider})`,
        subtitle: price.error || `${price.series.length} points`,
        tags: ['price', price.provider, price.ok ? 'ok' : 'fallback'],
      });
    }
    if (videos?.fetchedAt) {
      out.push({
        id: `tl_videos_live_${videos.fetchedAt}`,
        ts: videos.fetchedAt,
        kind: 'media',
        title: `Video snapshot (${videos.mode})`,
        subtitle: `${videos.items.length} items`,
        tags: ['media', videos.mode],
        nodeId: mediaFocusNodeId || undefined,
        evidenceIds: mediaEvidenceIds.length ? mediaEvidenceIds : undefined,
      });
    }
    return out;
  }, [price, timelineItems, videos, workspaceGraph.edges, workspaceGraph.nodes]);

  const mentionState = useMemo(() => {
    const m = chatInput.match(/@([a-zA-Z0-9_-]*)$/);
    if (!m) return { active: false, query: '', items: [] as string[] };
    const query = (m[1] || '').toLowerCase();
    const nodeIds = (workspaceGraph.nodes || []).map((n) => n.id);
    const evidenceIds = (session?.evidence || []).map((e) => e.id);
    const items = Array.from(new Set([...nodeIds, ...evidenceIds, ...tagOptions]))
      .filter((v) => v.toLowerCase().includes(query))
      .slice(0, 12);
    return { active: true, query, items };
  }, [chatInput, session?.evidence, tagOptions, workspaceGraph.nodes]);

  const renderMessageContent = useCallback(
    (content: string) => {
      const parts = content.split(/(\[[^\]]{1,64}\])/g).filter(Boolean);
      return parts.map((part, idx) => {
        const m = part.match(/^\[([^\]]{1,64})\]$/);
        if (!m) return <span key={`txt_${idx}`}>{part}</span>;
        const token = m[1] || '';
        if (/^ev_[a-z0-9_:-]+$/i.test(token)) {
          return (
            <button
              key={`tok_${idx}`}
              type="button"
              className="mx-0.5 inline-flex rounded-full border border-[rgba(20,184,166,0.4)] bg-[rgba(20,184,166,0.14)] px-2 py-0.5 text-[11px] text-[rgba(170,250,238,0.96)]"
              onClick={() => openEvidence(`Evidence: ${token}`, [token])}
            >
              [{token}]
            </button>
          );
        }
        if (/^n_[a-z0-9_:-]+$/i.test(token)) {
          return (
            <button
              key={`tok_${idx}`}
              type="button"
              className="mx-0.5 inline-flex rounded-full border border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.14)] px-2 py-0.5 text-[11px] text-[rgba(170,209,255,0.96)]"
              onClick={() => {
                setSelectedNodeId(token);
                setSelectedEdgeId(null);
              }}
            >
              [{token}]
            </button>
          );
        }
        return (
          <button
            key={`tok_${idx}`}
            type="button"
            className="mx-0.5 inline-flex rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/72"
            onClick={() => setSelectedTag(token)}
          >
            [{token}]
          </button>
        );
      });
    },
    [openEvidence],
  );

  return (
    <div className="min-h-screen">
      <div className="bg-terminal fixed inset-0 -z-10" />

      <header className="relative z-10">
        <div className="mx-auto max-w-[1520px] px-4 py-3">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(0,102,255,0.16)] via-transparent to-[rgba(255,82,28,0.12)] opacity-70" />
            <div className="relative space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/"
                    className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.03] px-3 text-[11px] font-semibold text-white/68 transition hover:bg-white/[0.06]"
                  >
                    Home
                  </Link>
                  <Link
                    href="/terminal"
                    className="inline-flex h-8 items-center rounded-full border border-[rgba(0,102,255,0.38)] bg-[rgba(0,102,255,0.14)] px-3 text-[11px] font-semibold text-[rgba(174,212,255,0.96)]"
                  >
                    Terminal
                  </Link>
                  <Link
                    href="/dashboard"
                    className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.03] px-3 text-[11px] font-semibold text-white/68 transition hover:bg-white/[0.06]"
                    title="View stored sessions"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/how-it-works"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[11px] font-semibold text-white/68 transition hover:bg-white/[0.06]"
                    title="Architecture and docs"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Architecture
                  </Link>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={rerun}
                  disabled={!session || running}
                  className="h-8 border-white/12 bg-white/[0.03] px-3 text-[11px]"
                >
                  <RefreshCw className={cn('h-4 w-4', running ? 'animate-spin' : '')} />
                  Re-run
                </Button>
                {session && session.step === 'ready' && !running && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={publishing}
                    className="h-8 border-white/12 bg-white/[0.03] px-3 text-[11px]"
                    onClick={async () => {
                      if (!session) return;
                      setPublishing(true);
                      try {
                        const res = await fetch(apiPath('/api/sessions/publish'), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ sessionId: session.id }),
                        });
                        if (!res.ok) throw new Error('Publish failed');
                        const data = await res.json();
                        const fullUrl = `${window.location.origin}${data.url}`;
                        setPublishedUrl(fullUrl);
                        try { await navigator.clipboard.writeText(fullUrl); } catch {}
                        setTimeout(() => setPublishedUrl(null), 4000);
                      } catch {
                        // silent fail
                      } finally {
                        setPublishing(false);
                      }
                    }}
                  >
                    <Share className="h-4 w-4" />
                    {publishedUrl ? 'Copied!' : publishing ? 'Sharing...' : 'Share'}
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/5">
                    <Network className="h-5 w-5 text-white/80" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold tracking-[0.22em] text-white/50">BRIGHT DATA</div>
                    <div className="text-lg font-semibold text-white/90">Market Signal Terminal</div>
                  </div>
                  <div className="hidden items-center gap-2 lg:flex">
                    <div className="h-2 w-2 rounded-full bg-[var(--teal)] shadow-[0_0_0_5px_rgba(20,184,166,0.12)]" />
                    <div className="text-xs text-white/55">Session: {stepLabel}</div>
                  </div>
                </div>

                <div className="w-full space-y-2 lg:w-[min(900px,62vw)]">
                  <form
                    className="flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.035] px-2 py-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (running || !topic.trim()) return;
                      void start(topic).catch(() => undefined);
                    }}
                  >
                    <Input
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="h-10 flex-1 border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder={typedTopicHint || 'Ask a market topic... Bitcoin, NVDA, DXY, oil, CPI'}
                      aria-label="Topic prompt"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      disabled={running || !topic.trim()}
                      className="h-9 w-9 border-white/12 bg-[rgba(0,102,255,0.12)] hover:bg-[rgba(0,102,255,0.18)]"
                      title={running ? 'Running...' : 'Generate'}
                      aria-label={running ? 'Running' : 'Generate'}
                    >
                      {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                  </form>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {TOPIC_QUICK_STARTS.map((example) => (
                        <button
                          key={example}
                          type="button"
                          className="inline-flex h-7 items-center rounded-full border border-white/12 bg-white/[0.03] px-3 text-[11px] text-white/62 transition hover:bg-white/[0.07] hover:text-white/85"
                          onClick={() => setTopic(example)}
                          disabled={running}
                        >
                          {example}
                        </button>
                      ))}
                    </div>

                    <div className="hidden items-center rounded-full border border-white/10 bg-white/[0.03] p-1 text-[11px] text-white/60 sm:flex">
                      <button
                        type="button"
                        className={cn(
                          'rounded-full px-3 py-1 transition',
                          mode === 'fast' ? 'bg-white/10 text-white/80' : 'text-white/55 hover:text-white/75',
                        )}
                        onClick={() => setMode('fast')}
                        disabled={running}
                      >
                        Fast
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'rounded-full px-3 py-1 transition',
                          mode === 'deep' ? 'bg-white/10 text-white/80' : 'text-white/55 hover:text-white/75',
                        )}
                        onClick={() => setMode('deep')}
                        disabled={running}
                      >
                        Deep
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 pt-3">
                <PipelineTimeline
                  step={session?.step ?? 'idle'}
                  progress={progress}
                  mode={runMeta?.mode ?? mode}
                  provider={runMeta?.provider}
                  plan={plan}
                  search={search}
                  evidenceSources={(session?.evidence ?? []).map((e) => e.source)}
                  evidenceCount={session?.evidence.length ?? 0}
                  nodesCount={workspaceGraph.nodes.length}
                  edgesCount={workspaceGraph.edges.length}
                  clustersCount={session?.clusters.length ?? 0}
                  warningsCount={warnings.length}
                  minimal
                  className="mt-0 border-0 bg-transparent px-0 py-0"
                />

                <div className="relative mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-gradient-to-r from-[rgba(0,102,255,0.9)] via-[rgba(255,82,28,0.85)] to-[rgba(20,184,166,0.8)] transition-[width] duration-500"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-white/55">{Math.round(progress * 100)}%</div>
                </div>

                {snapshotMode ? (
                  <div className="mt-2 text-xs text-[rgba(173,212,255,0.9)]">
                    Snapshot loaded from history. No automatic refresh is running.
                  </div>
                ) : null}
                {warnings.length ? (
                  <div className="mt-2 text-xs text-[rgba(255,190,125,0.9)]">
                    {warnings.length} warning{warnings.length === 1 ? '' : 's'}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1520px] px-4 pb-12">
        <div className={cn('grid gap-5', chatPanelOpen ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : 'grid-cols-1')}>
          <div className="min-w-0 space-y-5">
          <Panel
            title="Evidence Workspace"
            hint={
              isEmpty
                ? 'Run a topic, then work directly in Graph / Mind / Flow / Timeline'
                : hasWorkspaceGraph || evidenceView === 'timeline'
                  ? 'Map-first view with linked evidence, media, and timeline filters'
                  : 'Generating workspace graph...'
            }
            icon={<Network className="h-4 w-4" />}
            className="lg:min-h-[68vh]"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setGraphFullscreen(true);
                    setGraphFitSignal((v) => v + 1);
                  }}
                  className="border-white/12 bg-white/[0.03]"
                  disabled={!hasWorkspaceGraph && evidenceView !== 'timeline'}
                >
                  <Maximize2 className="h-4 w-4" />
                  Full
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChatPanelOpen((prev) => !prev)}
                  className="border-white/12 bg-white/[0.03]"
                >
                  {chatPanelOpen ? 'Hide chat' : 'Chat'}
                </Button>
              </div>
            }
          >
            {isEmpty ? (
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-4">
                <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:radial-gradient(circle_at_20%_20%,rgba(0,102,255,0.18),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(255,82,28,0.14),transparent_55%)]" />
                <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:54px_54px]" />
                <div className="relative grid h-[56vh] min-h-[340px] place-items-center">
                  <div className="max-w-sm text-center">
                    <div className="text-sm font-semibold text-white/85">Empty workspace</div>
                    <div className="mt-1 text-xs leading-relaxed text-white/55">
                      Run a topic and the map will include evidence, media links, and timeline points.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <EvidenceViewToggle
                    value={evidenceView}
                    disabled={!hasWorkspaceGraph && evidenceView !== 'timeline'}
                    onChange={(v) => {
                      setEvidenceView(v);
                      if (v === 'graph') setGraphFitSignal((x) => x + 1);
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                      nodes <span className="mono text-white/75">{workspaceGraph.nodes.length}</span>
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                      edges <span className="mono text-white/75">{workspaceGraph.edges.length}</span>
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                      evidence <span className="mono text-white/75">{session.evidence.length}</span>
                    </span>
                  </div>
                </div>

                {tagOptions.length ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[11px] transition',
                        selectedTag ? 'border-white/10 bg-white/[0.03] text-white/65 hover:text-white/85' : 'border-white/15 bg-white/[0.08] text-white/85',
                      )}
                      onClick={() => setSelectedTag(null)}
                    >
                      all
                    </button>
                    {tagOptions.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] transition',
                          selectedTag?.toLowerCase() === tag.toLowerCase()
                            ? 'border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.16)] text-[rgba(170,209,255,0.95)]'
                            : 'border-white/10 bg-white/[0.03] text-white/65 hover:text-white/85',
                        )}
                        onClick={() => setSelectedTag(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : null}

                {snapshotLoading ? (
                  <WorkspaceLoading
                    title="Opening Snapshot"
                    subtitle="Restoring your saved evidence map and timeline exactly as captured."
                  />
                ) : evidenceView === 'timeline' ? (
                  <EvidenceTimeline
                    items={timelineData}
                    selectedTag={selectedTag}
                    onSelectTag={setSelectedTag}
                    onSelectNode={(id) => {
                      setSelectedNodeId(id);
                      setSelectedEdgeId(null);
                    }}
                    onOpenEvidence={(title, evidenceIds) => openEvidence(title, evidenceIds)}
                    viewportClassName="h-[56vh] min-h-[340px]"
                  />
                ) : !hasWorkspaceGraph ? (
                  <WorkspaceLoading
                    title="Building Evidence Map"
                    subtitle="Linking sources, events, assets, and media into a single map workspace."
                    stage={stepLabel}
                  />
                ) : evidenceView === 'graph' ? (
                  <EvidenceGraph
                    nodes={workspaceGraph.nodes}
                    edges={workspaceGraph.edges}
                    selected={{ nodeId: selectedNodeId, edgeId: selectedEdgeId }}
                    onSelectNode={setSelectedNodeId}
                    onSelectEdge={setSelectedEdgeId}
                    fitSignal={graphFitSignal}
                    viewportClassName="h-[56vh] min-h-[340px]"
                  />
                ) : evidenceView === 'mind' ? (
                  <EvidenceMindMap
                    topic={session.topic}
                    nodes={workspaceGraph.nodes}
                    edges={workspaceGraph.edges}
                    selected={{ nodeId: selectedNodeId, edgeId: selectedEdgeId }}
                    onSelectNode={setSelectedNodeId}
                    onSelectEdge={setSelectedEdgeId}
                    viewportClassName="h-[56vh] min-h-[340px]"
                  />
                ) : (
                  <EvidenceFlow
                    nodes={workspaceGraph.nodes}
                    edges={workspaceGraph.edges}
                    selected={{ nodeId: flowFocusNodeId, edgeId: flowFocusEdgeId }}
                    onSelectNode={(id) => {
                      setFlowFocusNodeId(id);
                      setFlowFocusEdgeId(null);
                    }}
                    onSelectEdge={(id) => {
                      setFlowFocusEdgeId(id);
                      if (id) setFlowFocusNodeId(null);
                    }}
                    onInspectNode={(id) => {
                      setSelectedNodeId(id);
                      setSelectedEdgeId(null);
                    }}
                    viewportClassName="h-[56vh] min-h-[340px]"
                  />
                )}
              </div>
            )}
          </Panel>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06]"
              onClick={() => togglePanel('tape')}
            >
              {panelOpen.tape ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Breaking Tape
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06]"
              onClick={() => togglePanel('sources')}
            >
              {panelOpen.sources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Sources
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06]"
              onClick={() => togglePanel('narratives')}
            >
              {panelOpen.narratives ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Narratives
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06]"
              onClick={() => togglePanel('price')}
            >
              {panelOpen.price ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Price Context
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06]"
              onClick={() => togglePanel('media')}
            >
              {panelOpen.media ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Media
            </button>
          </div>

          {panelOpen.tape ? (
            <Panel title="Breaking Tape" hint="Evidence-linked headlines" icon={<Activity className="h-4 w-4" />}>
              {isEmpty ? (
                <div className="space-y-3">
                  <EmptyCard label="Tape feed" />
                  <EmptyCard label="Catalyst tags" />
                </div>
              ) : session.tape.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                  No tape items yet.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge tone="teal" className="mono">headlines {tapeStats.headlineCount}</Badge>
                    <Badge className="mono">sources {tapeStats.uniqueSourceCount}</Badge>
                    <Badge className="mono">evidence {tapeStats.evidenceCount}</Badge>
                  </div>
                  <div className="max-h-[320px] overflow-auto pr-1">
                    <div className="space-y-2">
                      {session.tape.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="w-full rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-2 text-left transition hover:bg-white/[0.06]"
                          onClick={() => openEvidence(`Tape: ${t.title}`, [t.evidenceId])}
                        >
                          <div className="text-sm font-semibold text-white/86">{t.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                            <Badge className="mono">{t.source}</Badge>
                            {t.tags.slice(0, 4).map((tag) => (
                              <Badge key={`${t.id}_${tag}`} tone={toneForTag(tag)} className="mono">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          ) : null}

          {panelOpen.sources ? (
            <Panel title="Sources" hint="Domains used in this run" icon={<Globe className="h-4 w-4" />}>
              {isEmpty ? (
                <div className="space-y-3">
                  <EmptyCard label="Domains" />
                </div>
              ) : sourceStats.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                  No sources found.
                </div>
              ) : (
                <div className="max-h-[320px] overflow-auto pr-1">
                  <div className="space-y-2">
                    {sourceStats.map((s) => (
                      <button
                        key={s.source}
                        type="button"
                        className="w-full rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-2 text-left transition hover:bg-white/[0.06]"
                        onClick={() => {
                          const ids = (session?.evidence ?? []).filter((e) => e.source === s.source).map((e) => e.id);
                          openEvidence(`Source: ${s.source}`, ids);
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-white/86">{s.source}</div>
                          <div className="text-[11px] text-white/45 mono">{s.count}</div>
                        </div>
                        <div className="mt-1 text-[11px] text-white/55">
                          {s.latestKind === 'published' ? 'Published' : 'Observed'} {formatTime(s.latestAt)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          ) : null}

          {panelOpen.narratives ? (
            <Panel title="Narratives" hint="Story clusters and momentum" icon={<BookOpen className="h-4 w-4" />}>
              {isEmpty ? (
                <div className="space-y-3">
                  <EmptyCard label="Cluster map" />
                </div>
              ) : session.clusters.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                  No narrative clusters produced yet.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge tone="orange" className="mono">clusters {narrativeStats.count}</Badge>
                    {narrativeStats.rising ? <Badge tone="teal" className="mono">rising {narrativeStats.rising}</Badge> : null}
                    {narrativeStats.steady ? <Badge tone="orange" className="mono">steady {narrativeStats.steady}</Badge> : null}
                    {narrativeStats.fading ? <Badge className="mono">fading {narrativeStats.fading}</Badge> : null}
                  </div>
                  <div className="max-h-[320px] overflow-auto pr-1">
                    <div className="space-y-2">
                      {session.clusters.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-2 text-left transition hover:bg-white/[0.06]"
                          onClick={() => openEvidence(`Narrative: ${c.title}`, c.evidenceIds)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-white/86">{c.title}</div>
                            <Badge
                              tone={c.momentum === 'rising' ? 'teal' : c.momentum === 'steady' ? 'orange' : 'neutral'}
                              className="capitalize"
                            >
                              {c.momentum}
                            </Badge>
                          </div>
                          <div className="mt-1 text-sm text-white/65">{c.summary}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          ) : null}

          {panelOpen.price ? (
            <Panel
              title="Price Context"
              hint={priceScaleMode === 'indexed' ? 'Indexed mode (start = 100)' : 'Price mode'}
              icon={<Activity className="h-4 w-4" />}
              actions={
                session ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {price ? <Badge tone={price.ok ? 'teal' : 'neutral'}>{price.ok ? 'LIVE' : 'FALLBACK'}</Badge> : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void fetchPrice(session.topic);
                        if (priceCompareTopic) void fetchComparePrice(session.topic, priceCompareTopic);
                      }}
                      disabled={priceLoading || (Boolean(priceCompareTopic) && priceCompareLoading)}
                      className="border-white/12 bg-white/[0.03]"
                    >
                      <RefreshCw className={cn('h-4 w-4', priceLoading || priceCompareLoading ? 'animate-spin' : '')} />
                      Refresh
                    </Button>
                  </div>
                ) : null
              }
            >
              {isEmpty || !session ? (
                <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                  Run a topic to render price context.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-sm font-semibold text-white/88">
                      {price?.ok ? `${price.symbol || session.topic} (USD)` : `${session.topic} (proxy)`}
                    </div>
                    <div className="text-xs text-white/55">
                      last{' '}
                      <span className="mono text-white/80">
                        {session.series.length ? formatSparkValue(session.series[session.series.length - 1]!, 'price') : 'n/a'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-white/45">Scale</span>
                    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] p-1">
                      <button
                        type="button"
                        className={cn(
                          'rounded-full px-3 py-1 transition',
                          priceScaleMode === 'price' ? 'bg-white/10 text-white/85' : 'text-white/55 hover:text-white/75',
                        )}
                        onClick={() => setPriceScaleMode('price')}
                      >
                        Price
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'rounded-full px-3 py-1 transition',
                          priceScaleMode === 'indexed' ? 'bg-white/10 text-white/85' : 'text-white/55 hover:text-white/75',
                        )}
                        onClick={() => setPriceScaleMode('indexed')}
                      >
                        Indexed
                      </button>
                    </div>
                    <span className="ml-2 text-white/45">Compare</span>
                    {comparePresets.map((preset) => {
                      const selected = normalizeTopicKey(priceCompareTopic || '') === normalizeTopicKey(preset.topic);
                      return (
                        <button
                          key={preset.topic}
                          type="button"
                          className={cn(
                            'rounded-full border px-2.5 py-1 transition',
                            selected
                              ? 'border-[rgba(255,188,92,0.45)] bg-[rgba(255,188,92,0.15)] text-[rgba(255,214,158,0.95)]'
                              : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white/80',
                          )}
                          onClick={() =>
                            setPriceCompareTopic((prev) =>
                              normalizeTopicKey(prev || '') === normalizeTopicKey(preset.topic) ? null : preset.topic,
                            )
                          }
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                    {priceCompareTopic ? (
                      <button
                        type="button"
                        className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-white/60 transition hover:text-white/80"
                        onClick={() => setPriceCompareTopic(null)}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <Sparkline
                    values={session.series}
                    timestamps={session.seriesTs}
                    markers={session.evidence.map((ev) => ({ ts: ev.publishedAt, label: ev.title, tone: 'teal' }))}
                    compareValues={compareSeries || undefined}
                    compareTimestamps={compareTimestamps}
                    compareLabel={compareLabel || undefined}
                    scaleMode={priceScaleMode}
                  />
                  {chartLinks ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <a
                        href={chartLinks.tradingView}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.03] px-3 text-white/75 transition hover:bg-white/[0.08] hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        TradingView
                      </a>
                      <a
                        href={chartLinks.google}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.03] px-3 text-white/75 transition hover:bg-white/[0.08] hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Google
                      </a>
                    </div>
                  ) : null}
                </div>
              )}
            </Panel>
          ) : null}

          {panelOpen.media ? (
            <Panel
              title="Media"
              hint={videoAutoPoll ? 'Auto-polling every 5m' : 'Manual refresh'}
              icon={<Video className="h-4 w-4" />}
              actions={
                session ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="hidden items-center rounded-full border border-white/10 bg-white/[0.03] p-1 text-[11px] text-white/60 sm:flex">
                      <button
                        type="button"
                        className={cn(
                          'rounded-full px-3 py-1 transition',
                          videoAutoPoll ? 'text-white/55 hover:text-white/75' : 'bg-white/10 text-white/80',
                        )}
                        onClick={() => setVideoAutoPoll(false)}
                      >
                        Manual
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'rounded-full px-3 py-1 transition',
                          videoAutoPoll ? 'bg-white/10 text-white/80' : 'text-white/55 hover:text-white/75',
                        )}
                        onClick={() => setVideoAutoPoll(true)}
                      >
                        Auto
                      </button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/12 bg-white/[0.03]"
                      onClick={() => fetchVideos(session.topic)}
                      disabled={videosLoading}
                    >
                      <RefreshCw className={cn('h-4 w-4', videosLoading ? 'animate-spin' : '')} />
                      Refresh
                    </Button>
                  </div>
                ) : null
              }
            >
              {!session ? (
                <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                  Run a topic to load videos.
                </div>
              ) : !videos ? (
                videosLoading ? (
                  <div className="space-y-2">
                    <div className="h-20 rounded-2xl bg-white/[0.03] shimmer" />
                    <div className="h-20 rounded-2xl bg-white/[0.03] shimmer" />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                    No videos loaded yet.
                  </div>
                )
              ) : videos.items.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                  No videos found for this topic.
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const active = videos.items.find((v) => v.id === activeVideoId) ?? videos.items[0];
                    const id = active ? extractYouTubeId(active.url) : null;
                    if (!id) return null;
                    return (
                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                        <div className="aspect-video w-full">
                          <iframe
                            className="h-full w-full"
                            src={`https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`}
                            title="Video Pulse"
                            loading="lazy"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                          />
                        </div>
                      </div>
                    );
                  })()}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {videos.items.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={cn(
                          'group flex items-center gap-3 rounded-2xl border border-white/10 bg-[var(--panel-2)] p-2 text-left transition hover:bg-white/[0.06]',
                          activeVideoId === v.id ? 'border-white/20 bg-white/[0.06]' : '',
                        )}
                        onClick={() => setActiveVideoId(v.id)}
                      >
                        {v.thumbnail ? (
                          <img
                            src={v.thumbnail}
                            alt=""
                            className="h-16 w-28 shrink-0 rounded-xl border border-white/10 bg-white/[0.03] object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(0,102,255,0.24),rgba(255,82,28,0.18),rgba(20,184,166,0.14))]">
                            <div className="mono text-xs font-semibold text-white/85">VIDEO</div>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold leading-snug text-white/86">{v.title}</div>
                          <div className="mt-1 text-xs text-white/50">{v.channel}</div>
                          <div className="mt-1">
                            <a
                              href={v.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[11px] text-[rgba(153,197,255,0.9)] underline underline-offset-4"
                            >
                              Open source
                            </a>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          ) : null}
          </div>

          {chatPanelOpen ? (
            <Panel
              title="Chat"
              hint={chatMode === 'fetch' ? 'Fetch mode runs a new session' : 'Explain mode uses saved session context'}
              icon={<Search className="h-4 w-4" />}
              actions={
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] p-1 text-[11px] text-white/60">
                    <button
                      type="button"
                      className={cn(
                        'rounded-full px-3 py-1 transition',
                        chatMode === 'fetch' ? 'bg-white/10 text-white/80' : 'text-white/55 hover:text-white/75',
                      )}
                      onClick={() => setChatMode('fetch')}
                      disabled={running}
                    >
                      Fetch
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'rounded-full px-3 py-1 transition',
                        chatMode === 'explain' ? 'bg-white/10 text-white/80' : 'text-white/55 hover:text-white/75',
                      )}
                      onClick={() => setChatMode('explain')}
                      disabled={!session || !isUuid(session.id)}
                    >
                      Explain
                    </button>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setChatPanelOpen(false)} aria-label="Close chat panel">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              }
            >
              <div className="flex h-[64vh] min-h-[420px] flex-col xl:h-[calc(100vh-230px)]">
                {session ? (
                  <div className="mb-3">
                    {running || session.step !== 'ready' || warnings.length > 0 ? (
                      <ActivityCard
                        step={session?.step ?? 'idle'}
                        progress={session?.progress ?? 0}
                        mode={runMeta?.mode ?? mode}
                        provider={runMeta?.provider ?? 'ai'}
                        running={running}
                        plan={plan}
                        search={search}
                        queryQueue={queryQueue}
                        scrapeQueue={scrapeQueue}
                        evidenceSources={(session?.evidence ?? []).map((e) => e.source)}
                        evidenceCount={session?.evidence?.length ?? 0}
                        summariesCount={summariesCount}
                        nodesCount={workspaceGraph.nodes.length}
                        edgesCount={workspaceGraph.edges.length}
                        clustersCount={session?.clusters?.length ?? 0}
                        warningsCount={warnings.length}
                        graphVariant={graphVariant}
                      />
                    ) : null}
                  </div>
                ) : null}

                <div className="flex-1 overflow-auto pr-1">
                  <div className="space-y-3">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          'rounded-2xl border border-white/10 px-3 py-2 text-sm leading-relaxed',
                          m.role === 'user' ? 'bg-white/[0.05] text-white/82' : 'bg-black/25 text-white/72',
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between text-[10px] text-white/45">
                          <span className="uppercase tracking-[0.22em]">{m.role}</span>
                          <span className="mono">{formatTime(m.createdAt)}</span>
                        </div>
                        {renderMessageContent(m.content)}
                      </div>
                    ))}
                  </div>
                </div>

                {showChatSuggestions ? (
                  <div className="mt-3">
                    <div className="text-[11px] font-semibold tracking-[0.2em] text-white/45">QUICK PROMPTS</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CHAT_SUGGESTIONS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06] hover:text-white/80"
                          onClick={() => runChat(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <form
                  className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (chatMode === 'explain' && session && isUuid(session.id)) {
                      void askWithContext(chatInput);
                    } else {
                      runChat(chatInput);
                    }
                  }}
                >
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Use @ for node/evidence/tag references"
                    className="flex-1 border-white/10 bg-white/[0.02]"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="border-white/12 bg-[rgba(255,82,28,0.10)] hover:bg-[rgba(255,82,28,0.15)]"
                    disabled={!chatInput.trim()}
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>

                {mentionState.active && mentionState.items.length ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-2">
                    <div className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-white/45">REFERENCES</div>
                    <div className="flex flex-wrap gap-2">
                      {mentionState.items.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70 transition hover:bg-white/[0.06] hover:text-white/85"
                          onClick={() => setChatInput((prev) => prev.replace(/@([a-zA-Z0-9_-]*)$/, `@${item} `))}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </main>

      <Drawer
        open={drawerOpen}
        title={drawerTitle}
        onClose={() => setDrawerOpen(false)}
      >
        {drawerEvidence.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
            No evidence selected yet.
          </div>
        ) : (
          <div className="space-y-3">
            {drawerNote ? (
              <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3 text-sm text-white/70">
                <div className="text-[11px] font-semibold tracking-[0.18em] text-white/50">WHY THIS LINK</div>
                <div className="mt-1 leading-relaxed">{drawerNote}</div>
              </div>
            ) : null}
            {drawerEvidence.map((ev) => (
              <div key={ev.id} className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-white/86">{ev.title}</div>
                  <div className="text-[11px] text-white/45 mono">
                    {ev.timeKind === 'published' ? 'Published' : 'Seen'} {formatTime(ev.publishedAt)}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-white/50">
                  {ev.source}
                  {ev.language ? ` · ${ev.language.toUpperCase()}` : ''}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5">ARTICLE</span>
                  <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-white/50">
                    {ev.excerptSource === 'markdown' ? 'Bright Data markdown' : 'SERP snippet'}
                  </span>
                </div>
                {(() => {
                  const tapeTags = tapeTagsByEvidenceId.get(ev.id) || [];
                  const catalysts = (ev.aiSummary?.catalysts || []).slice(0, 3);
                  const entities = (ev.aiSummary?.entities || []).slice(0, 2);
                  const tags = tapeTags.slice(0, 4);
                  if (!tags.length && !catalysts.length && !entities.length) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <Badge key={`${ev.id}_t_${tag}`} tone={toneForTag(tag)} className="mono">
                          {tag}
                        </Badge>
                      ))}
                      {catalysts.map((c) => (
                        <Badge key={`${ev.id}_c_${c}`} tone="teal" className="mono">
                          {c}
                        </Badge>
                      ))}
                      {entities.map((c) => (
                        <Badge key={`${ev.id}_e_${c}`} tone="neutral" className="mono text-white/70">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  );
                })()}
                {(() => {
                  const excerpt = ev.excerpt ? sanitizeExcerpt(ev.excerpt) : '';
                  return excerpt ? <div className="mt-2 text-sm leading-relaxed text-white/72">{excerpt}</div> : null;
                })()}

                {ev.aiSummary?.bullets?.length ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold tracking-[0.18em] text-white/55">AI SUMMARY</div>
                      {typeof ev.aiSummary.confidence === 'number' ? (
                        <div className="text-[11px] text-white/45 mono">
                          conf {Math.round(ev.aiSummary.confidence * 100)}%
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-white/75">
                      {ev.aiSummary.bullets.slice(0, 5).map((b, idx) => (
                        <div key={`${ev.id}_b_${idx}`} className="flex gap-2">
                          <span className="text-white/35">-</span>
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                    {(ev.aiSummary.catalysts?.length || ev.aiSummary.entities?.length) ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/55">
                        {(ev.aiSummary.catalysts || []).slice(0, 6).map((c) => (
                          <span key={`${ev.id}_c_${c}`} className="rounded-full bg-white/[0.04] px-2.5 py-1">
                            {c}
                          </span>
                        ))}
                        {(ev.aiSummary.entities || []).slice(0, 6).map((c) => (
                          <span key={`${ev.id}_e_${c}`} className="rounded-full bg-white/[0.03] px-2.5 py-1 text-white/50">
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-[rgba(153,197,255,0.9)] hover:text-white underline underline-offset-4"
                  >
                    Open source
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Copy source link"
                    onClick={async () => {
                      const ok = await copyToClipboard(ev.url);
                      if (ok) setCopiedKey(`ev.url.${ev.id}`);
                    }}
                  >
                    <Copy className={cn('h-3.5 w-3.5', copiedKey === `ev.url.${ev.id}` ? 'text-white/85' : 'text-white/55')} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <Drawer
        open={traceOpen}
        title="Run Trace"
        subtitle="Stored pipeline events (Convex)"
        onClose={() => setTraceOpen(false)}
      >
        {!session ? (
          <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
            Run a topic to generate a trace.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white/90 mono">{session.id}</div>
                <div className="mt-0.5 text-[11px] text-white/45">
                  {session.topic} · {runMeta?.mode ?? mode} · {runMeta?.provider ?? 'ai'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/12 bg-white/[0.03]"
                  onClick={async () => {
                    const ok = await copyToClipboard(session.id);
                    if (ok) setCopiedKey('trace.session');
                  }}
                  disabled={!isUuid(session.id)}
                >
                  <Copy className="h-4 w-4" />
                  {copiedKey === 'trace.session' ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/12 bg-white/[0.03]"
                  onClick={() => void fetchTrace(session.id)}
                  disabled={traceLoading || !isUuid(session.id)}
                >
                  <RefreshCw className={cn('h-4 w-4', traceLoading ? 'animate-spin' : '')} />
                  Refresh
                </Button>
              </div>
            </div>

            {traceError ? (
              <div className="rounded-2xl border border-white/10 bg-[rgba(255,82,28,0.08)] px-3 py-2 text-xs text-white/70">
                {traceError}
              </div>
            ) : null}

            {!isUuid(session.id) ? (
              <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                Waiting for server session id…
              </div>
            ) : traceLoading && !trace ? (
              <div className="space-y-2">
                <div className="h-12 rounded-2xl bg-white/[0.03] shimmer" />
                <div className="h-12 rounded-2xl bg-white/[0.03] shimmer" />
                <div className="h-12 rounded-2xl bg-white/[0.03] shimmer" />
              </div>
            ) : !trace ? (
              <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                No stored trace yet. Click refresh, or finish the run and refresh again.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-white/45">
                  <span>
                    Stored:{' '}
                    <span className="mono text-white/70">{new Date(trace.session.created_at).toLocaleTimeString()}</span>
                  </span>
                  <span className="mono">{trace.events.length} events</span>
                </div>

                <div className="max-h-[62vh] overflow-auto rounded-2xl border border-white/10 bg-[var(--panel-2)] p-2">
                  <div className="space-y-2">
                    {trace.events.map((ev) => {
                      const summary = (() => {
                        const p = ev.payload;
                        if (ev.type === 'step') return `${p?.step ?? 'step'} · ${Math.round((p?.progress ?? 0) * 100)}%`;
                        if (ev.type === 'plan') return `${(p?.queries?.length ?? 0)} queries`;
                        if (ev.type === 'search.partial') return `${p?.query ?? 'query'} · ${p?.found ?? 0} found`;
                        if (ev.type === 'search') return `${(p?.results?.length ?? 0)} results`;
                        if (ev.type === 'evidence') return `${(p?.items?.length ?? 0)} evidence`;
                        if (ev.type === 'tape') return `${(p?.items?.length ?? 0)} tape items`;
                        if (ev.type === 'graph') return `${(p?.nodes?.length ?? 0)} nodes · ${(p?.edges?.length ?? 0)} edges`;
                        if (ev.type === 'clusters') return `${(p?.items?.length ?? 0)} clusters`;
                        if (ev.type === 'ai.usage') {
                          const tag = String(p?.tag || 'ai');
                          const total = Number(p?.total_tokens ?? 0);
                          const model = String(p?.model || '');
                          return `${tag} · ${total} tok${model ? ` · ${model}` : ''}`;
                        }
                        if (ev.type === 'warn' || ev.type === 'error') return String(p?.message || '').slice(0, 140);
                        if (ev.type === 'message') return String(p?.content || '').slice(0, 140);
                        if (ev.type === 'done') return 'done';
                        return '';
                      })();

                      return (
                        <div key={ev.id} className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="mono text-[11px] font-semibold text-white/70">{ev.type}</div>
                              {summary ? (
                                <div className="mt-1 truncate text-sm text-white/80">{summary}</div>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[11px] text-white/45 mono">{new Date(ev.created_at).toLocaleTimeString()}</div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="mt-1 h-7 w-7"
                                aria-label="Copy event payload"
                                onClick={async () => {
                                  const text = JSON.stringify({ type: ev.type, payload: ev.payload }, null, 2);
                                  const ok = await copyToClipboard(text);
                                  if (ok) setCopiedKey(`trace.ev.${ev.id}`);
                                }}
                              >
                                <Copy className={cn('h-3.5 w-3.5', copiedKey === `trace.ev.${ev.id}` ? 'text-white/85' : 'text-white/55')} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={graphFullscreen}
        title={session ? `Evidence Map: ${session.topic}` : 'Evidence Map'}
        hint="Fullscreen map with pinned inspector. Escape closes."
        onClose={() => setGraphFullscreen(false)}
        actions={
          <>
            {session && (hasWorkspaceGraph || evidenceView === 'timeline') ? (
              <EvidenceViewToggle
                value={evidenceView}
                onChange={(v) => {
                  setEvidenceView(v);
                  if (v === 'graph') setGraphFitSignal((x) => x + 1);
                }}
              />
            ) : null}
            {evidenceView === 'graph' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGraphFitSignal((v) => v + 1)}
                className="border-white/12 bg-white/[0.03]"
                disabled={!hasWorkspaceGraph}
              >
                Fit
              </Button>
            ) : null}
          </>
        }
        className="bg-[#050913]/96"
      >
        <div className="grid h-full gap-4 lg:grid-cols-[1fr_420px]">
          <div className="h-full overflow-hidden rounded-3xl border border-white/10 bg-black/25">
            {session && (hasWorkspaceGraph || evidenceView === 'timeline') ? (
              evidenceView === 'timeline' ? (
                <EvidenceTimeline
                  items={timelineData}
                  selectedTag={selectedTag}
                  onSelectTag={setSelectedTag}
                  onSelectNode={(id) => {
                    setSelectedNodeId(id);
                    setSelectedEdgeId(null);
                  }}
                  onOpenEvidence={(title, evidenceIds) => openEvidence(title, evidenceIds)}
                  viewportClassName="h-[min(62vh,760px)] lg:h-[calc(100vh-220px)]"
                  className="h-full rounded-none border-0 bg-transparent"
                />
              ) : evidenceView === 'graph' ? (
                <EvidenceGraph
                  nodes={workspaceGraph.nodes}
                  edges={workspaceGraph.edges}
                  selected={{ nodeId: selectedNodeId, edgeId: selectedEdgeId }}
                  onSelectNode={setSelectedNodeId}
                  onSelectEdge={setSelectedEdgeId}
                  viewportClassName="h-[min(62vh,760px)] lg:h-[calc(100vh-220px)]"
                  fitSignal={graphFitSignal}
                  className="h-full rounded-none border-0 bg-transparent"
                />
              ) : evidenceView === 'mind' ? (
                <EvidenceMindMap
                  topic={session.topic}
                  nodes={workspaceGraph.nodes}
                  edges={workspaceGraph.edges}
                  selected={{ nodeId: selectedNodeId, edgeId: selectedEdgeId }}
                  onSelectNode={setSelectedNodeId}
                  onSelectEdge={setSelectedEdgeId}
                  viewportClassName="h-[min(62vh,760px)] lg:h-[calc(100vh-220px)]"
                  className="h-full rounded-none border-0 bg-transparent"
                />
              ) : (
                <EvidenceFlow
                  nodes={workspaceGraph.nodes}
                  edges={workspaceGraph.edges}
                  selected={{ nodeId: flowFocusNodeId, edgeId: flowFocusEdgeId }}
                  onSelectNode={(id) => {
                    setFlowFocusNodeId(id);
                    setFlowFocusEdgeId(null);
                  }}
                  onSelectEdge={(id) => {
                    setFlowFocusEdgeId(id);
                    if (id) setFlowFocusNodeId(null);
                  }}
                  onInspectNode={(id) => {
                    setSelectedNodeId(id);
                    setSelectedEdgeId(null);
                  }}
                  viewportClassName="h-[min(62vh,760px)] lg:h-[calc(100vh-220px)]"
                  className="h-full rounded-none border-0 bg-transparent"
                />
              )
            ) : (
              <div className="grid h-[min(62vh,760px)] place-items-center text-sm text-white/60">
                Run a topic to generate the map.
              </div>
            )}
          </div>

          <div className="h-full overflow-hidden rounded-3xl border border-white/10 bg-[var(--panel)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 lg:px-5 lg:py-4">
              <div>
                <div className="text-sm font-semibold text-white/90">Inspector</div>
                <div className="mt-0.5 text-[11px] text-white/45">Click nodes/edges to load evidence here.</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-white/12 bg-white/[0.03]"
                disabled={!session || !isUuid(session.id) || drawerEvidence.length === 0}
                onClick={() => {
                  const ids = drawerEvidence.map((e) => e.id).filter(Boolean);
                  void askWithContext(`Explain what this selection implies for ${session?.topic || topic}. What should I watch next?`, {
                    focusEvidenceIds: ids,
                  });
                }}
              >
                Ask AI
              </Button>
            </div>
            <div className="h-[calc(100%-56px)] overflow-auto px-4 py-3 lg:px-5 lg:py-4">
                  {drawerEvidence.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                      Nothing selected yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-white/70">{drawerTitle}</div>
                      {drawerEvidence.map((ev) => (
                        <div key={ev.id} className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-white/86">{ev.title}</div>
                            <div className="text-[11px] text-white/45 mono">
                              {ev.timeKind === 'published' ? 'Published' : 'Seen'} {formatTime(ev.publishedAt)}
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] text-white/50">
                            {ev.source}
                            {ev.language ? ` · ${ev.language.toUpperCase()}` : ''}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5">ARTICLE</span>
                            <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-white/50">
                              {ev.excerptSource === 'markdown' ? 'Bright Data markdown' : 'SERP snippet'}
                            </span>
                          </div>
                          {(() => {
                            const tapeTags = tapeTagsByEvidenceId.get(ev.id) || [];
                            const catalysts = (ev.aiSummary?.catalysts || []).slice(0, 3);
                            const entities = (ev.aiSummary?.entities || []).slice(0, 2);
                            const tags = tapeTags.slice(0, 4);
                            if (!tags.length && !catalysts.length && !entities.length) return null;
                            return (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                  <Badge key={`${ev.id}_t_fs_${tag}`} tone={toneForTag(tag)} className="mono">
                                    {tag}
                                  </Badge>
                                ))}
                                {catalysts.map((c) => (
                                  <Badge key={`${ev.id}_c_fs_${c}`} tone="teal" className="mono">
                                    {c}
                                  </Badge>
                                ))}
                                {entities.map((c) => (
                                  <Badge key={`${ev.id}_e_fs_${c}`} tone="neutral" className="mono text-white/70">
                                    {c}
                                  </Badge>
                                ))}
                              </div>
                            );
                          })()}
                          {ev.excerpt ? (
                            <div className="mt-2 text-sm leading-relaxed text-white/72">{sanitizeExcerpt(ev.excerpt)}</div>
                          ) : null}
                          {ev.aiSummary?.bullets?.length ? (
                            <div className="mt-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs font-semibold tracking-[0.18em] text-white/55">AI SUMMARY</div>
                                {typeof ev.aiSummary.confidence === 'number' ? (
                                  <div className="text-[11px] text-white/45 mono">
                                    conf {Math.round(ev.aiSummary.confidence * 100)}%
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-2 space-y-1 text-sm text-white/75">
                                {ev.aiSummary.bullets.slice(0, 5).map((b, idx) => (
                                  <div key={`${ev.id}_b_fs_${idx}`} className="flex gap-2">
                                    <span className="text-white/35">-</span>
                                    <span>{b}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-2 flex items-center gap-2">
                            <a
                              href={ev.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block text-xs text-[rgba(153,197,255,0.9)] hover:text-white underline underline-offset-4"
                            >
                              Open source
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Copy source link"
                              onClick={async () => {
                                const ok = await copyToClipboard(ev.url);
                                if (ok) setCopiedKey(`ev.url.fs.${ev.id}`);
                              }}
                            >
                              <Copy className={cn('h-3.5 w-3.5', copiedKey === `ev.url.fs.${ev.id}` ? 'text-white/85' : 'text-white/55')} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
