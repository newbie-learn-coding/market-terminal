'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { cn, apiPath } from '@/lib/utils';
import { PipelineTimeline, type PipelineStep, type PlanEvent, type SearchEvent } from '@/components/terminal/PipelineTimeline';
import type { QueryQueueItem, ScrapeQueueItem } from '@/components/terminal/ActivityCard';
import type { EvidenceView } from '@/components/terminal/EvidenceViewToggle';
import type { GraphEdge, GraphNode } from '@/components/terminal/types';
import type { TimelineItem } from '@/components/terminal/EvidenceTimeline';
import { TerminalHeader } from '@/components/terminal/TerminalHeader';
import { TerminalSearchBar } from '@/components/terminal/TerminalSearchBar';
import { WorkspacePanel } from '@/components/terminal/WorkspacePanel';
import { TapePanel } from '@/components/terminal/TapePanel';
import { SourcesPanel } from '@/components/terminal/SourcesPanel';
import { NarrativesPanel } from '@/components/terminal/NarrativesPanel';
import { PricePanel } from '@/components/terminal/PricePanel';
import { MediaPanel } from '@/components/terminal/MediaPanel';
import { ChatPanel } from '@/components/terminal/ChatPanel';
import { EvidenceDrawer, TraceDrawer, FullscreenModal } from '@/components/terminal/EvidenceModal';

/* ── Types ────────────────────────────────────────────────────────── */

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

type PriceScaleMode = 'price' | 'indexed';

/* ── Constants ────────────────────────────────────────────────────── */

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

const TOPIC_TYPED_EXAMPLES = [
  'Why is BTC down today? Map catalysts in the last 6 hours.',
  'NVDA move after earnings: what are the strongest evidence links?',
  'Oil, DXY, and rates: what changed since market open?',
  'Gold vs Bitcoin today: show competing explanations with sources.',
  'Show macro headlines driving crypto sentiment right now.',
] as const;

const LAST_ACTIVE_SESSION_KEY = 'market_terminal:last_session_id';

/* ── Utility functions ────────────────────────────────────────────── */

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

function normalizeToken(raw: string) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
    if (line.startsWith('event:')) { event = line.slice('event:'.length).trim() || 'message'; continue; }
    if (line.startsWith('data:')) { dataLines.push(line.slice('data:'.length).trim()); }
  }
  const dataText = dataLines.join('\n');
  if (!dataText) return null;
  try { return { event, data: JSON.parse(dataText) }; } catch { return { event, data: dataText }; }
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error || '');
  return /abort|unmount/i.test(message);
}

async function consumeSseStream({ response, signal, onEvent }: {
  response: Response; signal: AbortSignal; onEvent: (event: string, data: any) => void;
}) {
  if (!response.body) throw new Error('Missing response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    if (signal.aborted) break;
    let value: Uint8Array | undefined;
    let done = false;
    try { const next = await reader.read(); value = next.value; done = next.done; } catch (e) { if (signal.aborted || isAbortError(e)) break; throw e; }
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

function buildSeries(startAt: number): { y: number[]; t: number[] } {
  const points = 120;
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

function buildMediaGraph({ topic, videos, evidence, baseNodes }: {
  topic: string; videos: VideosResponse | null; evidence: EvidenceItem[]; baseNodes: GraphNode[];
}): { mediaNodes: GraphNode[]; mediaEdges: GraphEdge[] } {
  const items = videos?.items || [];
  if (!items.length || !evidence.length) return { mediaNodes: [], mediaEdges: [] };
  const assetId = baseNodes.find((n) => n.type === 'asset')?.id || `n_${topic.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'asset'}`;
  const mediaNodes: GraphNode[] = [];
  const mediaEdges: GraphEdge[] = [];
  for (const v of items.slice(0, 8)) {
    const nodeId = `n_media_${String(v.id || '').slice(0, 20)}`;
    mediaNodes.push({ id: nodeId, type: 'media', label: v.title.slice(0, 42), meta: { provider: 'youtube', kind: 'video', url: v.url } });
    const ranked = evidence.map((ev) => ({ ev, score: Math.max(overlapScore(v.title, ev.title), overlapScore(v.title, ev.excerpt || ''), overlapScore(v.channel, ev.source)) })).sort((a, b) => b.score - a.score).slice(0, 2);
    const linkedEvidence = ranked.filter((r) => r.score > 0).map((r) => r.ev.id);
    const fallbackEvidence = evidence[0]?.id ? [evidence[0].id] : [];
    const eids = linkedEvidence.length ? linkedEvidence : fallbackEvidence;
    mediaEdges.push({ id: `e_media_${String(v.id || '').slice(0, 20)}_asset`, from: nodeId, to: assetId, type: 'same_story', confidence: linkedEvidence.length ? 0.44 : 0.2, evidenceIds: eids, rationale: linkedEvidence.length ? 'Video headline overlaps with evidence headlines.' : 'Related market video captured for this run.' });
  }
  return { mediaNodes, mediaEdges };
}

function uniqueTagsFromSession(session: Session | null): string[] {
  if (!session) return [];
  const tags = new Set<string>();
  for (const t of session.tape || []) { for (const raw of t.tags || []) { const v = String(raw || '').trim(); if (v) tags.add(v); } }
  for (const e of session.evidence || []) { for (const raw of e.aiSummary?.catalysts || []) { const v = String(raw || '').trim(); if (v) tags.add(v); } }
  return Array.from(tags).slice(0, 22);
}

/* ── Main Component ───────────────────────────────────────────────── */

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
  const [panelOpen, setPanelOpen] = useState({ tape: false, sources: false, narratives: false, price: false, media: false });

  const [debugBrowserLogs, setDebugBrowserLogs] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMode, setChatMode] = useState<'fetch' | 'explain'>('fetch');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 'm0', role: 'assistant', content: 'Start empty, then build: ask a topic and I will stream sources, a graph map, and narrative clusters.', createdAt: now() },
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

  /* ── Cleanup and side-effect hooks ── */

  useEffect(() => { return () => { runInFlightRef.current = false; runAbortRef.current = null; }; }, []);
  useEffect(() => { if (!copiedKey) return; const t = window.setTimeout(() => setCopiedKey(null), 1200); return () => window.clearTimeout(t); }, [copiedKey]);
  useEffect(() => { if (typeof window === 'undefined') return; const qp = new URLSearchParams(window.location.search); setDebugBrowserLogs(qp.get('debug') === '1'); }, []);

  useEffect(() => {
    if (topic.trim()) { setTypedTopicHint(''); return; }
    let stopped = false;
    let timer: number | null = null;
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;
    const schedule = (ms: number) => { timer = window.setTimeout(tick, ms); };
    const tick = () => {
      if (stopped) return;
      const phrase = TOPIC_TYPED_EXAMPLES[phraseIndex % TOPIC_TYPED_EXAMPLES.length];
      if (!deleting) {
        charIndex = Math.min(phrase.length, charIndex + 1);
        setTypedTopicHint(phrase.slice(0, charIndex));
        if (charIndex === phrase.length) { deleting = true; schedule(1200); return; }
        schedule(30);
        return;
      }
      charIndex = Math.max(0, charIndex - 1);
      setTypedTopicHint(phrase.slice(0, charIndex));
      if (charIndex === 0) { deleting = false; phraseIndex += 1; schedule(240); return; }
      schedule(18);
    };
    schedule(300);
    return () => { stopped = true; if (timer !== null) window.clearTimeout(timer); };
  }, [topic]);

  /* ── Derived data ── */

  const appendTimeline = useCallback((item: TimelineItem) => {
    setTimelineItems((prev) => { const next = [...prev.filter((x) => x.id !== item.id), item]; next.sort((a, b) => a.ts - b.ts); return next.slice(-260); });
  }, []);

  const evidenceById = useMemo(() => {
    const map = new Map<string, EvidenceItem>();
    (session?.evidence ?? []).forEach((e) => map.set(e.id, e));
    return map;
  }, [session?.evidence]);

  const tapeTagsByEvidenceId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of session?.tape ?? []) { const key = String(t.evidenceId || ''); if (!key) continue; const prev = map.get(key) || []; prev.push(...(t.tags || [])); map.set(key, prev); }
    for (const [k, arr] of map.entries()) { const uniq = Array.from(new Set(arr.map((x) => String(x || '').trim()).filter(Boolean))).slice(0, 8); map.set(k, uniq); }
    return map;
  }, [session?.tape]);

  const sourceStats = useMemo(() => {
    const map = new Map<string, { source: string; count: number; latestAt: number; latestKind: EvidenceItem['timeKind'] }>();
    for (const ev of session?.evidence ?? []) {
      const key = String(ev.source || 'unknown');
      const prev = map.get(key);
      const ts = typeof ev.publishedAt === 'number' ? ev.publishedAt : 0;
      const kind = ev.timeKind;
      if (!prev) { map.set(key, { source: key, count: 1, latestAt: ts, latestKind: kind }); }
      else { prev.count += 1; if (ts > prev.latestAt) { prev.latestAt = ts; prev.latestKind = kind; } }
    }
    return Array.from(map.values()).sort((a, b) => b.latestAt - a.latestAt);
  }, [session?.evidence]);

  const tapeStats = useMemo(() => {
    const tape = session?.tape ?? [];
    const uniqueSources = new Set<string>();
    for (const t of tape) { if (t?.source) uniqueSources.add(String(t.source)); }
    return { headlineCount: tape.length, uniqueSourceCount: uniqueSources.size, evidenceCount: session?.evidence?.length ?? 0 };
  }, [session?.evidence, session?.tape]);

  const narrativeStats = useMemo(() => {
    const clusters = session?.clusters ?? [];
    const counts = { rising: 0, steady: 0, fading: 0 };
    for (const c of clusters) counts[c.momentum] += 1;
    return { count: clusters.length, ...counts };
  }, [session?.clusters]);

  /* ── Callbacks ── */

  const openEvidence = useCallback(
    (title: string, evidenceIds: string[], note?: string | null) => {
      const items = evidenceIds.map((id) => evidenceById.get(id)).filter((v): v is EvidenceItem => Boolean(v));
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
      const res = await fetch(apiPath(`/api/sessions/events?sessionId=${encodeURIComponent(sessionId)}&limit=400`), { cache: 'no-store' });
      if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(text ? `Trace fetch failed (${res.status}): ${text}` : `Trace fetch failed (${res.status})`); }
      const data = (await res.json()) as TraceResponse;
      setTrace(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Trace fetch failed';
      setTraceError(message);
      setTrace(null);
    } finally { traceInFlightRef.current = false; setTraceLoading(false); }
  }, []);

  const persistSnapshot = useCallback(
    async ({ price, videos }: { price?: PriceResponse; videos?: VideosResponse }) => {
      const sessionId = session?.id;
      if (snapshotReadOnly) return;
      if (!sessionId || !isUuid(sessionId)) return;
      if (!price && !videos) return;
      try {
        await fetch(apiPath('/api/sessions/snapshot'), {
          method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, ...(price ? { price } : null), ...(videos ? { videos } : null) }),
        });
      } catch { /* Best effort persistence */ }
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
      const res = await fetch(apiPath(`/api/sessions/events?sessionId=${encodeURIComponent(sessionId)}&limit=600`), { cache: 'no-store' });
      if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(text ? `Snapshot load failed (${res.status}): ${text}` : `Snapshot load failed (${res.status})`); }

      const data = (await res.json()) as TraceResponse;
      setTrace(data);
      setTraceOpen(false);

      const meta = ((data.session.meta || {}) as SessionSnapshotMeta) || {};
      const artifacts = (meta.artifacts || {}) as SessionSnapshotArtifacts;
      const topic = String(data.session.topic || '');
      const startedAt = Date.parse(data.session.created_at) || now();

      const savedPrice = artifacts.price || null;
      const savedVideos = artifacts.videos || null;
      const hasSavedSeries = Boolean(savedPrice?.series?.length) && Boolean(savedPrice?.timestamps?.length) && savedPrice?.series?.length === savedPrice?.timestamps?.length;
      const fallbackSeries = buildSeries(startedAt);

      setSession({
        id: data.session.id, topic, startedAt,
        step: (['idle', 'plan', 'search', 'scrape', 'extract', 'link', 'cluster', 'render', 'ready'].includes(data.session.step) ? data.session.step : 'ready') as PipelineStep,
        progress: typeof data.session.progress === 'number' ? data.session.progress : 1,
        tape: Array.isArray(artifacts.tape) ? artifacts.tape : [],
        clusters: Array.isArray(artifacts.clusters) ? artifacts.clusters : [],
        nodes: Array.isArray(artifacts.nodes) ? artifacts.nodes : [],
        edges: Array.isArray(artifacts.edges) ? artifacts.edges : [],
        evidence: Array.isArray(artifacts.evidence) ? artifacts.evidence : [],
        series: hasSavedSeries ? savedPrice!.series : fallbackSeries.y,
        seriesTs: hasSavedSeries ? savedPrice!.timestamps : fallbackSeries.t,
        videosSnapshot: savedVideos, priceSnapshot: savedPrice, snapshotMode: true,
      });

      setRunMeta({ mode: meta.mode === 'deep' ? 'deep' : 'fast', provider: typeof meta.provider === 'string' ? meta.provider : 'openrouter' });
      setMode(meta.mode === 'deep' ? 'deep' : 'fast');
      setTopic(topic);
      setPlan(meta.plan || null);
      setSearch(null);
      setWarnings(data.events.filter((ev) => ev.type === 'warn').map((ev) => String((ev.payload as Record<string, unknown>)?.message || 'Warning')));
      setVideos(savedVideos || null);
      setPrice(savedPrice || null);
      setPriceCompare(null); setPriceCompareTopic(null); setPriceCompareLoading(false);
      setChatMode('explain'); setChatPanelOpen(false);
      setSelectedNodeId(null); setSelectedEdgeId(null); setFlowFocusNodeId(null); setFlowFocusEdgeId(null);
      setDrawerOpen(false);

      const nextTimeline: TimelineItem[] = [];
      for (const ev of data.events) {
        const ts = Date.parse(ev.created_at) || now();
        if (ev.type === 'price.snapshot') { const payload = ev.payload as PriceResponse; nextTimeline.push({ id: `tl_hist_price_${ev.id}`, ts, kind: 'price', title: `Price snapshot (${payload.provider || 'price'})`, subtitle: payload.error || `${payload.series?.length || 0} points`, tags: ['price', payload.provider || 'unknown'] }); }
        else if (ev.type === 'videos.snapshot') { const payload = ev.payload as VideosResponse; nextTimeline.push({ id: `tl_hist_media_${ev.id}`, ts, kind: 'media', title: `Video snapshot (${payload.mode || 'media'})`, subtitle: `${payload.items?.length || 0} items`, tags: ['media', payload.mode || 'snapshot'] }); }
        else if (ev.type === 'warn') { const payload = ev.payload as Record<string, unknown>; nextTimeline.push({ id: `tl_hist_warn_${ev.id}`, ts, kind: 'note', title: 'Warning', subtitle: String(payload.message || ''), tags: ['warn'] }); }
      }
      for (const ev of Array.isArray(artifacts.evidence) ? artifacts.evidence : []) {
        nextTimeline.push({ id: `tl_hist_ev_${ev.id}`, ts: typeof ev.publishedAt === 'number' ? ev.publishedAt : startedAt, kind: 'evidence', title: ev.title, subtitle: ev.source, evidenceIds: [ev.id], tags: [...(ev.aiSummary?.catalysts || []).slice(0, 4), ...(ev.aiSummary?.entities || []).slice(0, 2)] });
      }
      setTimelineItems(nextTimeline.sort((a, b) => a.ts - b.ts).slice(-280));
      replaceUrlWithSessionId(data.session.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load snapshot';
      setTraceError(message);
      setSnapshotMode(false);
    } finally { setSnapshotLoading(false); }
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
    } catch { /* Bootstrap fallback is best effort. */ }
  }, [hydrateSnapshot]);

  /* ── Bootstrap/hydration effects ── */

  useEffect(() => { if (!snapshotSessionId) { hydratedSnapshotIdRef.current = null; return; } if (hydratedSnapshotIdRef.current === snapshotSessionId) return; hydratedSnapshotIdRef.current = snapshotSessionId; void hydrateSnapshot(snapshotSessionId); }, [hydrateSnapshot, snapshotSessionId]);

  useEffect(() => {
    if (snapshotSessionId) return; if (queryTopic) return; if (session) return; if (snapshotLoading || running || runInFlightRef.current) return; if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(LAST_ACTIVE_SESSION_KEY) || '';
    if (isUuid(stored)) { if (hydratedSnapshotIdRef.current === stored) return; hydratedSnapshotIdRef.current = stored; void hydrateSnapshot(stored); return; }
    void hydrateLatestSession();
  }, [hydrateLatestSession, hydrateSnapshot, queryTopic, running, session, snapshotLoading, snapshotSessionId]);

  useEffect(() => { const id = session?.id; if (!id || !isUuid(id)) return; if (typeof window === 'undefined') return; window.localStorage.setItem(LAST_ACTIVE_SESSION_KEY, id); }, [session?.id]);

  /* ── Reset ── */

  const reset = useCallback(() => {
    runAbortRef.current?.abort(); runAbortRef.current = null; runInFlightRef.current = false;
    setRunning(false); setSession(null); setPlan(null); setSearch(null); setWarnings([]); setRunMeta(null); setLastQuestion(null);
    setQueryQueue([]); setScrapeQueue([]); setSummariesCount(0); setGraphVariant(null);
    setTraceOpen(false); setTraceLoading(false); setTraceError(null); setTrace(null); traceInFlightRef.current = false;
    setSelectedNodeId(null); setSelectedEdgeId(null); setFlowFocusNodeId(null); setFlowFocusEdgeId(null);
    setDrawerOpen(false); setDrawerEvidence([]); setDrawerTitle('Inspector'); setDrawerNote(null);
    setVideos(null); setVideosLoading(false); setPrice(null); setPriceLoading(false); priceInFlightRef.current = false;
    setPriceCompareTopic(null); setPriceCompare(null); setPriceCompareLoading(false); setPriceScaleMode('price'); priceCompareSeqRef.current += 1;
    setGraphFullscreen(false); setChatPanelOpen(false); setSnapshotMode(false); setSnapshotLoading(false); setSelectedTag(null); setTimelineItems([]);
    setPanelOpen({ tape: false, sources: false, narratives: false, price: false, media: false });
    setMessages([{ id: 'm0', role: 'assistant', content: 'Start empty, then build: ask a topic and I will stream sources, a graph map, and narrative clusters.', createdAt: now() }]);
    setChatInput(''); setChatMode('fetch');
  }, []);

  /* ── Fetch functions ── */

  const fetchVideos = useCallback(
    async (q: string) => {
      const cleaned = q.trim(); if (!cleaned) return; if (videosInFlightRef.current) return;
      videosInFlightRef.current = true; setVideosLoading(true);
      try {
        const res = await fetch(apiPath(`/api/videos?topic=${encodeURIComponent(cleaned)}&limit=6`), { cache: 'no-store' });
        const data = (await res.json()) as VideosResponse;
        setVideos(data);
        setSession((prev) => (prev ? { ...prev, videosSnapshot: data } : prev));
        await persistSnapshot({ videos: data });
        appendTimeline({ id: `tl_media_${data.fetchedAt}`, ts: data.fetchedAt, kind: 'media', title: `Video snapshot (${data.mode})`, subtitle: `${data.items.length} items`, tags: ['media', data.mode] });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Video fetch failed';
        setVideos({ topic: cleaned, fetchedAt: now(), mode: 'mock', items: [], error: message });
      } finally { videosInFlightRef.current = false; setVideosLoading(false); }
    },
    [appendTimeline, persistSnapshot],
  );

  const fetchPriceData = useCallback(async (q: string): Promise<PriceResponse> => {
    const cleaned = q.trim();
    if (!cleaned) return { ok: false, topic: '', provider: 'error', fetchedAt: now(), series: [], timestamps: [], error: 'Missing topic' };
    try {
      const res = await fetch(apiPath(`/api/price?topic=${encodeURIComponent(cleaned)}`), { cache: 'no-store' });
      const raw = (await res.json().catch(() => ({}))) as Partial<PriceResponse>;
      const series = Array.isArray(raw.series) ? raw.series.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [];
      const timestamps = Array.isArray(raw.timestamps) ? raw.timestamps.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [];
      return { ok: Boolean(raw.ok), topic: typeof raw.topic === 'string' ? raw.topic : cleaned, symbol: typeof raw.symbol === 'string' ? raw.symbol : undefined, provider: typeof raw.provider === 'string' ? raw.provider : 'unknown', fetchedAt: typeof raw.fetchedAt === 'number' ? raw.fetchedAt : now(), series, timestamps, last: typeof raw.last === 'number' || raw.last === null ? raw.last : undefined, error: typeof raw.error === 'string' ? raw.error : undefined };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Price fetch failed';
      return { ok: false, topic: cleaned, provider: 'error', fetchedAt: now(), series: [], timestamps: [], error: message };
    }
  }, []);

  const fetchPrice = useCallback(
    async (q: string) => {
      const cleaned = q.trim(); if (!cleaned) return; if (priceInFlightRef.current) return;
      priceInFlightRef.current = true; setPriceLoading(true);
      try {
        const data = await fetchPriceData(cleaned);
        setPrice(data);
        setSession((prev) => (prev ? { ...prev, priceSnapshot: data } : prev));
        await persistSnapshot({ price: data });
        appendTimeline({ id: `tl_price_${data.fetchedAt}`, ts: data.fetchedAt, kind: 'price', title: `Price snapshot (${data.provider})`, subtitle: data.error ? data.error : `${data.series.length} points`, tags: ['price', data.provider, data.ok ? 'ok' : 'fallback'] });
        if (data.ok && data.series.length > 1 && data.series.length === data.timestamps.length) { setSession((prev) => (prev ? { ...prev, series: data.series, seriesTs: data.timestamps } : prev)); }
      } finally { priceInFlightRef.current = false; setPriceLoading(false); }
    },
    [appendTimeline, fetchPriceData, persistSnapshot],
  );

  const fetchComparePrice = useCallback(
    async (baseTopic: string, compareTopic: string) => {
      const base = baseTopic.trim(); const compare = compareTopic.trim();
      if (!base || !compare || normalizeTopicKey(base) === normalizeTopicKey(compare)) { setPriceCompare(null); setPriceCompareLoading(false); return; }
      const seq = (priceCompareSeqRef.current += 1);
      setPriceCompareLoading(true);
      try { const data = await fetchPriceData(compare); if (seq !== priceCompareSeqRef.current) return; setPriceCompare(data); }
      finally { if (seq === priceCompareSeqRef.current) setPriceCompareLoading(false); }
    },
    [fetchPriceData],
  );

  /* ── SSE run ── */

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

      setRunning(true); setLastQuestion(cleanedQ ? cleanedQ : null);
      setPlan(null); setSearch(null); setWarnings([]); setRunMeta({ mode, provider: 'openrouter' });
      setQueryQueue([]); setScrapeQueue([]); setSummariesCount(0); setGraphVariant(null);
      latestSearchResultsRef.current = [];
      setTrace(null); setTraceError(null);
      setSelectedNodeId(null); setSelectedEdgeId(null); setFlowFocusNodeId(null); setFlowFocusEdgeId(null);
      setDrawerOpen(false); setDrawerEvidence([]); setDrawerTitle('Inspector'); setDrawerNote(null);
      setGraphFullscreen(false); setChatPanelOpen(false); setSnapshotMode(false); setSelectedTag(null); setTimelineItems([]);
      setGraphFitSignal((v) => v + 1);
      setVideos(null); setVideosLoading(false); setActiveVideoId(null);
      setPrice(null); setPriceLoading(false); priceInFlightRef.current = false;
      setPriceCompareTopic(null); setPriceCompare(null); setPriceCompareLoading(false); setPriceScaleMode('price'); priceCompareSeqRef.current += 1;

      const startedAtLocal = now();
      const localId = `local_${Math.random().toString(16).slice(2)}`;
      const { y, t } = buildSeries(startedAtLocal);

      setSession({ id: localId, topic: cleaned, startedAt: startedAtLocal, step: 'plan', progress: 0.06, tape: [], clusters: [], nodes: [], edges: [], evidence: [], series: y, seriesTs: t });

      try {
        const res = await fetch(apiPath('/api/run'), {
          method: 'POST', cache: 'no-store', signal: abort.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ topic: cleaned, ...(cleanedQ ? { question: cleanedQ } : null), mode, serpFormat: 'light' }),
        });

        if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(text ? `Run failed (${res.status}): ${text}` : `Run failed (${res.status})`); }

        await consumeSseStream({
          response: res, signal: abort.signal,
          onEvent: (event, data) => {
            if (abort.signal.aborted) return;
            if (runSeq !== runSeqRef.current) return;

            if (debugBrowserLogs) { console.info('[signal-terminal]', event, data); }

            if (event === 'session' && data && typeof data === 'object') {
              const d = data as any;
              const serverMode: 'fast' | 'deep' = d.mode === 'deep' ? 'deep' : 'fast';
              const provider = typeof d.provider === 'string' ? d.provider : 'openrouter';
              const sessionId = typeof d.sessionId === 'string' ? d.sessionId : localId;
              const serverTopic = typeof d.topic === 'string' ? d.topic : cleaned;
              const serverStartedAt = typeof d.startedAt === 'number' ? d.startedAt : startedAtLocal;
              const { y, t } = buildSeries(serverStartedAt);
              setRunMeta({ mode: serverMode, provider }); setTopic(serverTopic); setGraphVariant(null); setSummariesCount(0);
              setSession((prev) => prev ? { ...prev, id: sessionId, topic: serverTopic, startedAt: serverStartedAt, series: y, seriesTs: t } : { id: sessionId, topic: serverTopic, startedAt: serverStartedAt, step: 'plan', progress: 0.06, tape: [], clusters: [], nodes: [], edges: [], evidence: [], series: y, seriesTs: t });
              if (isUuid(sessionId)) replaceUrlWithSessionId(sessionId);
              return;
            }

            if (event === 'step' && data && typeof data === 'object') {
              const d = data as any;
              const step = typeof d.step === 'string' ? d.step : '';
              const p = typeof d.progress === 'number' ? d.progress : undefined;
              const isStep = (value: string): value is PipelineStep => ['idle', 'plan', 'search', 'scrape', 'extract', 'link', 'cluster', 'render', 'ready'].includes(value);
              setSession((prev) => { if (!prev) return prev; return { ...prev, step: isStep(step) ? step : prev.step, progress: typeof p === 'number' ? Math.max(prev.progress, Math.min(1, p)) : prev.progress }; });
              if (step === 'search') { setQueryQueue((prev) => { if (!prev.length) return prev; if (prev.some((it) => it.state === 'running')) return prev; const next = [...prev]; const firstIdx = next.findIndex((it) => it.state === 'queued'); if (firstIdx >= 0) next[firstIdx] = { ...next[firstIdx], state: 'running' }; return next; }); }
              if (step === 'scrape') { setScrapeQueue((prev) => { if (prev.length) return prev; const top = latestSearchResultsRef.current.slice(0, 4).filter(Boolean); return top.map((url) => ({ url, state: 'queued' })); }); }
              return;
            }

            if (event === 'plan') { const p = data as PlanEvent; setPlan(p); setSearch((prev) => prev || { queries: p.queries || [], results: [] }); const cap = mode === 'deep' ? 6 : 4; setQueryQueue(p.queries.slice(0, cap).map((q) => ({ query: q, state: 'queued' }))); return; }

            if (event === 'search.partial' && data && typeof data === 'object') {
              const d = data as any; const picked = d?.picked; if (!Array.isArray(picked)) return;
              latestSearchResultsRef.current = picked.map((r: any) => String(r?.url || '')).filter(Boolean).slice(0, 20);
              setSearch((prev) => ({ queries: prev?.queries?.length ? prev.queries : [], results: picked }));
              const q = typeof d?.query === 'string' ? d.query : '';
              const added = typeof d?.added === 'number' ? d.added : undefined;
              const foundTotal = typeof d?.found === 'number' ? d.found : undefined;
              if (q) { setQueryQueue((prev) => { if (!prev.length) return prev; const next = [...prev]; const idx = next.findIndex((it) => it.query === q); if (idx >= 0) next[idx] = { ...next[idx], state: 'done', added, foundTotal }; const runningIdx = next.findIndex((it) => it.state === 'running'); if (runningIdx >= 0 && next[runningIdx]?.query !== q) { next[runningIdx] = { ...next[runningIdx], state: 'done' }; } const nextIdx = next.findIndex((it) => it.state === 'queued'); if (nextIdx >= 0) next[nextIdx] = { ...next[nextIdx], state: 'running' }; return next; }); }
              return;
            }

            if (event === 'search') {
              try { const results = (data as any)?.results; if (Array.isArray(results)) { latestSearchResultsRef.current = results.map((r: any) => String(r?.url || '')).filter(Boolean).slice(0, 20); } } catch { /* ignore */ }
              setSearch(data as SearchEvent);
              setQueryQueue((prev) => prev.map((it) => (it.state === 'queued' || it.state === 'running' ? { ...it, state: 'done' } : it)));
              return;
            }

            if (event === 'scrape.page' && data && typeof data === 'object') {
              const d = data as any; const url = typeof d?.url === 'string' ? d.url : ''; const status = typeof d?.status === 'string' ? d.status : '';
              if (!url) return;
              setScrapeQueue((prev) => { const next = [...prev]; const idx = next.findIndex((it) => it.url === url); const state = status === 'start' ? 'running' : status === 'done' ? 'done' : status === 'fail' ? 'failed' : 'queued'; if (idx >= 0) next[idx] = { ...next[idx], state }; else next.push({ url, state }); return next; });
              return;
            }

            if (event === 'evidence' && data && typeof data === 'object') {
              const items = (data as any).items;
              if (Array.isArray(items)) {
                setSession((prev) => (prev ? { ...prev, evidence: items as EvidenceItem[] } : prev));
                for (const ev of (items as EvidenceItem[]).slice(0, 16)) { appendTimeline({ id: `tl_ev_${ev.id}`, ts: typeof ev.publishedAt === 'number' ? ev.publishedAt : now(), kind: 'evidence', title: ev.title, subtitle: ev.source, evidenceIds: [ev.id], tags: [...(ev.aiSummary?.catalysts || []).slice(0, 4), ...(ev.aiSummary?.entities || []).slice(0, 2)] }); }
              }
              return;
            }

            if (event === 'summaries' && data && typeof data === 'object') {
              const items = (data as any).items; if (!Array.isArray(items)) return;
              setSummariesCount(items.length);
              const byId = new Map<string, any>(); for (const it of items) { const id = typeof it?.id === 'string' ? it.id : ''; if (!id) continue; byId.set(id, it); }
              setSession((prev) => { if (!prev || !prev.evidence?.length) return prev; const nextEvidence = prev.evidence.map((e) => { const s = byId.get(e.id); if (!s) return e; return { ...e, aiSummary: { bullets: Array.isArray(s.bullets) ? s.bullets.slice(0, 5) : [], entities: Array.isArray(s.entities) ? s.entities.slice(0, 12) : undefined, catalysts: Array.isArray(s.catalysts) ? s.catalysts.slice(0, 10) : undefined, sentiment: typeof s.sentiment === 'string' ? s.sentiment : undefined, confidence: typeof s.confidence === 'number' ? s.confidence : undefined } } as EvidenceItem; }); return { ...prev, evidence: nextEvidence }; });
              return;
            }

            if (event === 'tape' && data && typeof data === 'object') { const items = (data as any).items; if (Array.isArray(items)) setSession((prev) => (prev ? { ...prev, tape: items as TapeItem[] } : prev)); return; }

            if (event === 'graph' && data && typeof data === 'object') {
              const nodes = (data as any).nodes; const edges = (data as any).edges;
              const variant = typeof (data as any).variant === 'string' ? String((data as any).variant) : null;
              if (!Array.isArray(nodes) || !Array.isArray(edges)) return;
              setSession((prev) => prev ? { ...prev, nodes: nodes as GraphNode[], edges: edges as GraphEdge[], step: prev.step === 'extract' ? 'link' : prev.step, progress: Math.max(prev.progress, 0.78) } : prev);
              if (variant) setGraphVariant(variant);
              setGraphFitSignal((v) => v + 1);
              return;
            }

            if (event === 'clusters' && data && typeof data === 'object') { const items = (data as any).items; if (!Array.isArray(items)) return; setSession((prev) => prev ? { ...prev, clusters: items as StoryCluster[], step: prev.step === 'link' ? 'cluster' : prev.step, progress: Math.max(prev.progress, 0.9) } : prev); return; }

            if (event === 'message' && data && typeof data === 'object') { const content = typeof (data as any).content === 'string' ? ((data as any).content as string).trim() : ''; if (!content) return; setMessages((prev) => [...prev, { id: `m_${Math.random().toString(16).slice(2)}`, role: 'assistant', content, createdAt: now() }]); return; }

            if (event === 'warn' && data && typeof data === 'object') {
              const message = String((data as any).message || 'Warning');
              setWarnings((prev) => [...prev, message]);
              appendTimeline({ id: `tl_warn_${now()}`, ts: now(), kind: 'note', title: 'Warning', subtitle: message, tags: ['warn'] });
              const q = typeof (data as any).query === 'string' ? String((data as any).query) : '';
              if (q) { setQueryQueue((prev) => { if (!prev.length) return prev; const next = [...prev]; const idx = next.findIndex((it) => it.query === q); if (idx >= 0) next[idx] = { ...next[idx], state: 'failed' }; const nextIdx = next.findIndex((it) => it.state === 'queued'); if (nextIdx >= 0 && !next.some((it) => it.state === 'running')) next[nextIdx] = { ...next[nextIdx], state: 'running' }; return next; }); }
              return;
            }

            if (event === 'error' && data && typeof data === 'object') {
              const message = String((data as any).message || 'Unknown error');
              setWarnings((prev) => [...prev, message]);
              setMessages((prev) => [...prev, { id: `m_${Math.random().toString(16).slice(2)}`, role: 'assistant', content: `Error: ${message}`, createdAt: now() }]);
              setSession((prev) => (prev ? { ...prev, step: 'ready', progress: 1 } : prev));
              appendTimeline({ id: `tl_error_${now()}`, ts: now(), kind: 'note', title: 'Run error', subtitle: message, tags: ['error'] });
              return;
            }

            if (event === 'done') { setSession((prev) => (prev ? { ...prev, step: 'ready', progress: 1 } : prev)); }
          },
        });
      } catch (e) {
        if (abort.signal.aborted) return;
        if (runSeq !== runSeqRef.current) return;
        const message = e instanceof Error ? e.message : 'Run failed';
        setWarnings((prev) => [...prev, message]);
        setMessages((prev) => [...prev, { id: `m_${Math.random().toString(16).slice(2)}`, role: 'assistant', content: `Error: ${message}`, createdAt: now() }]);
        setSession((prev) => (prev ? { ...prev, step: 'ready', progress: 1 } : prev));
      } finally {
        if (runSeq === runSeqRef.current && !abort.signal.aborted) { runInFlightRef.current = false; setRunning(false); }
      }
    },
    [appendTimeline, debugBrowserLogs, mode, replaceUrlWithSessionId],
  );

  /* ── Post-run effects ── */

  useEffect(() => { if (!traceOpen) return; const id = session?.id; if (!id || !isUuid(id)) return; void fetchTrace(id); }, [fetchTrace, session?.id, traceOpen]);

  useEffect(() => {
    if (snapshotSessionId) return; if (!queryTopic) { autoRunTopicRef.current = null; return; }
    if (autoRunTopicRef.current === autoRunKey) return; if (running || runInFlightRef.current) return;
    autoRunTopicRef.current = autoRunKey; setTopic(queryTopic); void start(queryTopic).catch(() => undefined);
  }, [autoRunKey, queryTopic, running, snapshotSessionId, start]);

  const runChat = useCallback(
    (q: string) => {
      const cleaned = q.trim(); if (!cleaned) return;
      const inferred = guessTopicFromQuery(cleaned);
      const topicForRun = inferred || (session ? topic : cleaned);
      setMessages((prev) => [...prev, { id: `m_${Math.random().toString(16).slice(2)}`, role: 'user', content: cleaned, createdAt: now() }]);
      setChatInput(''); setTopic(topicForRun); setLastQuestion(cleaned);
      void start(topicForRun, cleaned).catch(() => undefined);
    },
    [session, start, topic],
  );

  const askWithContext = useCallback(
    async (q: string, opts?: { focusEvidenceIds?: string[] }) => {
      const cleaned = q.trim(); if (!cleaned) return;
      if (!session || !isUuid(session.id)) { runChat(cleaned); return; }
      setMessages((prev) => [...prev, { id: `m_${Math.random().toString(16).slice(2)}`, role: 'user', content: cleaned, createdAt: now() }]);
      setChatInput('');
      const mentions = Array.from(new Set((cleaned.match(/@([a-zA-Z0-9_-]+)/g) || []).map((m) => m.slice(1))));
      const mentionEvidence = mentions.filter((m) => /^ev_[a-z0-9_:-]+$/i.test(m));
      const mentionNodes = mentions.filter((m) => /^n_[a-z0-9_:-]+$/i.test(m));
      const mentionTags = mentions.filter((m) => !/^ev_[a-z0-9_:-]+$/i.test(m) && !/^n_[a-z0-9_:-]+$/i.test(m));
      const mentionNodeEvidence = mentionNodes.flatMap((nodeId) => (session?.edges || []).filter((e) => e.from === nodeId || e.to === nodeId).flatMap((e) => e.evidenceIds || []));
      const mentionTagEvidence = mentionTags.flatMap((tag) => (session?.evidence || []).filter((ev) => { const tags = [...(tapeTagsByEvidenceId.get(ev.id) || []), ...(ev.aiSummary?.catalysts || []), ...(ev.aiSummary?.entities || [])].map((t) => String(t || '').toLowerCase()); return tags.includes(tag.toLowerCase()); }).map((ev) => ev.id));
      const effectiveFocus = Array.from(new Set([...(opts?.focusEvidenceIds || []), ...mentionEvidence, ...mentionNodeEvidence, ...mentionTagEvidence])).slice(0, 24);
      try {
        const res = await fetch(apiPath('/api/chat'), { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: session.id, message: cleaned, ...(effectiveFocus.length ? { focusEvidenceIds: effectiveFocus } : null) }) });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(data?.error || `Chat failed (${res.status})`);
        const content = typeof data?.content === 'string' ? data.content.trim() : '';
        setMessages((prev) => [...prev, { id: `m_${Math.random().toString(16).slice(2)}`, role: 'assistant', content: content || 'No response.', createdAt: now() }]);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Chat failed';
        setMessages((prev) => [...prev, { id: `m_${Math.random().toString(16).slice(2)}`, role: 'assistant', content: `Error: ${message}`, createdAt: now() }]);
      }
    },
    [runChat, session, tapeTagsByEvidenceId],
  );

  const fetchAutoBrief = useCallback(
    async (opts: { sessionId: string; topic: string; focusEvidenceIds: string[] }) => {
      if (!isUuid(opts.sessionId)) return; if (autoBriefInFlightRef.current) return;
      autoBriefInFlightRef.current = true;
      try {
        const res = await fetch(apiPath('/api/chat'), { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: opts.sessionId, message: `Give a short paragraph (3-5 sentences, no bullets) explaining what is happening with ${opts.topic} right now. Cite evidence IDs like [ev_3].`, ...(opts.focusEvidenceIds.length ? { focusEvidenceIds: opts.focusEvidenceIds.slice(0, 24) } : null) }) });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(data?.error || `Brief failed (${res.status})`);
        const content = typeof data?.content === 'string' ? data.content.trim() : '';
        if (!content) return;
        setMessages((prev) => [...prev, { id: `m_${Math.random().toString(16).slice(2)}`, role: 'assistant', content: `Brief: ${content}`, createdAt: now() }]);
      } catch { /* Silent failure */ } finally { autoBriefInFlightRef.current = false; }
    },
    [],
  );

  const rerun = useCallback(() => { const t = session?.topic || topic; if (!t.trim()) return; void start(t, lastQuestion || undefined).catch(() => undefined); }, [lastQuestion, session?.topic, start, topic]);

  /* ── Chat/brief/node-edge effects ── */

  useEffect(() => { if (!session) return; setChatMode('explain'); }, [session?.id]);

  useEffect(() => {
    if (!session || !isUuid(session.id)) return; if (snapshotReadOnly) return; if (running) return; if (session.step !== 'ready') return; if (!session.evidence.length) return; if (autoBriefSentRef.current === session.id) return;
    autoBriefSentRef.current = session.id;
    const focusEvidenceIds = Array.from(new Set((session.tape || []).map((t) => String(t.evidenceId || '')).filter(Boolean))).slice(0, 24);
    void fetchAutoBrief({ sessionId: session.id, topic: session.topic, focusEvidenceIds });
  }, [fetchAutoBrief, running, session, snapshotReadOnly]);

  useEffect(() => { if (!session) return; if (selectedNodeId) { const node = session.nodes.find((n) => n.id === selectedNodeId); if (!node) return; const edges = session.edges.filter((e) => e.from === node.id || e.to === node.id); const ids = Array.from(new Set(edges.flatMap((e) => e.evidenceIds))); if (ids.length) openEvidence(`Node: ${node.label}`, ids); } }, [openEvidence, selectedNodeId, session]);

  useEffect(() => { if (!session) return; if (selectedEdgeId) { const edge = session.edges.find((e) => e.id === selectedEdgeId); if (!edge) return; openEvidence(`Edge: ${edge.type.replace(/_/g, ' ')} (${Math.round(edge.confidence * 100)}%)`, edge.evidenceIds, edge.rationale || null); } }, [openEvidence, selectedEdgeId, session]);

  /* ── Video/price side effects ── */

  useEffect(() => { if (snapshotReadOnly) return; const sessionId = session?.id; const sessionTopic = session?.topic; if (!sessionId || !sessionTopic) { setVideos(null); setVideosLoading(false); setActiveVideoId(null); return; } void fetchVideos(sessionTopic); }, [fetchVideos, session?.id, session?.topic, snapshotReadOnly]);
  useEffect(() => { if (snapshotReadOnly) return; const sessionId = session?.id; const sessionTopic = session?.topic; if (!sessionId || !sessionTopic) { setPrice(null); setPriceLoading(false); setPriceCompare(null); setPriceCompareLoading(false); priceCompareSeqRef.current += 1; return; } void fetchPrice(sessionTopic); }, [fetchPrice, session?.id, session?.topic, snapshotReadOnly]);
  useEffect(() => { if (snapshotReadOnly) return; const sessionTopic = session?.topic; const compareTopic = priceCompareTopic; if (!sessionTopic || !compareTopic) { setPriceCompare(null); setPriceCompareLoading(false); priceCompareSeqRef.current += 1; return; } if (normalizeTopicKey(sessionTopic) === normalizeTopicKey(compareTopic)) { setPriceCompare(null); setPriceCompareLoading(false); priceCompareSeqRef.current += 1; return; } void fetchComparePrice(sessionTopic, compareTopic); }, [fetchComparePrice, priceCompareTopic, session?.id, session?.topic, snapshotReadOnly]);
  useEffect(() => { if (snapshotReadOnly) return; if (!videoAutoPoll) return; const sessionTopic = session?.topic; if (!sessionTopic) return; const poll = window.setInterval(() => { void fetchVideos(sessionTopic); }, 5 * 60_000); return () => window.clearInterval(poll); }, [fetchVideos, session?.topic, snapshotReadOnly, videoAutoPoll]);
  useEffect(() => { if (!videos?.items?.length) { setActiveVideoId(null); return; } setActiveVideoId((prev) => (prev && videos.items.some((v) => v.id === prev) ? prev : videos.items[0].id)); }, [videos?.fetchedAt, videos?.topic, videos?.items]);

  /* ── Derived state for rendering ── */

  const isEmpty = session === null;
  const stepLabel = session ? STEP_LABEL[session.step] : STEP_LABEL.idle;
  const progress = session?.progress ?? 0;
  const hasUserMessage = useMemo(() => messages.some((m) => m.role === 'user'), [messages]);
  const showChatSuggestions = !running && !hasUserMessage;
  const togglePanel = useCallback((k: keyof typeof panelOpen) => { setPanelOpen((prev) => ({ ...prev, [k]: !prev[k] })); }, []);
  const tagOptions = useMemo(() => uniqueTagsFromSession(session), [session]);

  const workspaceGraph = useMemo(() => {
    if (!session) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    const baseNodes = session.nodes || []; const baseEdges = session.edges || [];
    const { mediaNodes, mediaEdges } = buildMediaGraph({ topic: session.topic, videos: videos || session.videosSnapshot || null, evidence: session.evidence || [], baseNodes });
    const allNodes = [...baseNodes, ...mediaNodes]; const allEdges = [...baseEdges, ...mediaEdges];
    if (!selectedTag) return { nodes: allNodes, edges: allEdges };
    const matchEvidenceIds = new Set<string>();
    for (const ev of session.evidence || []) { const tags = [...(tapeTagsByEvidenceId.get(ev.id) || []), ...(ev.aiSummary?.catalysts || []), ...(ev.aiSummary?.entities || [])]; if (tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase())) { matchEvidenceIds.add(ev.id); } }
    const keptEdges = allEdges.filter((e) => e.evidenceIds.some((id) => matchEvidenceIds.has(id)));
    const keepNodeIds = new Set<string>(); for (const e of keptEdges) { keepNodeIds.add(e.from); keepNodeIds.add(e.to); }
    const keptNodes = allNodes.filter((n) => keepNodeIds.has(n.id));
    return { nodes: keptNodes, edges: keptEdges };
  }, [selectedTag, session, tapeTagsByEvidenceId, videos]);
  const hasWorkspaceGraph = workspaceGraph.nodes.length > 0;

  const timelineData = useMemo(() => {
    const out = timelineItems.filter((it) => it.kind !== 'step');
    const mediaNodeIds = new Set((workspaceGraph.nodes || []).filter((n) => n.type === 'media').map((n) => n.id));
    const mediaFocusNodeId = mediaNodeIds.values().next().value || null;
    const mediaEvidenceIds = Array.from(new Set((workspaceGraph.edges || []).filter((e) => mediaNodeIds.has(e.from) || mediaNodeIds.has(e.to)).flatMap((e) => e.evidenceIds || []))).slice(0, 8);
    if (price?.fetchedAt) { out.push({ id: `tl_price_live_${price.fetchedAt}`, ts: price.fetchedAt, kind: 'price', title: `Price snapshot (${price.provider})`, subtitle: price.error || `${price.series.length} points`, tags: ['price', price.provider, price.ok ? 'ok' : 'fallback'] }); }
    if (videos?.fetchedAt) { out.push({ id: `tl_videos_live_${videos.fetchedAt}`, ts: videos.fetchedAt, kind: 'media', title: `Video snapshot (${videos.mode})`, subtitle: `${videos.items.length} items`, tags: ['media', videos.mode], nodeId: mediaFocusNodeId || undefined, evidenceIds: mediaEvidenceIds.length ? mediaEvidenceIds : undefined }); }
    return out;
  }, [price, timelineItems, videos, workspaceGraph.edges, workspaceGraph.nodes]);

  const mentionState = useMemo(() => {
    const m = chatInput.match(/@([a-zA-Z0-9_-]*)$/);
    if (!m) return { active: false, query: '', items: [] as string[] };
    const query = (m[1] || '').toLowerCase();
    const nodeIds = (workspaceGraph.nodes || []).map((n) => n.id);
    const evidenceIds = (session?.evidence || []).map((e) => e.id);
    const items = Array.from(new Set([...nodeIds, ...evidenceIds, ...tagOptions])).filter((v) => v.toLowerCase().includes(query)).slice(0, 12);
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
            <button key={`tok_${idx}`} type="button" className="mx-0.5 inline-flex rounded-full border border-[rgba(20,184,166,0.4)] bg-[rgba(20,184,166,0.14)] px-2 py-0.5 text-[11px] text-[rgba(170,250,238,0.96)]" onClick={() => openEvidence(`Evidence: ${token}`, [token])}>
              [{token}]
            </button>
          );
        }
        if (/^n_[a-z0-9_:-]+$/i.test(token)) {
          return (
            <button key={`tok_${idx}`} type="button" className="mx-0.5 inline-flex rounded-full border border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.14)] px-2 py-0.5 text-[11px] text-[rgba(170,209,255,0.96)]" onClick={() => { setSelectedNodeId(token); setSelectedEdgeId(null); }}>
              [{token}]
            </button>
          );
        }
        return (
          <button key={`tok_${idx}`} type="button" className="mx-0.5 inline-flex rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/72" onClick={() => setSelectedTag(token)}>
            [{token}]
          </button>
        );
      });
    },
    [openEvidence],
  );

  /* ── Publish handler ── */

  const handlePublish = useCallback(async () => {
    if (!session) return;
    setPublishing(true);
    try {
      const res = await fetch(apiPath('/api/sessions/publish'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.id }) });
      if (!res.ok) throw new Error('Publish failed');
      const data = await res.json();
      const fullUrl = `${window.location.origin}${data.url}`;
      setPublishedUrl(fullUrl);
      try { await navigator.clipboard.writeText(fullUrl); } catch {}
      setTimeout(() => setPublishedUrl(null), 4000);
    } catch { /* silent fail */ } finally { setPublishing(false); }
  }, [session]);

  /* ── Render ── */

  return (
    <div className="min-h-screen">
      <div className="bg-terminal fixed inset-0 -z-10" />

      <TerminalHeader
        step={session?.step ?? 'idle'}
        progress={progress}
        running={running}
        session={session}
        publishing={publishing}
        publishedUrl={publishedUrl}
        snapshotMode={snapshotMode}
        warnings={warnings}
        onRerun={rerun}
        onPublish={handlePublish}
        searchBarContent={
          <TerminalSearchBar
            topic={topic}
            typedTopicHint={typedTopicHint}
            mode={mode}
            running={running}
            onTopicChange={setTopic}
            onModeChange={setMode}
            onSubmit={() => void start(topic).catch(() => undefined)}
          />
        }
        pipelineContent={
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
        }
      />

      <main className="mx-auto max-w-[1520px] px-4 pb-12">
        <div className={cn('grid gap-5', chatPanelOpen ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : 'grid-cols-1')}>
          <div className="min-w-0 space-y-5">
            <WorkspacePanel
              isEmpty={isEmpty}
              session={session}
              evidenceView={evidenceView}
              hasWorkspaceGraph={hasWorkspaceGraph}
              workspaceGraph={workspaceGraph}
              timelineData={timelineData}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              flowFocusNodeId={flowFocusNodeId}
              flowFocusEdgeId={flowFocusEdgeId}
              selectedTag={selectedTag}
              tagOptions={tagOptions}
              graphFitSignal={graphFitSignal}
              graphFullscreen={graphFullscreen}
              chatPanelOpen={chatPanelOpen}
              snapshotLoading={snapshotLoading}
              stepLabel={stepLabel}
              onEvidenceViewChange={(v) => { setEvidenceView(v); if (v === 'graph') setGraphFitSignal((x) => x + 1); }}
              onSelectNode={setSelectedNodeId}
              onSelectEdge={setSelectedEdgeId}
              onFlowFocusNode={setFlowFocusNodeId}
              onFlowFocusEdge={setFlowFocusEdgeId}
              onInspectNode={(id) => { setSelectedNodeId(id); setSelectedEdgeId(null); }}
              onSelectTag={setSelectedTag}
              onGraphFullscreen={() => { setGraphFullscreen(true); setGraphFitSignal((v) => v + 1); }}
              onToggleChat={() => setChatPanelOpen((prev) => !prev)}
              onOpenEvidence={openEvidence}
            />

            <div className="flex flex-wrap items-center gap-2">
              {(['tape', 'sources', 'narratives', 'price', 'media'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06]"
                  onClick={() => togglePanel(key)}
                >
                  {panelOpen[key] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {key === 'tape' ? 'Breaking Tape' : key === 'sources' ? 'Sources' : key === 'narratives' ? 'Narratives' : key === 'price' ? 'Price Context' : 'Media'}
                </button>
              ))}
            </div>

            {panelOpen.tape ? (
              <TapePanel
                isEmpty={isEmpty}
                tape={session?.tape ?? []}
                tapeStats={tapeStats}
                onOpenEvidence={openEvidence}
              />
            ) : null}

            {panelOpen.sources ? (
              <SourcesPanel
                isEmpty={isEmpty}
                sourceStats={sourceStats}
                evidence={(session?.evidence ?? []).map((e) => ({ id: e.id, source: e.source }))}
                onOpenEvidence={openEvidence}
              />
            ) : null}

            {panelOpen.narratives ? (
              <NarrativesPanel
                isEmpty={isEmpty}
                clusters={session?.clusters ?? []}
                narrativeStats={narrativeStats}
                onOpenEvidence={openEvidence}
              />
            ) : null}

            {panelOpen.price ? (
              <PricePanel
                session={session ? { topic: session.topic, series: session.series, seriesTs: session.seriesTs } : null}
                price={price}
                priceLoading={priceLoading}
                priceScaleMode={priceScaleMode}
                priceCompareTopic={priceCompareTopic}
                priceCompare={priceCompare}
                priceCompareLoading={priceCompareLoading}
                evidence={(session?.evidence ?? []).map((e) => ({ id: e.id, publishedAt: e.publishedAt, title: e.title }))}
                onRefresh={() => { if (session) { void fetchPrice(session.topic); if (priceCompareTopic) void fetchComparePrice(session.topic, priceCompareTopic); } }}
                onScaleModeChange={setPriceScaleMode}
                onCompareTopicChange={setPriceCompareTopic}
              />
            ) : null}

            {panelOpen.media ? (
              <MediaPanel
                session={session ? { topic: session.topic } : null}
                videos={videos}
                videosLoading={videosLoading}
                videoAutoPoll={videoAutoPoll}
                activeVideoId={activeVideoId}
                onVideoAutoPollChange={setVideoAutoPoll}
                onRefresh={() => { if (session) fetchVideos(session.topic); }}
                onActiveVideoChange={setActiveVideoId}
              />
            ) : null}
          </div>

          {chatPanelOpen ? (
            <ChatPanel
              session={session}
              running={running}
              chatMode={chatMode}
              chatInput={chatInput}
              messages={messages}
              mentionState={mentionState}
              showChatSuggestions={showChatSuggestions}
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
              mode={mode}
              runMeta={runMeta}
              onChatModeChange={setChatMode}
              onChatInputChange={setChatInput}
              onClose={() => setChatPanelOpen(false)}
              onRunChat={runChat}
              onAskWithContext={(q) => void askWithContext(q)}
              onMentionSelect={(item) => setChatInput((prev) => prev.replace(/@([a-zA-Z0-9_-]*)$/, `@${item} `))}
              renderMessageContent={renderMessageContent}
            />
          ) : null}
        </div>
      </main>

      <EvidenceDrawer
        open={drawerOpen}
        title={drawerTitle}
        note={drawerNote}
        evidence={drawerEvidence}
        tapeTagsByEvidenceId={tapeTagsByEvidenceId}
        copiedKey={copiedKey}
        onClose={() => setDrawerOpen(false)}
        onCopy={setCopiedKey}
      />

      <TraceDrawer
        open={traceOpen}
        session={session}
        mode={mode}
        runMeta={runMeta}
        trace={trace}
        traceLoading={traceLoading}
        traceError={traceError}
        copiedKey={copiedKey}
        onClose={() => setTraceOpen(false)}
        onRefresh={() => { if (session) void fetchTrace(session.id); }}
        onCopy={setCopiedKey}
      />

      <FullscreenModal
        open={graphFullscreen}
        session={session}
        evidenceView={evidenceView}
        hasWorkspaceGraph={hasWorkspaceGraph}
        workspaceGraph={workspaceGraph}
        timelineData={timelineData}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        flowFocusNodeId={flowFocusNodeId}
        flowFocusEdgeId={flowFocusEdgeId}
        selectedTag={selectedTag}
        graphFitSignal={graphFitSignal}
        drawerTitle={drawerTitle}
        drawerEvidence={drawerEvidence}
        tapeTagsByEvidenceId={tapeTagsByEvidenceId}
        copiedKey={copiedKey}
        topic={topic}
        onClose={() => setGraphFullscreen(false)}
        onEvidenceViewChange={(v) => { setEvidenceView(v); if (v === 'graph') setGraphFitSignal((x) => x + 1); }}
        onSelectNode={setSelectedNodeId}
        onSelectEdge={setSelectedEdgeId}
        onFlowFocusNode={setFlowFocusNodeId}
        onFlowFocusEdge={setFlowFocusEdgeId}
        onSelectTag={setSelectedTag}
        onGraphFit={() => setGraphFitSignal((v) => v + 1)}
        onAskAI={() => {
          const ids = drawerEvidence.map((e) => e.id).filter(Boolean);
          void askWithContext(`Explain what this selection implies for ${session?.topic || topic}. What should I watch next?`, { focusEvidenceIds: ids });
        }}
        onOpenEvidence={openEvidence}
        onCopy={setCopiedKey}
      />
    </div>
  );
}
