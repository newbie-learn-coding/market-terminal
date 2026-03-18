'use client';

import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock3, Film, Newspaper, Tag, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/card';

export type TimelineItem = {
  id: string;
  ts: number;
  kind: 'step' | 'evidence' | 'media' | 'price' | 'note';
  title: string;
  subtitle?: string;
  tags?: string[];
  nodeId?: string;
  evidenceIds?: string[];
};

type KindFilter = 'all' | TimelineItem['kind'];

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
}

function dayStart(ts: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatSpan(ms: number) {
  const v = Math.max(0, Math.round(ms));
  if (v < 60_000) return `${Math.round(v / 1000)}s`;
  if (v < 3_600_000) return `${Math.round(v / 60_000)}m`;
  const h = Math.floor(v / 3_600_000);
  const remMin = Math.round((v - h * 3_600_000) / 60_000);
  return remMin ? `${h}h ${remMin}m` : `${h}h`;
}

function normalizeTag(tag: string) {
  return String(tag || '').trim().toLowerCase();
}

function kindMeta(kind: TimelineItem['kind']) {
  if (kind === 'step') {
    return {
      label: 'pipeline',
      tone: 'blue' as const,
      icon: <Activity className="h-3.5 w-3.5" />,
      cardClass: 'border-[rgba(0,102,255,0.35)]',
      dotClass: 'border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.16)] text-[rgba(170,209,255,0.95)]',
    };
  }
  if (kind === 'evidence') {
    return {
      label: 'evidence',
      tone: 'teal' as const,
      icon: <Newspaper className="h-3.5 w-3.5" />,
      cardClass: 'border-[rgba(20,184,166,0.35)]',
      dotClass: 'border-[rgba(20,184,166,0.45)] bg-[rgba(20,184,166,0.16)] text-[rgba(170,250,238,0.95)]',
    };
  }
  if (kind === 'media') {
    return {
      label: 'media',
      tone: 'orange' as const,
      icon: <Film className="h-3.5 w-3.5" />,
      cardClass: 'border-[rgba(255,188,92,0.35)]',
      dotClass: 'border-[rgba(255,188,92,0.45)] bg-[rgba(255,188,92,0.16)] text-[rgba(255,225,168,0.95)]',
    };
  }
  if (kind === 'price') {
    return {
      label: 'market',
      tone: 'neutral' as const,
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      cardClass: 'border-white/14',
      dotClass: 'border-white/20 bg-white/[0.08] text-white/80',
    };
  }
  return {
    label: 'note',
    tone: 'orange' as const,
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    cardClass: 'border-[rgba(255,82,28,0.35)]',
    dotClass: 'border-[rgba(255,82,28,0.45)] bg-[rgba(255,82,28,0.16)] text-[rgba(255,205,185,0.95)]',
  };
}

function tagClass(tag: string) {
  const key = normalizeTag(tag);
  if (/(plan|search|scrape|extract|link|cluster|render|ready|pipeline)/.test(key)) {
    return 'border-[rgba(0,102,255,0.35)] bg-[rgba(0,102,255,0.12)] text-[rgba(170,209,255,0.95)]';
  }
  if (/(media|video|youtube|clip)/.test(key)) {
    return 'border-[rgba(255,188,92,0.35)] bg-[rgba(255,188,92,0.12)] text-[rgba(255,225,168,0.95)]';
  }
  if (/(price|market|quote|usd|btc|eth|sol|dxy|xau)/.test(key)) {
    return 'border-[rgba(0,102,255,0.3)] bg-[rgba(0,102,255,0.1)] text-[rgba(170,209,255,0.9)]';
  }
  if (/(warn|error|risk|alert|volatil|stress)/.test(key)) {
    return 'border-[rgba(255,82,28,0.35)] bg-[rgba(255,82,28,0.12)] text-[rgba(255,205,185,0.95)]';
  }
  if (/(evidence|source|article|news|report)/.test(key)) {
    return 'border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.12)] text-[rgba(170,250,238,0.95)]';
  }
  return 'border-white/10 bg-white/[0.03] text-white/65 hover:text-white/85';
}

export function EvidenceTimeline({
  items,
  selectedTag,
  onSelectTag,
  onSelectNode,
  onOpenEvidence,
  className,
  viewportClassName,
}: {
  items: TimelineItem[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onSelectNode: (id: string | null) => void;
  onOpenEvidence: (title: string, evidenceIds: string[]) => void;
  className?: string;
  viewportClassName?: string;
}) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const selectedTagKey = normalizeTag(selectedTag || '');

  const filtered = useMemo(() => {
    return [...items]
      .filter((it) => (kindFilter === 'all' ? true : it.kind === kindFilter))
      .filter((it) => {
        if (!selectedTagKey) return true;
        return (it.tags || []).some((t) => normalizeTag(t) === selectedTagKey);
      })
      .sort((a, b) => a.ts - b.ts);
  }, [items, kindFilter, selectedTagKey]);

  const kindCounts = useMemo(() => {
    const out: Record<TimelineItem['kind'], number> = {
      step: 0,
      evidence: 0,
      media: 0,
      price: 0,
      note: 0,
    };
    for (const it of items) out[it.kind] += 1;
    return out;
  }, [items]);

  const tags = useMemo(() => {
    const out = new Map<string, number>();
    for (const it of filtered) {
      for (const tag of it.tags || []) {
        const key = String(tag || '').trim();
        if (!key) continue;
        out.set(key, (out.get(key) ?? 0) + 1);
      }
    }
    return Array.from(out.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [filtered]);

  const groups = useMemo(() => {
    const byDay = new Map<number, TimelineItem[]>();
    for (const it of filtered) {
      const d = dayStart(it.ts);
      const arr = byDay.get(d) || [];
      arr.push(it);
      byDay.set(d, arr);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dayTs, dayItems]) => ({
        key: `d_${dayTs}`,
        dayTs,
        label: fmtDate(dayTs),
        items: dayItems.sort((a, b) => a.ts - b.ts),
      }));
  }, [filtered]);

  const firstTs = filtered.length ? filtered[0]!.ts : 0;
  const lastTs = filtered.length ? filtered[filtered.length - 1]!.ts : 0;

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-70" />
      <div className={cn('relative w-full overflow-auto p-4', viewportClassName ?? 'h-[320px] lg:h-[430px]')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2">
            <Badge tone="blue" className="mono">
              TIMELINE
            </Badge>
            <span className="text-xs text-white/55">chronological run view</span>
          </div>
          <div className="mono text-[11px] text-white/52">
            {filtered.length} events
            {filtered.length > 1 ? ` · ${formatSpan(lastTs - firstTs)}` : ''}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              { key: 'all' as const, label: 'all', icon: <Clock3 className="h-3 w-3" /> },
              { key: 'step' as const, label: `pipeline ${kindCounts.step}`, icon: <Activity className="h-3 w-3" /> },
              { key: 'evidence' as const, label: `evidence ${kindCounts.evidence}`, icon: <Newspaper className="h-3 w-3" /> },
              { key: 'media' as const, label: `media ${kindCounts.media}`, icon: <Film className="h-3 w-3" /> },
              { key: 'price' as const, label: `market ${kindCounts.price}`, icon: <TrendingUp className="h-3 w-3" /> },
              { key: 'note' as const, label: `notes ${kindCounts.note}`, icon: <AlertTriangle className="h-3 w-3" /> },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition',
                kindFilter === opt.key
                  ? 'border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.16)] text-[rgba(170,209,255,0.95)]'
                  : 'border-white/10 bg-white/[0.03] text-white/65 hover:text-white/85',
              )}
              onClick={() => setKindFilter(opt.key)}
            >
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {tags.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] transition',
                selectedTag ? 'border-white/10 bg-white/[0.03] text-white/65 hover:text-white/85' : 'border-white/15 bg-white/[0.08] text-white/85',
              )}
              onClick={() => onSelectTag(null)}
            >
              all tags
            </button>
            {tags.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition',
                  normalizeTag(tag) === selectedTagKey
                    ? 'border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.16)] text-[rgba(170,209,255,0.95)]'
                    : tagClass(tag),
                )}
                onClick={() => onSelectTag(tag)}
              >
                <Tag className="h-3 w-3" />
                <span>{tag}</span>
                <span className="text-white/45">· {count}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {groups.map((group) => {
            const start = group.items[0]!.ts;
            const end = group.items[group.items.length - 1]!.ts;
            return (
              <section key={group.key} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:px-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold tracking-[0.16em] text-white/48">{group.label.toUpperCase()}</div>
                  <div className="mono text-[11px] text-white/50">
                    {fmtTime(start)} → {fmtTime(end)} · {group.items.length}
                  </div>
                </div>

                <div className="space-y-2">
                  {group.items.map((it, idx) => {
                      const meta = kindMeta(it.kind);
                      const clickable = Boolean(it.nodeId || it.evidenceIds?.length);
                      const first = idx === 0;
                      const last = idx === group.items.length - 1;
                      return (
                        <div
                          key={it.id}
                          className="grid grid-cols-[88px_22px_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[104px_26px_minmax(0,1fr)] sm:gap-3"
                        >
                          <div className="whitespace-nowrap pt-2 pr-1 text-right mono text-[11px] text-white/48">{fmtTime(it.ts)}</div>
                          <div
                            className="relative flex min-h-[52px] justify-center"
                          >
                            <div
                              className={cn(
                                'absolute left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-white/20 via-white/10 to-white/20',
                                first ? 'top-3' : 'top-0',
                                last ? 'bottom-3' : 'bottom-0',
                              )}
                            />
                            <div
                              className={cn(
                                'relative mt-2.5 grid h-5 w-5 place-items-center rounded-full border',
                                meta.dotClass,
                              )}
                            >
                              {meta.icon}
                            </div>
                          </div>

                          <div
                            role={clickable ? 'button' : undefined}
                            tabIndex={clickable ? 0 : undefined}
                            className={cn(
                              'min-w-0 w-full rounded-2xl border bg-black/20 px-3 py-2 text-left transition',
                              meta.cardClass,
                              clickable ? 'cursor-pointer hover:bg-white/[0.06]' : 'cursor-default',
                            )}
                            onClick={() => {
                              if (!clickable) return;
                              if (it.nodeId) onSelectNode(it.nodeId);
                              if (it.evidenceIds?.length) onOpenEvidence(it.title, it.evidenceIds);
                            }}
                            onKeyDown={(e) => {
                              if (!clickable) return;
                              if (e.key !== 'Enter' && e.key !== ' ') return;
                              e.preventDefault();
                              if (it.nodeId) onSelectNode(it.nodeId);
                              if (it.evidenceIds?.length) onOpenEvidence(it.title, it.evidenceIds);
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-semibold text-white/86">{it.title}</div>
                              <Badge tone={meta.tone} className="mono text-[10px]">
                                {meta.label}
                              </Badge>
                            </div>

                            {it.subtitle ? <div className="mt-1 text-xs text-white/60">{it.subtitle}</div> : null}

                            {it.tags?.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {it.tags.slice(0, 6).map((tag) => (
                                  <button
                                    key={`${it.id}_${tag}`}
                                    type="button"
                                    className={cn(
                                      'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] transition',
                                      normalizeTag(tag) === selectedTagKey
                                        ? 'border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.16)] text-[rgba(170,209,255,0.95)]'
                                        : tagClass(tag),
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectTag(tag);
                                    }}
                                  >
                                    <Tag className="h-2.5 w-2.5" />
                                    {tag}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </section>
            );
          })}

          {!groups.length ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/60">
              No timeline entries for this filter combination.
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
