'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, Copy, LayoutDashboard, RefreshCw } from 'lucide-react';

import { cn, apiPath } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';

type SessionSummary = {
  id: string;
  createdAt: string;
  topic: string;
  status: string;
  step: string;
  progress: number;
  mode: 'fast' | 'deep' | null;
  provider: string | null;
  model: string | null;
  planQueries: number;
  selectedUrls: number;
  counts: {
    evidence: number;
    tape: number;
    nodes: number;
    edges: number;
    clusters: number;
  };
  mapTags?: string[];
};

type TraceEvent = {
  id: number;
  created_at: string;
  type: string;
  payload: any;
};

type SessionDetailResponse = {
  session: {
    id: string;
    created_at: string;
    topic: string;
    status: string;
    step: string;
    progress: number;
    meta: any;
  };
  events: TraceEvent[];
};

type PerfApiEntry = {
  name: string;
  calls: number;
  totalMs: number;
  avgMs: number;
  failures: number;
};

type PerfSummary = {
  status: string;
  totalMs: number;
  generatedAt: number;
  marksStored: number;
  stepDurationsMs: Record<string, number>;
  api: PerfApiEntry[];
};

const PERF_STEP_ORDER = ['plan', 'search', 'scrape', 'extract', 'link', 'cluster', 'render', 'ready'] as const;

function formatTime(ts: string) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return ts;
  return d.toLocaleString();
}

function compact(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

function asFiniteNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatSeconds(ms: number) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function formatDuration(ms: number) {
  const safe = Math.max(0, Math.round(ms));
  if (safe < 60_000) return formatSeconds(safe);
  const mins = Math.floor(safe / 60_000);
  const rem = safe - mins * 60_000;
  return `${mins}m ${formatSeconds(rem)}`;
}

function normalizePerfSummary(raw: unknown): PerfSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const totalMs = asFiniteNumber(src.totalMs);
  if (!totalMs) return null;

  const stepDurationsSrc =
    src.stepDurationsMs && typeof src.stepDurationsMs === 'object' ? (src.stepDurationsMs as Record<string, unknown>) : {};
  const stepEntries = Object.entries(stepDurationsSrc)
    .map(([k, v]): [string, number] => [String(k), asFiniteNumber(v)])
    .filter(([, v]) => v > 0);
  const stepDurationsMs = Object.fromEntries(stepEntries);

  const apiSrc = Array.isArray(src.api) ? src.api : [];
  const api: PerfApiEntry[] = apiSrc
    .map((row) => {
      const r = (row || {}) as Record<string, unknown>;
      return {
        name: String(r.name || 'api'),
        calls: Math.max(0, Math.round(asFiniteNumber(r.calls))),
        totalMs: asFiniteNumber(r.totalMs),
        avgMs: asFiniteNumber(r.avgMs),
        failures: Math.max(0, Math.round(asFiniteNumber(r.failures))),
      };
    })
    .filter((r) => r.totalMs > 0);

  return {
    status: String(src.status || 'unknown'),
    totalMs,
    generatedAt: asFiniteNumber(src.generatedAt),
    marksStored: Math.max(0, Math.round(asFiniteNumber(src.marksStored))),
    stepDurationsMs,
    api,
  };
}

function normalizeTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim();
  if (!tag) return null;
  return tag.length > 36 ? `${tag.slice(0, 33)}...` : tag;
}

function bumpCount(store: Map<string, { label: string; count: number }>, value: unknown, count = 1) {
  const tag = normalizeTag(value);
  if (!tag) return;
  const key = tag.toLowerCase();
  const current = store.get(key);
  if (current) {
    current.count += count;
    return;
  }
  store.set(key, { label: tag, count });
}

function takeTopTags(
  store: Map<string, { label: string; count: number }>,
  limit: number,
): Array<{ label: string; count: number }> {
  return Array.from(store.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function sessionSummaryLine(ev: TraceEvent) {
  const p = ev.payload || {};
  if (ev.type === 'step') return `${p?.step ?? 'step'} · ${Math.round((p?.progress ?? 0) * 100)}%`;
  if (ev.type === 'plan') return `${(p?.queries?.length ?? 0)} queries`;
  if (ev.type === 'search.partial') return `${p?.query ?? 'query'} · ${p?.found ?? 0} found`;
  if (ev.type === 'search') return `${(p?.results?.length ?? 0)} results`;
  if (ev.type === 'scrape.page') return `${String(p?.url || 'page').slice(0, 90)}`;
  if (ev.type === 'evidence') return `${(p?.items?.length ?? 0)} evidence`;
  if (ev.type === 'summaries') return `${(p?.items?.length ?? 0)} summaries`;
  if (ev.type === 'tape') return `${(p?.items?.length ?? 0)} tape items`;
  if (ev.type === 'graph') return `${(p?.nodes?.length ?? 0)} nodes · ${(p?.edges?.length ?? 0)} edges`;
  if (ev.type === 'clusters') return `${(p?.items?.length ?? 0)} clusters`;
  if (ev.type === 'perf.mark') {
    const phase = String(p?.phase || 'perf');
    const name = String(p?.name || 'mark');
    const ms = Number(p?.ms ?? 0);
    const failed = p?.ok === false;
    return `${phase}:${name} · ${formatSeconds(ms)}${failed ? ' · fail' : ''}`;
  }
  if (ev.type === 'perf.summary') {
    const totalMs = Number(p?.totalMs ?? 0);
    const stepCount =
      p?.stepDurationsMs && typeof p.stepDurationsMs === 'object' ? Object.keys(p.stepDurationsMs as Record<string, unknown>).length : 0;
    const topApi = Array.isArray(p?.api) && p.api.length ? p.api[0] : null;
    const topApiLabel =
      topApi && typeof topApi === 'object'
        ? `${String((topApi as any).name || 'api')} ${formatSeconds(Number((topApi as any).totalMs || 0))}`
        : null;
    return `total ${formatDuration(totalMs)} · ${stepCount} steps${topApiLabel ? ` · top ${topApiLabel}` : ''}`;
  }
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
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function toneForStatus(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'ready') return 'teal' as const;
  if (s === 'error') return 'orange' as const;
  return 'neutral' as const;
}

export function SessionDashboard() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tab, setTab] = useState<'artifacts' | 'trace'>('artifacts');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const detailInFlightRef = useRef(false);

  useEffect(() => {
    if (!copiedKey) return;
    const t = window.setTimeout(() => setCopiedKey(null), 1200);
    return () => window.clearTimeout(t);
  }, [copiedKey]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: '80' });
      if (query.trim()) qs.set('q', query.trim());
      const res = await fetch(apiPath(`/api/sessions?${qs.toString()}`), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load sessions');
      const list = (json?.sessions || []) as SessionSummary[];
      setSessions(list);
      if (!selectedId && list.length) setSelectedId(list[0].id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load sessions';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [query, selectedId]);

  const fetchDetail = useCallback(async (id: string) => {
    if (!id) return;
    if (detailInFlightRef.current) return;
    detailInFlightRef.current = true;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const qs = new URLSearchParams({ sessionId: id, limit: '500' });
      const res = await fetch(apiPath(`/api/sessions/events?${qs.toString()}`), { cache: 'no-store' });
      const json = (await res.json()) as SessionDetailResponse & { error?: string };
      if (!res.ok) throw new Error(json?.error || 'Failed to load session');
      setDetail(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load session';
      setDetailError(msg);
      setDetail(null);
    } finally {
      setDetailLoading(false);
      detailInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void fetchDetail(selectedId);
  }, [fetchDetail, selectedId]);

  const selectedSummary = useMemo(() => sessions.find((s) => s.id === selectedId) || null, [selectedId, sessions]);

  const artifacts = detail?.session?.meta?.artifacts || null;
  const evidence = Array.isArray(artifacts?.evidence) ? artifacts.evidence : [];
  const tape = Array.isArray(artifacts?.tape) ? artifacts.tape : [];
  const nodes = Array.isArray(artifacts?.nodes) ? artifacts.nodes : [];
  const edges = Array.isArray(artifacts?.edges) ? artifacts.edges : [];
  const clusters = Array.isArray(artifacts?.clusters) ? artifacts.clusters : [];
  const videos = Array.isArray(artifacts?.videos?.items) ? artifacts.videos.items : [];

  const perf = useMemo(() => {
    const fromMeta = normalizePerfSummary(detail?.session?.meta?.perf);
    if (fromMeta) return fromMeta;

    const events = detail?.events || [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i];
      if (ev?.type !== 'perf.summary') continue;
      const parsed = normalizePerfSummary(ev.payload);
      if (parsed) return parsed;
    }
    return null;
  }, [detail?.events, detail?.session?.meta?.perf]);

  const perfStepRows = useMemo(() => {
    if (!perf) return [] as Array<{ step: string; ms: number; pct: number }>;
    const entries = Object.entries(perf.stepDurationsMs || {}).filter(([, ms]) => ms > 0);
    const orderMap = new Map<string, number>(PERF_STEP_ORDER.map((s, idx) => [s, idx]));
    return entries
      .map(([step, ms]) => ({ step, ms, pct: perf.totalMs > 0 ? Math.min(100, (ms / perf.totalMs) * 100) : 0 }))
      .sort((a, b) => {
        const ai = orderMap.has(a.step) ? (orderMap.get(a.step) as number) : Number.MAX_SAFE_INTEGER;
        const bi = orderMap.has(b.step) ? (orderMap.get(b.step) as number) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return b.ms - a.ms;
      });
  }, [perf]);

  const perfApiRows = useMemo(() => {
    if (!perf?.api?.length) return [] as PerfApiEntry[];
    return [...perf.api].sort((a, b) => b.totalMs - a.totalMs);
  }, [perf]);

  const detailMapTagGroups = useMemo(() => {
    const nodeTypes = new Map<string, { label: string; count: number }>();
    const edgeTypes = new Map<string, { label: string; count: number }>();
    const tapeTags = new Map<string, { label: string; count: number }>();
    const entities = new Map<string, { label: string; count: number }>();
    const catalysts = new Map<string, { label: string; count: number }>();
    const media = new Map<string, { label: string; count: number }>();

    for (const node of nodes) {
      bumpCount(nodeTypes, node?.type, 1);
      bumpCount(nodeTypes, node?.meta?.kind, 1);
    }
    for (const edge of edges) {
      bumpCount(edgeTypes, edge?.type, 1);
    }
    for (const item of tape) {
      const tags = Array.isArray(item?.tags) ? item.tags : [];
      for (const tag of tags) bumpCount(tapeTags, tag, 1);
    }
    for (const item of evidence) {
      const aiSummary = item?.aiSummary || {};
      const summaryEntities = Array.isArray(aiSummary.entities) ? aiSummary.entities : [];
      const summaryCatalysts = Array.isArray(aiSummary.catalysts) ? aiSummary.catalysts : [];
      for (const entity of summaryEntities) bumpCount(entities, entity, 1);
      for (const catalyst of summaryCatalysts) bumpCount(catalysts, catalyst, 1);
    }
    for (const item of videos) {
      bumpCount(media, item?.platform || item?.provider, 1);
      bumpCount(media, item?.channel || item?.author, 1);
    }

    return [
      { label: 'Nodes', tags: takeTopTags(nodeTypes, 6) },
      { label: 'Edges', tags: takeTopTags(edgeTypes, 6) },
      { label: 'Tape', tags: takeTopTags(tapeTags, 8) },
      { label: 'Entities', tags: takeTopTags(entities, 8) },
      { label: 'Catalysts', tags: takeTopTags(catalysts, 8) },
      { label: 'Media', tags: takeTopTags(media, 6) },
    ].filter((group) => group.tags.length > 0);
  }, [edges, evidence, nodes, tape, videos]);

  return (
    <div className="min-h-screen">
      <div className="bg-terminal fixed inset-0 -z-10" />

      <header className="sticky top-0 z-40">
        <div className="mx-auto max-w-[1520px] px-4 py-3">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(0,102,255,0.16)] via-transparent to-[rgba(255,82,28,0.12)] opacity-70" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/terminal"
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/75 transition hover:bg-white/[0.06]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Terminal
                </Link>
                <div className="hidden h-9 w-px bg-white/10 sm:block" />
                <div>
                  <div className="text-xs font-semibold tracking-[0.22em] text-white/50">BRIGHT DATA</div>
                  <div className="text-lg font-semibold text-white/90">Sessions Dashboard</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/how-it-works"
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06]"
                >
                  Architecture
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/12 bg-white/[0.03]"
                  onClick={() => void fetchSessions()}
                  disabled={loading}
                >
                  <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1520px] px-4 pb-14">
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Panel
              title="Sessions"
              hint="Loaded from PostgreSQL (sessions + session_events)"
              icon={<LayoutDashboard className="h-4 w-4" />}
              actions={
                <div className="flex items-center gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by topic..."
                    className="h-9 w-[min(260px,48vw)] border-white/10 bg-white/[0.02]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/12 bg-white/[0.03]"
                    onClick={() => void fetchSessions()}
                    disabled={loading}
                    title="Refresh list"
                  >
                    <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
                  </Button>
                </div>
              }
            >
              {error ? (
                <div className="rounded-2xl border border-white/10 bg-[rgba(255,82,28,0.08)] px-3 py-3 text-sm text-white/70">
                  {error}
                </div>
              ) : null}

              {!sessions.length && !loading ? (
                <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                  No sessions yet. Run a topic in the terminal to populate history.
                </div>
              ) : (
                <div className="max-h-[72vh] overflow-auto pr-1">
                  <div className="space-y-2">
                    {sessions.map((s) => {
                      const selected = s.id === selectedId;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(s.id);
                            setTab('artifacts');
                          }}
                          className={cn(
                            'w-full rounded-2xl border px-3 py-3 text-left transition',
                            selected ? 'border-white/20 bg-white/[0.06]' : 'border-white/10 bg-[var(--panel-2)] hover:bg-white/[0.06]',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-white/88">{s.topic}</div>
                              <div className="mt-0.5 text-[11px] text-white/45 mono">{formatTime(s.createdAt)}</div>
                            </div>
                            <Badge tone={toneForStatus(s.status)} className="mono">
                              {s.status}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                            {s.mode ? <Badge className="mono">{s.mode}</Badge> : null}
                            {s.provider ? <Badge className="mono">{s.provider}</Badge> : null}
                            <span className="rounded-md bg-white/[0.04] px-2 py-1">
                              ev <span className="mono text-white/75">{compact(s.counts.evidence)}</span>
                            </span>
                            <span className="rounded-md bg-white/[0.04] px-2 py-1">
                              n <span className="mono text-white/75">{compact(s.counts.nodes)}</span>
                            </span>
                            <span className="rounded-md bg-white/[0.04] px-2 py-1">
                              e <span className="mono text-white/75">{compact(s.counts.edges)}</span>
                            </span>
                          </div>
                          {Array.isArray(s.mapTags) && s.mapTags.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {s.mapTags.slice(0, 4).map((tag) => (
                                <span
                                  key={`${s.id}_${tag}`}
                                  className="rounded-full border border-white/12 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/62"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-2">
                            <Link
                              href={`/terminal?sessionId=${encodeURIComponent(s.id)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.06]"
                            >
                              Open snapshot
                            </Link>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <div className="lg:col-span-8">
            <Panel
              title={selectedSummary ? `Session: ${selectedSummary.topic}` : 'Session'}
              hint={selectedId ? selectedId : 'Select a session on the left'}
              icon={<Activity className="h-4 w-4" />}
              actions={
                selectedId ? (
                  <div className="flex items-center gap-2">
                    <div className="hidden items-center rounded-full border border-white/10 bg-white/[0.03] p-1 text-[11px] text-white/60 sm:flex">
                      <button
                        type="button"
                        className={cn(
                          'rounded-full px-3 py-1 transition',
                          tab === 'artifacts' ? 'bg-white/10 text-white/80' : 'text-white/55 hover:text-white/75',
                        )}
                        onClick={() => setTab('artifacts')}
                      >
                        Artifacts
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'rounded-full px-3 py-1 transition',
                          tab === 'trace' ? 'bg-white/10 text-white/80' : 'text-white/55 hover:text-white/75',
                        )}
                        onClick={() => setTab('trace')}
                      >
                        Trace
                      </button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/12 bg-white/[0.03]"
                      onClick={() => (selectedId ? void fetchDetail(selectedId) : null)}
                      disabled={detailLoading || !selectedId}
                      title="Reload session details"
                    >
                      <RefreshCw className={cn('h-4 w-4', detailLoading ? 'animate-spin' : '')} />
                      Refresh
                    </Button>
                    <Link
                      href={selectedId ? `/terminal?sessionId=${encodeURIComponent(selectedId)}` : '/terminal'}
                      className={cn(
                        'inline-flex h-9 items-center rounded-xl border border-white/12 bg-white/[0.03] px-3 text-xs font-semibold text-white/75 transition hover:bg-white/[0.06]',
                        !selectedId ? 'pointer-events-none opacity-50' : '',
                      )}
                    >
                      Open snapshot
                    </Link>
                  </div>
                ) : null
              }
            >
              {detailError ? (
                <div className="rounded-2xl border border-white/10 bg-[rgba(255,82,28,0.08)] px-3 py-3 text-sm text-white/70">
                  {detailError}
                </div>
              ) : null}

              {!selectedId ? (
                <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                  Pick a session to view stored artifacts and the pipeline trace.
                </div>
              ) : detailLoading && !detail ? (
                <div className="space-y-2">
                  <div className="h-12 rounded-2xl bg-white/[0.03] shimmer" />
                  <div className="h-12 rounded-2xl bg-white/[0.03] shimmer" />
                  <div className="h-12 rounded-2xl bg-white/[0.03] shimmer" />
                </div>
              ) : !detail ? (
                <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                  No session data loaded.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3">
                    <div className="min-w-0">
                      <div className="mono text-[11px] font-semibold text-white/70">{detail.session.id}</div>
                      <div className="mt-1 text-sm text-white/75">
                        Stored: <span className="mono text-white/85">{formatTime(detail.session.created_at)}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-white/45">
                        status <span className="mono text-white/70">{detail.session.status}</span> · step{' '}
                        <span className="mono text-white/70">{detail.session.step}</span> ·{' '}
                        {Math.round((detail.session.progress || 0) * 100)}%
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/12 bg-white/[0.03]"
                        onClick={async () => {
                          const ok = await copyToClipboard(detail.session.id);
                          if (ok) setCopiedKey('session.id');
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        {copiedKey === 'session.id' ? 'Copied' : 'Copy'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/12 bg-white/[0.03]"
                        onClick={async () => {
                          const ok = await copyToClipboard(JSON.stringify(detail.session.meta || {}, null, 2));
                          if (ok) setCopiedKey('session.meta');
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        {copiedKey === 'session.meta' ? 'Meta copied' : 'Copy meta'}
                      </Button>
                    </div>
                  </div>

                  {tab === 'trace' ? (
                    <div className="rounded-2xl border border-white/10 bg-black/10 p-2">
                      <div className="max-h-[62vh] overflow-auto p-2">
                        <div className="space-y-2">
                          {detail.events.map((ev) => {
                            const summary = sessionSummaryLine(ev);
                            return (
                              <div key={ev.id} className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="mono text-[11px] font-semibold text-white/70">{ev.type}</div>
                                    {summary ? <div className="mt-1 truncate text-sm text-white/80">{summary}</div> : null}
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
                                        if (ok) setCopiedKey(`ev.${ev.id}`);
                                      }}
                                    >
                                      <Copy
                                        className={cn(
                                          'h-3.5 w-3.5',
                                          copiedKey === `ev.${ev.id}` ? 'text-white/85' : 'text-white/55',
                                        )}
                                      />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {detail.session.meta?.mode ? <Badge className="mono">{detail.session.meta.mode}</Badge> : null}
                        {detail.session.meta?.provider ? <Badge className="mono">{detail.session.meta.provider}</Badge> : null}
                        {detail.session.meta?.model ? <Badge className="mono">{detail.session.meta.model}</Badge> : null}
                        <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-white/55">
                          evidence <span className="mono text-white/75">{compact(evidence.length)}</span>
                        </span>
                        <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-white/55">
                          tape <span className="mono text-white/75">{compact(tape.length)}</span>
                        </span>
                        <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-white/55">
                          nodes <span className="mono text-white/75">{compact(nodes.length)}</span>
                        </span>
                        <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-white/55">
                          edges <span className="mono text-white/75">{compact(edges.length)}</span>
                        </span>
                        <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-white/55">
                          clusters <span className="mono text-white/75">{compact(clusters.length)}</span>
                        </span>
                      </div>

                      {perf ? (
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-xs font-semibold tracking-[0.18em] text-white/45">RUN PERFORMANCE</div>
                            <Badge tone="blue" className="mono">
                              total {formatDuration(perf.totalMs)}
                            </Badge>
                            <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-white/55">
                              marks <span className="mono text-white/75">{compact(perf.marksStored)}</span>
                            </span>
                            <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-white/55">
                              status <span className="mono text-white/75">{perf.status}</span>
                            </span>
                          </div>

                          <div className="mt-2 space-y-2">
                            <details open className="rounded-xl border border-white/10 bg-[var(--panel-2)] px-3 py-2">
                              <summary className="cursor-pointer text-xs font-semibold tracking-[0.12em] text-white/60">
                                Overall steps ({perfStepRows.length})
                              </summary>
                              <div className="mt-2 space-y-2">
                                {perfStepRows.length ? (
                                  perfStepRows.map((row) => (
                                    <div key={`perf_step_${row.step}`} className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                                      <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="mono uppercase text-white/72">{row.step}</span>
                                        <span className="mono text-white/80">{formatSeconds(row.ms)}</span>
                                      </div>
                                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                                        <div
                                          className="h-full rounded-full bg-gradient-to-r from-[rgba(0,102,255,0.9)] to-[rgba(20,184,166,0.85)]"
                                          style={{ width: `${Math.max(2, Math.round(row.pct))}%` }}
                                        />
                                      </div>
                                      <div className="mt-1 text-right text-[10px] text-white/45 mono">{row.pct.toFixed(1)}%</div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-xs text-white/55">No step timings stored.</div>
                                )}
                              </div>
                            </details>

                            <details className="rounded-xl border border-white/10 bg-[var(--panel-2)] px-3 py-2">
                              <summary className="cursor-pointer text-xs font-semibold tracking-[0.12em] text-white/60">
                                API timings ({perfApiRows.length})
                              </summary>
                              <div className="mt-2 space-y-2">
                                {perfApiRows.length ? (
                                  perfApiRows.map((apiRow) => (
                                    <div key={`perf_api_${apiRow.name}`} className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                                      <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="mono text-white/78">{apiRow.name}</span>
                                        <span className="mono text-white/80">{formatSeconds(apiRow.totalMs)}</span>
                                      </div>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/50">
                                        <span>calls {apiRow.calls}</span>
                                        <span>avg {formatSeconds(apiRow.avgMs)}</span>
                                        <span>failures {apiRow.failures}</span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-xs text-white/55">No API timings stored.</div>
                                )}
                              </div>
                            </details>
                          </div>
                        </div>
                      ) : null}

                      {detailMapTagGroups.length ? (
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                          <div className="text-xs font-semibold tracking-[0.18em] text-white/45">EVIDENCE MAP TAGS</div>
                          <div className="mt-2 space-y-2">
                            {detailMapTagGroups.map((group) => (
                              <div key={group.label} className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                                  {group.label}
                                </span>
                                {group.tags.map((tag) => (
                                  <span
                                    key={`${group.label}_${tag.label}`}
                                    className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/70"
                                  >
                                    {tag.label} <span className="mono text-white/45">{tag.count}</span>
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                          <div className="text-xs font-semibold tracking-[0.18em] text-white/45">EVIDENCE (sample)</div>
                          <div className="mt-2 max-h-[320px] overflow-auto pr-1">
                            <div className="space-y-2">
                              {evidence.slice(0, 14).map((ev: any) => (
                                <div key={ev.id} className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-white/86">{ev.title}</div>
                                      <div className="mt-1 text-[11px] text-white/45">
                                        {ev.source}{' '}
                                        <span className="mono text-white/55">
                                          · {ev.timeKind === 'published' ? 'Published' : 'Seen'}{' '}
                                          {new Date(ev.publishedAt).toLocaleTimeString()}
                                        </span>
                                      </div>
                                    </div>
                                    <a
                                      href={ev.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="shrink-0 text-xs text-[rgba(153,197,255,0.9)] hover:text-white underline underline-offset-4"
                                    >
                                      Open
                                    </a>
                                  </div>
                                  {ev.aiSummary?.bullets?.length ? (
                                    <div className="mt-2 rounded-2xl border border-white/10 bg-black/10 px-3 py-2 text-sm text-white/75">
                                      <div className="text-[11px] font-semibold tracking-[0.18em] text-white/45">AI SUMMARY</div>
                                      <div className="mt-1 space-y-1">
                                        {ev.aiSummary.bullets.slice(0, 2).map((b: string, idx: number) => (
                                          <div key={`${ev.id}_b_${idx}`} className="flex gap-2">
                                            <span className="text-white/35">-</span>
                                            <span>{b}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                              {!evidence.length ? (
                                <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                                  No artifacts stored on this session yet.
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                            <div className="text-xs font-semibold tracking-[0.18em] text-white/45">BREAKING TAPE (sample)</div>
                            <div className="mt-2 max-h-[220px] overflow-auto pr-1">
                              <div className="space-y-2">
                                {tape.slice(0, 10).map((t: any) => (
                                  <div key={t.id} className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="text-sm font-semibold text-white/86">{t.title}</div>
                                      <div className="text-[11px] text-white/45 mono">{new Date(t.publishedAt).toLocaleTimeString()}</div>
                                    </div>
                                    <div className="mt-1 text-[11px] text-white/55">{t.source}</div>
                                    {Array.isArray(t.tags) && t.tags.length ? (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {t.tags.slice(0, 6).map((tag: string) => (
                                          <Badge key={`${t.id}_${tag}`} className="mono">
                                            {tag}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                                {!tape.length ? (
                                  <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                                    No tape items.
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                            <div className="text-xs font-semibold tracking-[0.18em] text-white/45">NARRATIVES (sample)</div>
                            <div className="mt-2 max-h-[220px] overflow-auto pr-1">
                              <div className="space-y-2">
                                {clusters.slice(0, 6).map((c: any) => (
                                  <div key={c.id} className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="text-sm font-semibold text-white/86">{c.title}</div>
                                      <Badge className="capitalize">{c.momentum}</Badge>
                                    </div>
                                    <div className="mt-1 text-sm text-white/70">{c.summary}</div>
                                  </div>
                                ))}
                                {!clusters.length ? (
                                  <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] px-3 py-3 text-sm text-white/60">
                                    No clusters.
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}
