import type { EvidenceItem } from '@/lib/types';
import { getLocale, getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { SentimentBadge } from '@/components/ui/sentiment-badge';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/empty-state';

const LOCALE_MAP: Record<string, string> = { en: 'en-US', es: 'es-MX', zh: 'zh-CN' };

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function mapSentiment(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (s === 'bullish') return 'positive';
  if (s === 'bearish') return 'negative';
  return s;
}

export async function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  const locale = await getLocale();
  const t = await getTranslations('report');
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (!evidence.length) {
    return (
      <Card className="p-6">
        <SectionLabel>{t('evidence')}</SectionLabel>
        <EmptyState title={t('noEvidence')} className="py-6" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SectionLabel>{t('evidence')}</SectionLabel>
            <span className="text-xs text-white/55">{t('evidenceSubtitle')}</span>
          </div>
          <span className="text-[11px] text-white/45">{evidence.length} {t('evidence').toLowerCase()}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {evidence.map((item) => (
          <Card key={item.id} className="p-4">
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
                <SentimentBadge sentiment={mapSentiment(item.aiSummary.sentiment)} />
              )}
            </div>

            {item.excerpt && (
              <p className="mt-2 text-xs leading-relaxed text-white/60">{item.excerpt}</p>
            )}

            {item.aiSummary && (
              <div className="mt-3 rounded-xl border border-white/[0.08] bg-black/15 p-3">
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
                      <Badge key={e} variant="teal">{e}</Badge>
                    ))}
                    {item.aiSummary.catalysts?.map((c) => (
                      <Badge key={c} variant="orange">{c}</Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}
