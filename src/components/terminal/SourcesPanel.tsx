'use client';

import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type EvidenceItem = {
  id: string;
  source: string;
};

type SourceStat = {
  source: string;
  count: number;
  latestAt: number;
  latestKind: 'published' | 'observed';
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SourcesPanel({
  isEmpty,
  sourceStats,
  evidence,
  onOpenEvidence,
}: {
  isEmpty: boolean;
  sourceStats: SourceStat[];
  evidence: EvidenceItem[];
  onOpenEvidence: (title: string, evidenceIds: string[]) => void;
}) {
  const t = useTranslations('workspace');
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 border-b border-white/[0.08]">
        <Globe className="h-4 w-4 text-white/80" />
        <div>
          <CardTitle>{t('sourcesTitle')}</CardTitle>
          <CardDescription>{t('sourcesDesc')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/45">
            {t('noDataYet')}
          </div>
        ) : sourceStats.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
            {t('noSourcesFound')}
          </div>
        ) : (
          <div className="max-h-[320px] overflow-auto pr-1">
            <div className="space-y-2">
              {sourceStats.map((s) => (
                <button
                  key={s.source}
                  type="button"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:bg-white/[0.06]"
                  onClick={() => {
                    const ids = evidence.filter((e) => e.source === s.source).map((e) => e.id);
                    onOpenEvidence(`Source: ${s.source}`, ids);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white/86">{s.source}</div>
                    <div className="text-[11px] text-white/45 mono">{s.count}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-white/55">
                    {s.latestKind === 'published' ? t('published') : t('observed')} {formatTime(s.latestAt)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
