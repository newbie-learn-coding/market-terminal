import type { TapeItem } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';
import { SectionLabel } from '@/components/ui/section-label';
import { EmptyState } from '@/components/ui/empty-state';

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

function tagVariant(tag: string): 'blue' | 'orange' | 'teal' | 'neutral' {
  const key = tag.trim().toLowerCase();
  if (/(plan|search|scrape|extract|link|cluster|render|ready|pipeline)/.test(key)) return 'blue';
  if (/(warn|error|risk|alert)/.test(key)) return 'orange';
  if (/(evidence|source|article|news|report)/.test(key)) return 'teal';
  return 'neutral';
}

export function StaticTimeline({ items }: { items: TapeItem[] }) {
  const sorted = [...items].sort((a, b) => a.publishedAt - b.publishedAt);

  const byDay = new Map<number, TapeItem[]>();
  for (const it of sorted) {
    const d = dayStart(it.publishedAt);
    const arr = byDay.get(d) || [];
    arr.push(it);
    byDay.set(d, arr);
  }

  const groups = Array.from(byDay.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([dayTs, dayItems]) => ({
      dayTs,
      label: fmtDate(dayTs),
      items: dayItems,
    }));

  if (!groups.length) {
    return (
      <Card className="p-6">
        <SectionLabel>Timeline</SectionLabel>
        <EmptyState title="No timeline events recorded" className="py-6" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SectionLabel>Timeline</SectionLabel>
            <span className="text-xs text-white/55">Chronological event log</span>
          </div>
          <span className="text-[11px] text-white/45">{sorted.length} events</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {groups.map((group) => (
          <Card key={group.dayTs} className="px-3 py-3 sm:px-4">
            <div className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-white/48">
              {group.label.toUpperCase()}
            </div>
            <div className="space-y-2">
              {group.items.map((it, idx) => {
                const first = idx === 0;
                const last = idx === group.items.length - 1;
                return (
                  <div
                    key={it.id}
                    className="grid grid-cols-[88px_22px_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[104px_26px_minmax(0,1fr)] sm:gap-3"
                  >
                    <div className="whitespace-nowrap pt-2 pr-1 text-right text-[11px] text-white/48">
                      {fmtTime(it.publishedAt)}
                    </div>
                    <div className="relative flex min-h-[44px] justify-center">
                      <div
                        className={`absolute left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-white/15 via-white/8 to-white/15 ${first ? 'top-3' : 'top-0'} ${last ? 'bottom-3' : 'bottom-0'}`}
                      />
                      <div className="relative mt-2.5 grid h-5 w-5 place-items-center rounded-full border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.12)]">
                        <div className="h-1.5 w-1.5 rounded-full bg-[rgba(170,250,238,0.95)]" />
                      </div>
                    </div>
                    <Card className="min-w-0 px-3 py-2">
                      <div className="text-sm font-semibold text-white/86">{it.title}</div>
                      <div className="mt-0.5 text-xs text-white/50">{it.source}</div>
                      {it.tags?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {it.tags.slice(0, 6).map((tag) => (
                            <Badge key={`${it.id}_${tag}`} variant={tagVariant(tag)}>
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </Card>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}
