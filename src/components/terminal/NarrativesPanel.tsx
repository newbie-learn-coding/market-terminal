'use client';

import { BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { MomentumBadge } from '@/components/ui/momentum-badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type StoryCluster = {
  id: string;
  title: string;
  summary: string;
  momentum: 'rising' | 'steady' | 'fading';
  evidenceIds: string[];
  related: string[];
};

export function NarrativesPanel({
  isEmpty,
  clusters,
  narrativeStats,
  onOpenEvidence,
}: {
  isEmpty: boolean;
  clusters: StoryCluster[];
  narrativeStats: { count: number; rising: number; steady: number; fading: number };
  onOpenEvidence: (title: string, evidenceIds: string[]) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 border-b border-white/[0.08]">
        <BookOpen className="h-4 w-4 text-white/80" />
        <div>
          <CardTitle>Narratives</CardTitle>
          <CardDescription>Story clusters and momentum</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/45">
            No data yet. Run a topic to populate.
          </div>
        ) : clusters.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
            No narrative clusters produced yet.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Badge variant="orange" className="mono">clusters {narrativeStats.count}</Badge>
              {narrativeStats.rising ? <Badge variant="teal" className="mono">rising {narrativeStats.rising}</Badge> : null}
              {narrativeStats.steady ? <Badge variant="orange" className="mono">steady {narrativeStats.steady}</Badge> : null}
              {narrativeStats.fading ? <Badge className="mono">fading {narrativeStats.fading}</Badge> : null}
            </div>
            <div className="max-h-[320px] overflow-auto pr-1">
              <div className="space-y-2">
                {clusters.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:bg-white/[0.06]"
                    onClick={() => onOpenEvidence(`Narrative: ${c.title}`, c.evidenceIds)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white/86">{c.title}</div>
                      <MomentumBadge momentum={c.momentum} />
                    </div>
                    <div className="mt-1.5 text-sm text-white/65">{c.summary}</div>
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
