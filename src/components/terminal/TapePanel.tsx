'use client';

import { Activity } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type TapeItem = {
  id: string;
  title: string;
  source: string;
  publishedAt: number;
  tags: string[];
  evidenceId: string;
};

function toneForTag(tag: string): 'neutral' | 'blue' | 'orange' | 'teal' {
  const t = String(tag || '').toLowerCase();
  if (!t) return 'neutral';
  if (/(fed|rates?|yield|treasury|cpi|inflation|macro|dxy|dollar|gold|xau|oil|wti|brent)/.test(t)) return 'blue';
  if (/(etf|sec|regulat|lawsuit|policy|approval|ban|sanction)/.test(t)) return 'orange';
  if (/(flow|liquidity|volume|derivatives|funding|miners?|spillover|correlat|co[_-]?move)/.test(t)) return 'teal';
  if (/(rumou?r|unverified|speculation)/.test(t)) return 'orange';
  return 'neutral';
}

export function TapePanel({
  isEmpty,
  tape,
  tapeStats,
  onOpenEvidence,
}: {
  isEmpty: boolean;
  tape: TapeItem[];
  tapeStats: {
    headlineCount: number;
    uniqueSourceCount: number;
    evidenceCount: number;
  };
  onOpenEvidence: (title: string, evidenceIds: string[]) => void;
}) {
  const t = useTranslations('workspace');
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 border-b border-white/[0.08]">
        <Activity className="h-4 w-4 text-white/80" />
        <div>
          <CardTitle>{t('tapeTitle')}</CardTitle>
          <CardDescription>{t('tapeDesc')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {isEmpty ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/45">
              {t('noDataYet')}
            </div>
          </div>
        ) : tape.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
            {t('noTapeItems')}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Badge variant="teal" className="mono">{t('headlines')} {tapeStats.headlineCount}</Badge>
              <Badge className="mono">{t('sourcesCount')} {tapeStats.uniqueSourceCount}</Badge>
              <Badge className="mono">{t('evidenceCount')} {tapeStats.evidenceCount}</Badge>
            </div>
            <div className="max-h-[320px] overflow-auto pr-1">
              <div className="space-y-2">
                {tape.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:bg-white/[0.06]"
                    onClick={() => onOpenEvidence(`Tape: ${t.title}`, [t.evidenceId])}
                  >
                    <div className="text-sm font-semibold text-white/86">{t.title}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                      <Badge className="mono">{t.source}</Badge>
                      {t.tags.slice(0, 4).map((tag) => (
                        <Badge key={`${t.id}_${tag}`} tone={toneForTag(tag)} className="mono">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
