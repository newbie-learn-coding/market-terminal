'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Globe, LayoutDashboard, Layers, Link2, Search, Sparkles, TextQuote, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import type { PipelineStep, PlanEvent, SearchEvent } from '@/components/terminal/PipelineTimeline';

type StageKey = Exclude<PipelineStep, 'idle' | 'ready'>;
type StageStatus = 'pending' | 'active' | 'done' | 'skipped';

export type QueueItemState = 'queued' | 'running' | 'done' | 'failed';

export type QueryQueueItem = {
  query: string;
  state: QueueItemState;
  added?: number;
  foundTotal?: number;
};

export type ScrapeQueueItem = {
  url: string;
  state: QueueItemState;
};

function stageKeyForStep(step: PipelineStep): StageKey | null {
  if (step === 'idle') return null;
  if (step === 'ready') return 'render';
  return step;
}

function stageIndex(key: StageKey) {
  const order: StageKey[] = ['plan', 'search', 'scrape', 'extract', 'link', 'cluster', 'render'];
  return order.indexOf(key);
}

function compactCount(n: number) {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

function domainFromUrl(rawUrl: string) {
  try {
    const u = new URL(rawUrl);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function dotClass(status: StageStatus) {
  if (status === 'active') return 'bg-[rgba(255,255,255,0.75)]';
  if (status === 'done') return 'bg-[rgba(80,210,150,0.8)]';
  if (status === 'skipped') return 'bg-white/20';
  return 'bg-white/25';
}

function queueDot(state: QueueItemState) {
  if (state === 'running') return 'bg-[rgba(255,255,255,0.75)]';
  if (state === 'done') return 'bg-[rgba(80,210,150,0.75)]';
  if (state === 'failed') return 'bg-[rgba(255,170,90,0.95)]';
  return 'bg-white/25';
}

function queueMeta(it: QueryQueueItem) {
  if (it.state === 'running') return 'running';
  if (it.state === 'failed') return 'failed';
  if (typeof it.added === 'number') return `+${compactCount(it.added)} results`;
  if (typeof it.foundTotal === 'number') return `${compactCount(it.foundTotal)} total`;
  if (it.state === 'done') return 'done';
  return 'queued';
}

export function ActivityCard({
  step,
  progress,
  mode,
  provider,
  running,
  plan,
  search,
  queryQueue,
  scrapeQueue,
  evidenceSources,
  evidenceCount,
  summariesCount,
  nodesCount,
  edgesCount,
  clustersCount,
  warningsCount,
  graphVariant,
  className,
}: {
  step: PipelineStep;
  progress: number;
  mode: 'fast' | 'deep';
  provider?: string;
  running: boolean;
  plan: PlanEvent | null;
  search: SearchEvent | null;
  queryQueue: QueryQueueItem[];
  scrapeQueue: ScrapeQueueItem[];
  evidenceSources: string[];
  evidenceCount: number;
  summariesCount: number;
  nodesCount: number;
  edgesCount: number;
  clustersCount: number;
  warningsCount: number;
  graphVariant: string | null;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const activeKey = stageKeyForStep(step);
  const activeIdx = activeKey ? stageIndex(activeKey) : -1;
  const [focus, setFocus] = useState<StageKey>(() => activeKey || 'plan');
  const [pinnedFocus, setPinnedFocus] = useState(false);

  useEffect(() => {
    if (pinnedFocus) return;
    if (!activeKey) return;
    setFocus(activeKey);
  }, [activeKey, pinnedFocus]);

  const stages = useMemo(() => {
    const base: Array<{ key: StageKey; label: string; icon: LucideIcon }> = [
      { key: 'plan', label: 'Plan', icon: Sparkles },
      { key: 'search', label: 'Search', icon: Search },
      { key: 'scrape', label: 'Scrape', icon: Globe },
      { key: 'extract', label: 'Extract', icon: TextQuote },
      { key: 'link', label: 'Link', icon: Link2 },
      { key: 'cluster', label: 'Cluster', icon: Layers },
      { key: 'render', label: 'Render', icon: LayoutDashboard },
    ];

    return base.map((s) => {
      const idx = stageIndex(s.key);
      let status: StageStatus;
      if (mode === 'fast' && s.key === 'scrape') {
        status = step === 'idle' ? 'pending' : 'skipped';
      } else if (activeIdx < 0) {
        status = 'pending';
      } else if (idx < activeIdx) {
        status = 'done';
      } else if (idx === activeIdx) {
        status = 'active';
      } else {
        status = 'pending';
      }
      return { ...s, status };
    });
  }, [activeIdx, mode, step]);

  const queuedCounts = useMemo(() => {
    const q = queryQueue || [];
    const total = q.length;
    const done = q.filter((x) => x.state === 'done').length;
    const failed = q.filter((x) => x.state === 'failed').length;
    const runningQ = q.some((x) => x.state === 'running');
    return { total, done, failed, runningQ };
  }, [queryQueue]);

  const scrapeCounts = useMemo(() => {
    const q = scrapeQueue || [];
    const total = q.length;
    const done = q.filter((x) => x.state === 'done').length;
    const failed = q.filter((x) => x.state === 'failed').length;
    const runningQ = q.some((x) => x.state === 'running');
    return { total, done, failed, runningQ };
  }, [scrapeQueue]);

  const headerLabel = useMemo(() => {
    if (step === 'idle') return 'Idle';
    if (step === 'ready') return 'Ready';
    return step.toUpperCase();
  }, [step]);

  const focusDetail = useMemo(() => {
    if (!expanded) return null;

    if (focus === 'plan') {
      return (
        <div className="space-y-2">
          <SectionLabel className="mb-0">Planned Queries</SectionLabel>
          {plan?.queries?.length ? (
            <div className="space-y-1">
              {plan.queries.slice(0, 10).map((q) => (
                <div key={q} className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-white/78">
                  {q}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/60">Planning...</div>
          )}
          {plan?.angles?.length ? (
            <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-white/55">
              {plan.angles.slice(0, 10).map((a) => (
                <span key={a} className="rounded-full bg-white/[0.04] px-2.5 py-1">
                  {a}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (focus === 'search') {
      return (
        <div className="space-y-3">
          <SectionLabel className="mb-0">Search Queries</SectionLabel>
          {queryQueue.length ? (
            <div className="space-y-2">
              {queryQueue.map((it) => (
                <div key={it.query} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', queueDot(it.state))} />
                    <div className="min-w-0">
                      <div className="text-sm text-white/78">{it.query}</div>
                      <div className="mt-0.5 text-[11px] text-white/45 mono">{queueMeta(it)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/60">Waiting for queries...</div>
          )}

          {search?.results?.length ? (
            <>
              <SectionLabel className="mb-0">Top Results</SectionLabel>
              <div className="space-y-1">
                {search.results.slice(0, 6).map((r) => (
                  <a
                    key={r.url}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2 text-sm text-white/75 hover:bg-white/[0.06]"
                  >
                    <div className="line-clamp-1 font-semibold text-white/82">{r.title}</div>
                    <div className="mt-0.5 text-[11px] text-white/45">{domainFromUrl(r.url)}</div>
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </div>
      );
    }

    if (focus === 'scrape') {
      if (mode !== 'deep') return <div className="text-sm text-white/60">Scrape is skipped in Fast mode.</div>;
      return (
        <div className="space-y-2">
          <SectionLabel className="mb-0">Scrape Pages</SectionLabel>
          {scrapeQueue.length ? (
            <div className="space-y-2">
              {scrapeQueue.map((it) => (
                <div key={it.url} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', queueDot(it.state))} />
                    <div className="min-w-0">
                      <div className="text-sm text-white/78">{domainFromUrl(it.url)}</div>
                      <div className="mt-0.5 text-[11px] text-white/45 mono">{it.state}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/60">Waiting for scrape step...</div>
          )}
        </div>
      );
    }

    if (focus === 'extract') {
      const uniq = Array.from(new Set((evidenceSources || []).map((s) => String(s || '').trim()).filter(Boolean))).slice(0, 10);
      return (
        <div className="space-y-2">
          <SectionLabel className="mb-0">Evidence</SectionLabel>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-white/75">
            {compactCount(evidenceCount)} items{summariesCount ? ` · ${compactCount(summariesCount)} summarized` : ''}
          </div>
          {uniq.length ? (
            <div className="flex flex-wrap gap-2 text-[11px] text-white/55">
              {uniq.map((s) => (
                <span key={s} className="rounded-full bg-white/[0.04] px-2.5 py-1">
                  {s}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (focus === 'link') {
      const v = graphVariant === 'expanded' ? 'expanded impact pass' : graphVariant === 'initial' ? 'initial map' : 'map';
      return (
        <div className="space-y-2">
          <SectionLabel className="mb-0">Map</SectionLabel>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-white/75">
            {compactCount(nodesCount)} nodes · {compactCount(edgesCount)} edges · {v}
          </div>
          <div className="text-xs text-white/55">Tip: click a node or edge to open evidence in the Inspector.</div>
        </div>
      );
    }

    if (focus === 'cluster') {
      return (
        <div className="space-y-2">
          <SectionLabel className="mb-0">Narratives</SectionLabel>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-white/75">
            {compactCount(clustersCount)} clusters
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <SectionLabel className="mb-0">Render</SectionLabel>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-white/75">
          Panels updated.
        </div>
      </div>
    );
  }, [
    clustersCount,
    evidenceCount,
    evidenceSources,
    expanded,
    focus,
    graphVariant,
    mode,
    plan?.angles,
    plan?.queries,
    queryQueue,
    scrapeQueue,
    search?.results,
    summariesCount,
    nodesCount,
    edgesCount,
  ]);

  return (
    <Card className={cn('px-3 py-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SectionLabel>Activity</SectionLabel>
            {warningsCount ? (
              <Badge variant="orange" className="gap-1">
                <TriangleAlert className="h-3.5 w-3.5" /> {warningsCount}
              </Badge>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-white/55">
            <Badge variant="blue">
              <span className="font-semibold">{headerLabel}</span>
              <span className="mx-1 text-white/35">&middot;</span>
              <span className="mono">{Math.round(Math.max(0, Math.min(1, progress)) * 100)}%</span>
            </Badge>
            <Badge>{mode === 'deep' ? 'Deep' : 'Fast'}</Badge>
            <Badge>{provider || 'ai'}</Badge>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-white/65 transition hover:bg-white/[0.06]"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse activity details' : 'Expand activity details'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Details
        </button>
      </div>

      {step === 'idle' ? (
        <div className="mt-3 text-xs leading-relaxed text-white/55">
          Ask a topic to start. The system will plan queries, pull sources with Bright Data, and build an evidence map you can inspect.
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-2">
        {stages.map((s) => {
          const Icon = s.icon;
          const isSearch = s.key === 'search';
          const isScrape = s.key === 'scrape';
          const isExtract = s.key === 'extract';
          const isLink = s.key === 'link';
          const isCluster = s.key === 'cluster';
          const isPlan = s.key === 'plan';

          const right = (() => {
            if (isPlan) {
              const q = plan?.queries?.length || 0;
              return q ? `${q} queries` : s.status === 'active' ? 'planning' : '';
            }
            if (isSearch) {
              const t = queuedCounts.total;
              if (!t) return search?.results?.length ? `${search.results.length} results` : s.status === 'active' ? 'running' : '';
              return `${queuedCounts.done}/${t}${queuedCounts.failed ? ` (${queuedCounts.failed} fail)` : ''}`;
            }
            if (isScrape) {
              if (mode !== 'deep') return 'skipped';
              if (!scrapeCounts.total) return s.status === 'active' ? 'starting' : '';
              return `${scrapeCounts.done}/${scrapeCounts.total}${scrapeCounts.failed ? ` (${scrapeCounts.failed} fail)` : ''}`;
            }
            if (isExtract) {
              const ev = compactCount(evidenceCount);
              const sum = summariesCount ? ` · ${compactCount(summariesCount)} summaries` : '';
              return evidenceCount ? `${ev} evidence${sum}` : s.status === 'active' ? 'extracting' : '';
            }
            if (isLink) {
              const v = graphVariant === 'expanded' ? ' · expanded' : graphVariant === 'initial' ? ' · initial' : '';
              return nodesCount ? `${compactCount(nodesCount)} n · ${compactCount(edgesCount)} e${v}` : s.status === 'active' ? 'linking' : '';
            }
            if (isCluster) {
              return clustersCount ? `${compactCount(clustersCount)} clusters` : s.status === 'active' ? 'clustering' : '';
            }
            if (s.key === 'render') {
              return s.status === 'done' ? 'panels updated' : s.status === 'active' ? 'updating' : '';
            }
            return '';
          })();

          return (
            <button
              type="button"
              key={s.key}
              className={cn(
                'flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.06]',
                s.status === 'active' ? 'bg-white/[0.05]' : '',
                focus === s.key && expanded ? 'ring-1 ring-white/15' : '',
              )}
              onClick={() => {
                setExpanded(true);
                setPinnedFocus(true);
                setFocus(s.key);
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dotClass(s.status))} />
                <Icon className="h-4 w-4 shrink-0 text-white/55" />
                <div className="min-w-0 text-sm font-semibold text-white/80">{s.label}</div>
              </div>
              <div className="text-xs text-white/55 mono">{right}</div>
            </button>
          );
        })}
      </div>

      {expanded ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel className="mb-0">Details</SectionLabel>
            <button
              type="button"
              className="text-[11px] font-semibold text-white/55 hover:text-white/75"
              onClick={() => setPinnedFocus(false)}
              title="Follow the active stage"
            >
              Follow active
            </button>
          </div>
          <div className="mt-2 max-h-64 overflow-auto pr-1">{focusDetail}</div>
        </div>
      ) : null}
    </Card>
  );
}
