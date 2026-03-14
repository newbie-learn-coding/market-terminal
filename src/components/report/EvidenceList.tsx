import type { EvidenceItem } from '@/lib/types';

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sentimentBadge(sentiment: string) {
  const map: Record<string, string> = {
    bullish: 'border-[rgba(20,184,166,0.45)] bg-[rgba(20,184,166,0.14)] text-[rgba(170,250,238,0.95)]',
    bearish: 'border-[rgba(255,82,28,0.45)] bg-[rgba(255,82,28,0.14)] text-[rgba(255,205,185,0.95)]',
    mixed: 'border-[rgba(255,188,92,0.45)] bg-[rgba(255,188,92,0.14)] text-[rgba(255,225,168,0.95)]',
    neutral: 'border-white/20 bg-white/[0.06] text-white/70',
  };
  return map[sentiment] || map.neutral;
}

export function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  if (!evidence.length) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/25 p-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[rgba(20,184,166,0.45)] bg-[rgba(20,184,166,0.14)] px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-[rgba(170,250,238,0.95)]">
            EVIDENCE
          </span>
        </div>
        <p className="mt-3 text-sm text-white/50">No evidence items collected.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[rgba(20,184,166,0.45)] bg-[rgba(20,184,166,0.14)] px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-[rgba(170,250,238,0.95)]">
            EVIDENCE
          </span>
          <span className="text-xs text-white/55">Source-backed findings</span>
        </div>
        <span className="text-[11px] text-white/45">{evidence.length} items</span>
      </div>

      <div className="mt-4 space-y-3">
        {evidence.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-[rgba(153,197,255,0.95)] hover:underline"
                >
                  {item.title}
                </a>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
                  <span>{domainOf(item.url)}</span>
                  <span>·</span>
                  <span>{fmtDate(item.publishedAt)}</span>
                </div>
              </div>
              {item.aiSummary?.sentiment && (
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${sentimentBadge(item.aiSummary.sentiment)}`}
                >
                  {item.aiSummary.sentiment}
                </span>
              )}
            </div>

            {item.excerpt && (
              <p className="mt-2 text-xs leading-relaxed text-white/60">{item.excerpt}</p>
            )}

            {item.aiSummary && (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3">
                {item.aiSummary.bullets?.length ? (
                  <ul className="space-y-1">
                    {item.aiSummary.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/40" />
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {(item.aiSummary.entities?.length || item.aiSummary.catalysts?.length) ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.aiSummary.entities?.map((e) => (
                      <span
                        key={e}
                        className="inline-flex rounded-full border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.12)] px-2 py-0.5 text-[10px] text-[rgba(170,250,238,0.95)]"
                      >
                        {e}
                      </span>
                    ))}
                    {item.aiSummary.catalysts?.map((c) => (
                      <span
                        key={c}
                        className="inline-flex rounded-full border border-[rgba(255,82,28,0.35)] bg-[rgba(255,82,28,0.12)] px-2 py-0.5 text-[10px] text-[rgba(255,205,185,0.95)]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
