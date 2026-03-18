'use client';

import { Link } from '@/i18n/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, Copy, LayoutDashboard, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn, apiPath } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionLabel } from '@/components/ui/section-label';
import { MomentumBadge } from '@/components/ui/momentum-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { SiteHeader } from '@/components/layout/site-header';
import { PageBackground } from '@/components/layout/page-background';

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

/* ── Stat chip ──────────────────────────────────────────────────────── */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-2 py-1 text-[11px] text-white/55">
      {label} <span className="mono text-white/75">{value}</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export function SessionDashboard() {
  const t = useTranslations('dashboard');
  const nav = useTranslations('nav');

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>('artifacts');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const detailInFlightRef = useRef(false);

  useEffect(() => {
    if (!copiedKey) return;
    const timer = window.setTimeout(() => setCopiedKey(null), 1200);
    return () => window.clearTimeout(timer);
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
    const catalystMap = new Map<string, { label: string; count: number }>();
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
      for (const catalyst of summaryCatalysts) bumpCount(catalystMap, catalyst, 1);
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
      { label: 'Catalysts', tags: takeTopTags(catalystMap, 8) },
      { label: 'Media', tags: takeTopTags(media, 6) },
    ].filter((group) => group.tags.length > 0);
  }, [edges, evidence, nodes, tape, videos]);

  return (
    <div className="min-h-screen">
      <PageBackground />
      <SiteHeader />

      {/* Page heading */}
      <div className="mx-auto max-w-[1520px] px-4 pb-4 pt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/terminal">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
                {nav('terminal')}
              </Button>
            </Link>
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">{t('sessions')}</p>
              <h1 className="text-lg font-semibold text-white/90">{nav('dashboard')}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/how-it-works">
              <Button variant="outline" size="sm">{nav('architecture')}</Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchSessions()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
              {t('refresh')}
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1520px] px-4 pb-14">
        <div className="grid gap-5 lg:grid-cols-12">
          {/* ── Left: Session List ──────────────────────────────────── */}
          <div className="lg:col-span-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-white/50" />
                  <CardTitle>{t('sessions')}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('filterByTopic')}
                    className="h-8 w-[min(200px,40vw)] text-[12px]"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => void fetchSessions()}
                    disabled={loading}
                    title={t('refresh')}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', loading ? 'animate-spin' : '')} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {error && (
                  <Card className="border-orange/25 bg-orange/[0.06] p-3 text-sm text-white/70">
                    {error}
                  </Card>
                )}

                {!sessions.length && !loading ? (
                  <EmptyState
                    icon={<LayoutDashboard className="h-8 w-8" />}
                    title={t('noSessions')}
                    description={t('noSessionsDesc')}
                    action={
                      <Link href="/terminal">
                        <Button size="sm">{t('openTerminal')}</Button>
                      </Link>
                    }
                  />
                ) : (
                  <ScrollArea className="max-h-[72vh]">
                    <div className="space-y-2 pr-2">
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
                              'w-full rounded-xl border p-3 text-left transition',
                              selected
                                ? 'border-white/20 bg-white/[0.07]'
                                : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]',
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-semibold text-white/88">{s.topic}</div>
                                <div className="mt-0.5 text-[11px] text-white/40 mono">{formatTime(s.createdAt)}</div>
                              </div>
                              <Badge tone={toneForStatus(s.status)} className="mono shrink-0">
                                {s.status}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {s.mode && <Badge className="mono">{s.mode}</Badge>}
                              {s.provider && <Badge className="mono">{s.provider}</Badge>}
                              <Stat label="ev" value={compact(s.counts.evidence)} />
                              <Stat label="n" value={compact(s.counts.nodes)} />
                              <Stat label="e" value={compact(s.counts.edges)} />
                            </div>
                            {Array.isArray(s.mapTags) && s.mapTags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {s.mapTags.slice(0, 4).map((tag) => (
                                  <Badge key={`${s.id}_${tag}`} className="text-[10px]">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="mt-2">
                              <Link
                                href={`/terminal?sessionId=${encodeURIComponent(s.id)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center text-[11px] font-medium text-primary/80 hover:text-primary"
                              >
                                {t('openSnapshot')} &rarr;
                              </Link>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Session Detail ──────────────────────────────── */}
          <div className="lg:col-span-8">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-white/50" />
                  <div>
                    <CardTitle>
                      {selectedSummary ? selectedSummary.topic : t('sessions')}
                    </CardTitle>
                    <p className="mt-0.5 text-[11px] text-white/40 mono">
                      {selectedId || t('selectSession')}
                    </p>
                  </div>
                </div>
                {selectedId && (
                  <div className="flex items-center gap-2">
                    <Tabs value={tab} onValueChange={setTab}>
                      <TabsList className="hidden sm:inline-flex">
                        <TabsTrigger value="artifacts">{t('artifacts')}</TabsTrigger>
                        <TabsTrigger value="trace">{t('trace')}</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => (selectedId ? void fetchDetail(selectedId) : null)}
                      disabled={detailLoading || !selectedId}
                    >
                      <RefreshCw className={cn('h-4 w-4', detailLoading ? 'animate-spin' : '')} />
                      {t('refresh')}
                    </Button>
                    <Link
                      href={selectedId ? `/terminal?sessionId=${encodeURIComponent(selectedId)}` : '/terminal'}
                      className={!selectedId ? 'pointer-events-none opacity-50' : ''}
                    >
                      <Button variant="outline" size="sm">{t('openSnapshot')}</Button>
                    </Link>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {detailError && (
                  <Card className="border-orange/25 bg-orange/[0.06] p-3 text-sm text-white/70 mb-4">
                    {detailError}
                  </Card>
                )}

                {!selectedId ? (
                  <EmptyState
                    icon={<Activity className="h-8 w-8" />}
                    title={t('selectSession')}
                    description={t('selectSessionDesc')}
                  />
                ) : detailLoading && !detail ? (
                  <div className="space-y-3">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : !detail ? (
                  <EmptyState
                    icon={<Activity className="h-8 w-8" />}
                    title={t('noSessionData')}
                    description={t('noSessionDataDesc')}
                  />
                ) : (
                  <div className="space-y-5">
                    {/* Session header info */}
                    <Card className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mono text-[11px] font-semibold text-white/60">{detail.session.id}</div>
                          <div className="mt-1 text-[13px] text-white/75">
                            {t('stored')}: <span className="mono text-white/85">{formatTime(detail.session.created_at)}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-white/40">
                            status <span className="mono text-white/65">{detail.session.status}</span> · step{' '}
                            <span className="mono text-white/65">{detail.session.step}</span> ·{' '}
                            {Math.round((detail.session.progress || 0) * 100)}%
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const ok = await copyToClipboard(detail.session.id);
                              if (ok) setCopiedKey('session.id');
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {copiedKey === 'session.id' ? t('copied') : t('copyId')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const ok = await copyToClipboard(JSON.stringify(detail.session.meta || {}, null, 2));
                              if (ok) setCopiedKey('session.meta');
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {copiedKey === 'session.meta' ? t('copied') : t('meta')}
                          </Button>
                        </div>
                      </div>
                    </Card>

                    {tab === 'trace' ? (
                      /* ── Trace tab ─────────────────────────────── */
                      <Card className="p-3">
                        <ScrollArea className="max-h-[62vh]">
                          <div className="space-y-2 p-1">
                            {detail.events.map((ev) => {
                              const summary = sessionSummaryLine(ev);
                              return (
                                <div key={ev.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <Badge className="mono">{ev.type}</Badge>
                                      {summary && <div className="mt-1.5 truncate text-[13px] text-white/75">{summary}</div>}
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <div className="text-[11px] text-white/40 mono">{new Date(ev.created_at).toLocaleTimeString()}</div>
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
                                            copiedKey === `ev.${ev.id}` ? 'text-white/85' : 'text-white/45',
                                          )}
                                        />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </Card>
                    ) : (
                      /* ── Artifacts tab ──────────────────────────── */
                      <div className="space-y-5">
                        {/* Meta badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          {detail.session.meta?.mode && <Badge className="mono">{detail.session.meta.mode}</Badge>}
                          {detail.session.meta?.provider && <Badge className="mono">{detail.session.meta.provider}</Badge>}
                          {detail.session.meta?.model && <Badge className="mono">{detail.session.meta.model}</Badge>}
                          <Stat label="evidence" value={compact(evidence.length)} />
                          <Stat label="tape" value={compact(tape.length)} />
                          <Stat label="nodes" value={compact(nodes.length)} />
                          <Stat label="edges" value={compact(edges.length)} />
                          <Stat label="clusters" value={compact(clusters.length)} />
                        </div>

                        {/* Performance */}
                        {perf && (
                          <Card className="p-4">
                            <div className="flex flex-wrap items-center gap-2 mb-4">
                              <SectionLabel>{t('runPerformance')}</SectionLabel>
                              <Badge variant="blue" className="mono">total {formatDuration(perf.totalMs)}</Badge>
                              <Stat label="marks" value={compact(perf.marksStored)} />
                              <Stat label="status" value={perf.status} />
                            </div>

                            <div className="space-y-3">
                              <details open className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                                <summary className="cursor-pointer text-[12px] font-semibold text-white/60">
                                  {t('overallSteps')} ({perfStepRows.length})
                                </summary>
                                <div className="mt-3 space-y-2">
                                  {perfStepRows.length ? (
                                    perfStepRows.map((row) => (
                                      <div key={`perf_step_${row.step}`} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                                        <div className="flex items-center justify-between gap-2 text-[12px]">
                                          <span className="mono uppercase text-white/70">{row.step}</span>
                                          <span className="mono text-white/80">{formatSeconds(row.ms)}</span>
                                        </div>
                                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                                          <div
                                            className="h-full rounded-full bg-gradient-to-r from-primary to-teal"
                                            style={{ width: `${Math.max(2, Math.round(row.pct))}%` }}
                                          />
                                        </div>
                                        <div className="mt-1 text-right text-[10px] text-white/40 mono">{row.pct.toFixed(1)}%</div>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-[12px] text-white/45">{t('noStepTimings')}</p>
                                  )}
                                </div>
                              </details>

                              <details className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                                <summary className="cursor-pointer text-[12px] font-semibold text-white/60">
                                  {t('apiTimings')} ({perfApiRows.length})
                                </summary>
                                <div className="mt-3 space-y-2">
                                  {perfApiRows.length ? (
                                    perfApiRows.map((apiRow) => (
                                      <div key={`perf_api_${apiRow.name}`} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                                        <div className="flex items-center justify-between gap-2 text-[12px]">
                                          <span className="mono text-white/70">{apiRow.name}</span>
                                          <span className="mono text-white/80">{formatSeconds(apiRow.totalMs)}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-white/45">
                                          <span>calls {apiRow.calls}</span>
                                          <span>avg {formatSeconds(apiRow.avgMs)}</span>
                                          <span>failures {apiRow.failures}</span>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-[12px] text-white/45">{t('noApiTimings')}</p>
                                  )}
                                </div>
                              </details>
                            </div>
                          </Card>
                        )}

                        {/* Map Tags */}
                        {detailMapTagGroups.length > 0 && (
                          <Card className="p-4">
                            <SectionLabel className="mb-3">{t('evidenceMapTags')}</SectionLabel>
                            <div className="space-y-3">
                              {detailMapTagGroups.map((group) => (
                                <div key={group.label} className="flex flex-wrap items-center gap-2">
                                  <SectionLabel>{group.label}</SectionLabel>
                                  {group.tags.map((tag) => (
                                    <Badge key={`${group.label}_${tag.label}`}>
                                      {tag.label} <span className="mono text-white/40 ml-1">{tag.count}</span>
                                    </Badge>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </Card>
                        )}

                        {/* Evidence & Tape grid */}
                        <div className="grid gap-5 lg:grid-cols-2">
                          {/* Evidence */}
                          <Card className="p-4">
                            <SectionLabel className="mb-3">{t('evidenceSample')}</SectionLabel>
                            <ScrollArea className="max-h-[320px]">
                              <div className="space-y-2 pr-2">
                                {evidence.slice(0, 14).map((ev: any) => (
                                  <div key={ev.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-[13px] font-semibold text-white/85">{ev.title}</div>
                                        <div className="mt-1 text-[11px] text-white/40">
                                          {ev.source}{' '}
                                          <span className="mono text-white/50">
                                            · {ev.timeKind === 'published' ? t('published') : t('seen')}{' '}
                                            {new Date(ev.publishedAt).toLocaleTimeString()}
                                          </span>
                                        </div>
                                      </div>
                                      <a
                                        href={ev.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="shrink-0 text-[11px] font-medium text-primary/80 hover:text-primary"
                                      >
                                        {t('open')}
                                      </a>
                                    </div>
                                    {ev.aiSummary?.bullets?.length > 0 && (
                                      <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                                        <SectionLabel>{t('aiSummary')}</SectionLabel>
                                        <div className="mt-1 space-y-1 text-[13px] text-white/70">
                                          {ev.aiSummary.bullets.slice(0, 2).map((b: string, idx: number) => (
                                            <div key={`${ev.id}_b_${idx}`} className="flex gap-2">
                                              <span className="text-white/30">-</span>
                                              <span>{b}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {!evidence.length && (
                                  <EmptyState title={t('noArtifacts')} description={t('noArtifactsDesc')} className="py-8" />
                                )}
                              </div>
                            </ScrollArea>
                          </Card>

                          {/* Tape + Narratives */}
                          <div className="space-y-5">
                            <Card className="p-4">
                              <SectionLabel className="mb-3">{t('breakingTape')}</SectionLabel>
                              <ScrollArea className="max-h-[220px]">
                                <div className="space-y-2 pr-2">
                                  {tape.slice(0, 10).map((tapeItem: any) => (
                                    <div key={tapeItem.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="text-[13px] font-semibold text-white/85">{tapeItem.title}</div>
                                        <div className="text-[11px] text-white/40 mono">{new Date(tapeItem.publishedAt).toLocaleTimeString()}</div>
                                      </div>
                                      <div className="mt-1 text-[11px] text-white/50">{tapeItem.source}</div>
                                      {Array.isArray(tapeItem.tags) && tapeItem.tags.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {tapeItem.tags.slice(0, 6).map((tag: string) => (
                                            <Badge key={`${tapeItem.id}_${tag}`} className="mono">{tag}</Badge>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                  {!tape.length && (
                                    <EmptyState title={t('noTapeItems')} className="py-6" />
                                  )}
                                </div>
                              </ScrollArea>
                            </Card>

                            <Card className="p-4">
                              <SectionLabel className="mb-3">{t('narrativesSample')}</SectionLabel>
                              <ScrollArea className="max-h-[220px]">
                                <div className="space-y-2 pr-2">
                                  {clusters.slice(0, 6).map((c: any) => (
                                    <div key={c.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="text-[13px] font-semibold text-white/85">{c.title}</div>
                                        <MomentumBadge momentum={c.momentum} />
                                      </div>
                                      <div className="mt-1 text-[13px] text-white/65">{c.summary}</div>
                                    </div>
                                  ))}
                                  {!clusters.length && (
                                    <EmptyState title={t('noClusters')} className="py-6" />
                                  )}
                                </div>
                              </ScrollArea>
                            </Card>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
