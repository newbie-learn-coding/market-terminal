import type { TapeItem } from '@/lib/types';

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

function tagClass(tag: string) {
  const key = tag.trim().toLowerCase();
  if (/(plan|search|scrape|extract|link|cluster|render|ready|pipeline)/.test(key)) {
    return 'border-[rgba(0,102,255,0.35)] bg-[rgba(0,102,255,0.12)] text-[rgba(170,209,255,0.95)]';
  }
  if (/(warn|error|risk|alert)/.test(key)) {
    return 'border-[rgba(255,82,28,0.35)] bg-[rgba(255,82,28,0.12)] text-[rgba(255,205,185,0.95)]';
  }
  if (/(evidence|source|article|news|report)/.test(key)) {
    return 'border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.12)] text-[rgba(170,250,238,0.95)]';
  }
  return 'border-white/10 bg-white/[0.03] text-white/65';
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
      <section className="rounded-2xl border border-white/10 bg-black/25 p-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.14)] px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-[rgba(180,214,255,0.95)]">
            TIMELINE
          </span>
        </div>
        <p className="mt-3 text-sm text-white/50">No timeline events recorded.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.14)] px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-[rgba(180,214,255,0.95)]">
            TIMELINE
          </span>
          <span className="text-xs text-white/55">Chronological event log</span>
        </div>
        <span className="text-[11px] text-white/45">{sorted.length} events</span>
      </div>

      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <div key={group.dayTs} className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3 sm:px-4">
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
                        className={`absolute left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-white/20 via-white/10 to-white/20 ${first ? 'top-3' : 'top-0'} ${last ? 'bottom-3' : 'bottom-0'}`}
                      />
                      <div className="relative mt-2.5 grid h-5 w-5 place-items-center rounded-full border border-[rgba(20,184,166,0.45)] bg-[rgba(20,184,166,0.16)] text-[rgba(170,250,238,0.95)]">
                        <div className="h-1.5 w-1.5 rounded-full bg-current" />
                      </div>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-[rgba(20,184,166,0.35)] bg-black/20 px-3 py-2">
                      <div className="text-sm font-semibold text-white/86">{it.title}</div>
                      <div className="mt-0.5 text-xs text-white/50">{it.source}</div>
                      {it.tags?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {it.tags.slice(0, 6).map((tag) => (
                            <span
                              key={`${it.id}_${tag}`}
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${tagClass(tag)}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
