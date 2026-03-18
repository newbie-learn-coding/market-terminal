'use client';

import { AlertTriangle, Globe, LayoutDashboard, Layers, Link2, ListTree, MinusCircle, Search, Sparkles, TextQuote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export type PipelineStep =
  | 'idle'
  | 'plan'
  | 'search'
  | 'scrape'
  | 'extract'
  | 'link'
  | 'cluster'
  | 'render'
  | 'ready';

export type PlanEvent = {
  queries: string[];
  angles?: string[];
  usedAI: boolean;
};

export type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

export type SearchEvent = {
  queries: string[];
  results: SearchResult[];
};

type StageKey = Exclude<PipelineStep, 'idle' | 'ready'>;

function stageKeyForStep(step: PipelineStep): StageKey | null {
  if (step === 'idle') return null;
  if (step === 'ready') return 'render';
  return step;
}

function stageIndex(key: StageKey) {
  const order: StageKey[] = ['plan', 'search', 'scrape', 'extract', 'link', 'cluster', 'render'];
  return order.indexOf(key);
}

function domainFromUrl(rawUrl: string) {
  try {
    const u = new URL(rawUrl);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function uniqueTop(items: string[], limit: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const v = it.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function compactCount(n: number) {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

type StageStatus = 'pending' | 'active' | 'done' | 'skipped';

export function PipelineTimeline({
  step,
  progress,
  mode,
  provider,
  plan,
  search,
  evidenceSources,
  evidenceCount,
  nodesCount,
  edgesCount,
  clustersCount,
  warningsCount,
  onOpenTrace,
  minimal = false,
  className,
}: {
  step: PipelineStep;
  progress: number;
  mode: 'fast' | 'deep';
  provider?: string;
  plan: PlanEvent | null;
  search: SearchEvent | null;
  evidenceSources: string[];
  evidenceCount: number;
  nodesCount: number;
  edgesCount: number;
  clustersCount: number;
  warningsCount: number;
  onOpenTrace?: () => void;
  minimal?: boolean;
  className?: string;
}) {
  const activeKey = stageKeyForStep(step);
  const activeIdx = activeKey ? stageIndex(activeKey) : -1;

  const baseStages: Array<{ key: StageKey; label: string; icon: LucideIcon }> = [
    { key: 'plan', label: 'Plan', icon: Sparkles },
    { key: 'search', label: 'Search', icon: Search },
    { key: 'scrape', label: 'Scrape', icon: Globe },
    { key: 'extract', label: 'Extract', icon: TextQuote },
    { key: 'link', label: 'Link', icon: Link2 },
    { key: 'cluster', label: 'Cluster', icon: Layers },
    { key: 'render', label: 'Render', icon: LayoutDashboard },
  ];

  const stages = baseStages.map((s) => {
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

  const details = (() => {
    if (step === 'idle') {
      return (
        <div className="text-xs text-white/45">
          Ask a topic. The terminal will plan queries, pull sources with Bright Data, then map and cluster the story.
        </div>
      );
    }

    if (step === 'plan') {
      const q = plan?.queries?.length || 0;
      const modeLabel = mode === 'deep' ? 'Deep' : 'Fast';
      const aiLabel = plan?.usedAI ? 'AI planned' : 'Fallback planned';
      return (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-white/55">
            <span className="font-semibold text-white/75">{modeLabel}</span>
            <span className="text-white/35"> · </span>
            <span className="text-white/55">{provider || 'ai'}</span>
            <span className="text-white/35"> · </span>
            <span className="text-white/55">{aiLabel}</span>
            <span className="text-white/35"> · </span>
            <span className="text-white/55">{q ? `${q} queries` : 'planning queries'}</span>
          </div>
          {plan?.queries?.length ? (
            <div className="flex flex-wrap gap-2">
              {plan.queries.slice(0, 5).map((query) => (
                <span
                  key={query}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/65"
                >
                  {query}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (step === 'search' || step === 'scrape') {
      const results = search?.results || [];
      const domains = uniqueTop(results.map((r) => domainFromUrl(r.url)), 6);
      return (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-white/55">
            <span className="font-semibold text-white/75">Search</span>
            <span className="text-white/35"> · </span>
            <span className="text-white/55">{search?.queries?.length ? `${search.queries.length} queries` : 'running'}</span>
            <span className="text-white/35"> · </span>
            <span className="text-white/55">{results.length ? `${results.length} results` : 'collecting'}</span>
            {warningsCount ? (
              <>
                <span className="text-white/35"> · </span>
                <span className="text-[rgba(255,170,90,0.95)]">{warningsCount} warn</span>
              </>
            ) : null}
          </div>
          {domains.length ? (
            <div className="flex flex-wrap gap-2 text-[11px] text-white/55">
              {domains.map((d) => (
                <span key={d} className="rounded-full bg-white/[0.04] px-2.5 py-1">
                  {d}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (step === 'extract') {
      const top = uniqueTop(evidenceSources, 8);
      return (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-white/55">
            <span className="font-semibold text-white/75">Evidence</span>
            <span className="text-white/35"> · </span>
            <span className="text-white/55">{compactCount(evidenceCount)} items</span>
            <span className="text-white/35"> · </span>
            <span className="text-white/55">{compactCount(top.length)} sources</span>
          </div>
          {top.length ? (
            <div className="flex flex-wrap gap-2 text-[11px] text-white/55">
              {top.map((s) => (
                <span key={s} className="rounded-full bg-white/[0.04] px-2.5 py-1">
                  {s}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (step === 'link') {
      return (
        <div className="text-xs text-white/55">
          <span className="font-semibold text-white/75">Map</span>
          <span className="text-white/35"> · </span>
          <span className="text-white/55">{compactCount(nodesCount)} nodes</span>
          <span className="text-white/35"> · </span>
          <span className="text-white/55">{compactCount(edgesCount)} edges</span>
          <span className="text-white/35"> · </span>
          <span className="text-white/55">click nodes to inspect sources</span>
        </div>
      );
    }

    if (step === 'cluster') {
      return (
        <div className="text-xs text-white/55">
          <span className="font-semibold text-white/75">Narratives</span>
          <span className="text-white/35"> · </span>
          <span className="text-white/55">{compactCount(clustersCount)} clusters</span>
        </div>
      );
    }

    // render / ready
    return (
      <div className="text-xs text-white/55">
        <span className="font-semibold text-white/75">Panels updated</span>
        <span className="text-white/35"> · </span>
        <span className="text-white/55">tape, map, narratives, price context, videos</span>
      </div>
    );
  })();

  return (
    <div className={cn('mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 backdrop-blur-xl', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          {stages.map((s) => {
            const Icon = s.icon;
            const classes =
              s.status === 'active'
                ? 'border-white/18 bg-white/[0.08] text-white/85 shadow-[0_0_0_4px_rgba(255,255,255,0.03)]'
                : s.status === 'done'
                  ? 'border-white/14 bg-white/[0.05] text-white/70'
                  : s.status === 'skipped'
                    ? 'border-dashed border-white/10 bg-transparent text-white/40'
                    : 'border-white/10 bg-white/[0.02] text-white/45';
            return (
              <Badge
                key={s.key}
                variant={
                  s.status === 'active' ? 'blue' : s.status === 'done' ? 'teal' : s.status === 'skipped' ? 'neutral' : 'default'
                }
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
                  s.status === 'active' && 'shadow-[0_0_0_4px_rgba(255,255,255,0.03)]',
                  s.status === 'skipped' && 'border-dashed opacity-60',
                )}
                title={s.status === 'skipped' ? 'Skipped in fast mode' : s.label}
              >
                {s.status === 'skipped' ? (
                  <MinusCircle className="h-3.5 w-3.5 opacity-70" />
                ) : (
                  <Icon className="h-3.5 w-3.5 opacity-80" />
                )}
                <span className="whitespace-nowrap">{s.label}</span>
              </Badge>
            );
          })}
        </div>

        <div className="hidden shrink-0 items-center gap-2 text-[11px] text-white/55 sm:flex">
          {onOpenTrace ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenTrace}
              className="h-auto gap-2 rounded-full px-3 py-1 text-[11px] font-semibold"
              title="Open run trace"
            >
              <ListTree className="h-4 w-4 opacity-80" />
              Trace
            </Button>
          ) : null}
          <span className="mono">{Math.round(progress * 100)}%</span>
        </div>
      </div>

      {!minimal ? (
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">{details}</div>
          {warningsCount ? (
            <div className="hidden shrink-0 items-center gap-2 rounded-full border border-white/10 bg-[rgba(255,170,90,0.08)] px-3 py-1 text-[11px] text-[rgba(255,200,140,0.95)] sm:flex">
              <AlertTriangle className="h-3.5 w-3.5 opacity-90" />
              <span>{warningsCount} warnings</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
