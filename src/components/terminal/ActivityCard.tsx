'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Globe, LayoutDashboard, Layers, Link2, Search, Sparkles, TextQuote, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useTranslations } from 'next-intl';
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

function queueMeta(it: QueryQueueItem, t: (k: string, v?: Record<string, string>) => string) {
  if (it.state === 'running') return t('stateRunning');
  if (it.state === 'failed') return t('stateFailed');
  if (typeof it.added === 'number') return t('addedResults', { count: compactCount(it.added) });
  if (typeof it.foundTotal === 'number') return t('totalResults', { count: compactCount(it.foundTotal) });
  if (it.state === 'done') return t('stateDone');
  return t('stateQueued');
}

function stateLabel(state: QueueItemState, t: (k: string) => string) {
  const map: Record<QueueItemState, string> = {
    queued: t('stateQueued'),
    running: t('stateRunning'),
    done: t('stateDone'),
    failed: t('stateFailed'),
  };
  return map[state];
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
  const t = useTranslations('workspace');
  const [expanded, setExpanded] = useState(false);

  const activeKey = stageKeyForStep(step);
  const activeIdx = activeKey ? stageIndex(activeKey) : -1;
  const [focus, setFocus] = useState<StageKey>(() => activeKey || 'plan');
  const [pinnedFocus, setPinnedFocus] = useState(false);

  const stages = useMemo(() => {
    const base: Array<{ key: StageKey; label: string; icon: LucideIcon }> = [
      { key: 'plan', label: t('pipelinePlan'), icon: Sparkles },
      { key: 'search', label: t('pipelineSearch'), icon: Search },
      { key: 'scrape', label: t('pipelineScrape'), icon: Globe },
      { key: 'extract', label: t('pipelineExtract'), icon: TextQuote },
      { key: 'link', label: t('pipelineLink'), icon: Link2 },
      { key: 'cluster', label: t('pipelineCluster'), icon: Layers },
      { key: 'render', label: t('pipelineRender'), icon: LayoutDashboard },
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
  }, [activeIdx, mode, step, t]);

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
    if (step === 'idle') return t('idle');
    if (step === 'ready') return t('ready');
    return step.toUpperCase();
  }, [step, t]);

  const activeFocus = pinnedFocus ? focus : activeKey || focus;

  const focusDetail = useMemo(() => {
    if (!expanded) return null;

    if (activeFocus === 'plan') {
      return (
        <div className="space-y-2">
          <SectionLabel className="mb-0">{t('plannedQueries')}</SectionLabel>
          {plan?.queries?.length ? (
            <div className="space-y-1">
              {plan.queries.slice(0, 10).map((q) => (
                <div key={q} className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-white/78">
                  {q}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/60">{t('planning')}</div>
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

    if (activeFocus === 'search') {
      return (
        <div className="space-y-3">
          <SectionLabel className="mb-0">{t('searchQueries')}</SectionLabel>
          {queryQueue.length ? (
            <div className="space-y-2">
              {queryQueue.map((it) => (
                <div key={it.query} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', queueDot(it.state))} />
                    <div className="min-w-0">
                      <div className="text-sm text-white/78">{it.query}</div>
                      <div className="mt-0.5 text-[11px] text-white/45 mono">{queueMeta(it, t)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/60">{t('waitingForQueries')}</div>
          )}

          {search?.results?.length ? (
            <>
              <SectionLabel className="mb-0">{t('topResults')}</SectionLabel>
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

    if (activeFocus === 'scrape') {
      if (mode !== 'deep') return <div className="text-sm text-white/60">{t('scrapeSkipped')}</div>;
      return (
        <div className="space-y-2">
          <SectionLabel className="mb-0">{t('scrapePages')}</SectionLabel>
          {scrapeQueue.length ? (
            <div className="space-y-2">
              {scrapeQueue.map((it) => (
                <div key={it.url} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', queueDot(it.state))} />
                    <div className="min-w-0">
                      <div className="text-sm text-white/78">{domainFromUrl(it.url)}</div>
                      <div className="mt-0.5 text-[11px] text-white/45 mono">{stateLabel(it.state, t)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/60">{t('waitingForScrape')}</div>
          )}
        </div>
      );
    }

    if (activeFocus === 'extract') {
      const uniq = Array.from(new Set((evidenceSources || []).map((s) => String(s || '').trim()).filter(Boolean))).slice(0, 10);
      return (
        <div className="space-y-2">
          <SectionLabel className="mb-0">{t('evidenceLabel')}</SectionLabel>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-white/75">
            {t('itemsCount', { count: compactCount(evidenceCount) })}{summariesCount ? ` · ${t('summarizedCount', { count: compactCount(summariesCount) })}` : ''}
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

    if (activeFocus === 'link') {
      const v = graphVariant === 'expanded' ? t('expandedPass') : graphVariant === 'initial' ? t('initialMap') : t('mapVariant');
      return (
        <div className="space-y-2">
          <SectionLabel className="mb-0">{t('mapLabel')}</SectionLabel>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-white/75">
            {t('nodesCount', { count: compactCount(nodesCount) })} · {t('edgesCount', { count: compactCount(edgesCount) })} · {v}
          </div>
          <div className="text-xs text-white/55">{t('tipClickNode')}</div>
        </div>
      );
    }

    if (activeFocus === 'cluster') {
      return (
        <div className="space-y-2">
          <SectionLabel className="mb-0">{t('narrativesLabel')}</SectionLabel>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-white/75">
            {t('clustersCount', { count: compactCount(clustersCount) })}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <SectionLabel className="mb-0">{t('render')}</SectionLabel>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-white/75">
          {t('panelsUpdatedShort')}
        </div>
      </div>
    );
  }, [
    clustersCount,
    evidenceCount,
    evidenceSources,
    expanded,
    activeFocus,
    graphVariant,
    mode,
    plan,
    queryQueue,
    scrapeQueue,
    search,
    summariesCount,
    nodesCount,
    edgesCount,
    t,
  ]);

  return (
    <Card className={cn('px-3 py-3', className)} data-running={running ? '1' : '0'}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SectionLabel>{t('activityTitle')}</SectionLabel>
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
            <Badge>{mode === 'deep' ? t('deep') : t('fast')}</Badge>
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
          {t('activityDetails')}
        </button>
      </div>

      {step === 'idle' ? (
        <div className="mt-3 text-xs leading-relaxed text-white/55">
          {t('activityHint')}
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
              return q ? t('queriesCount', { count: q }) : s.status === 'active' ? t('planning') : '';
            }
            if (isSearch) {
              const total = queuedCounts.total;
              if (!total) return search?.results?.length ? t('resultsCount', { count: search.results.length }) : s.status === 'active' ? t('runningStatus') : '';
              return `${queuedCounts.done}/${total}${queuedCounts.failed ? ` ${t('failCount', { count: queuedCounts.failed })}` : ''}`;
            }
            if (isScrape) {
              if (mode !== 'deep') return t('skipped');
              if (!scrapeCounts.total) return s.status === 'active' ? t('starting') : '';
              return `${scrapeCounts.done}/${scrapeCounts.total}${scrapeCounts.failed ? ` ${t('failCount', { count: scrapeCounts.failed })}` : ''}`;
            }
            if (isExtract) {
              const ev = compactCount(evidenceCount);
              const sum = summariesCount ? ` · ${t('summariesCount', { count: compactCount(summariesCount) })}` : '';
              return evidenceCount ? `${t('evidenceN', { count: ev })}${sum}` : s.status === 'active' ? t('extracting') : '';
            }
            if (isLink) {
              const v = graphVariant === 'expanded' ? ` · ${t('expandedPass')}` : graphVariant === 'initial' ? ` · ${t('initialMap')}` : '';
              return nodesCount ? `${compactCount(nodesCount)} n · ${compactCount(edgesCount)} e${v}` : s.status === 'active' ? t('linkingStatus') : '';
            }
            if (isCluster) {
              return clustersCount ? t('clustersCount', { count: compactCount(clustersCount) }) : s.status === 'active' ? t('clusteringStatus') : '';
            }
            if (s.key === 'render') {
              return s.status === 'done' ? t('panelsUpdatedLower') : s.status === 'active' ? t('updatingStatus') : '';
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
                activeFocus === s.key && expanded ? 'ring-1 ring-white/15' : '',
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
            <SectionLabel className="mb-0">{t('activityDetails')}</SectionLabel>
            <button
              type="button"
              className="text-[11px] font-semibold text-white/55 hover:text-white/75"
              onClick={() => setPinnedFocus(false)}
              title="Follow the active stage"
            >
              {t('followActive')}
            </button>
          </div>
          <div className="mt-2 max-h-64 overflow-auto pr-1">{focusDetail}</div>
        </div>
      ) : null}
    </Card>
  );
}
