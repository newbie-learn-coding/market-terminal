import type { StoryCluster } from '@/lib/types';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { MomentumBadge } from '@/components/ui/momentum-badge';
import { EmptyState } from '@/components/ui/empty-state';

export async function ClustersSummary({ clusters }: { clusters: StoryCluster[] }) {
  const t = await getTranslations('report');

  if (!clusters.length) {
    return (
      <Card className="p-6">
        <SectionLabel>{t('clusters')}</SectionLabel>
        <EmptyState title={t('noClusters')} className="py-6" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SectionLabel>{t('clusters')}</SectionLabel>
            <span className="text-xs text-white/55">{t('clustersSubtitle')}</span>
          </div>
          <span className="text-[11px] text-white/45">{clusters.length} {t('clusters').toLowerCase()}</span>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clusters.map((cluster) => (
            <Card key={cluster.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-white/85">{cluster.title}</h3>
                <MomentumBadge momentum={cluster.momentum} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/55">{cluster.summary}</p>
              <div className="mt-3 text-[11px] text-white/40">
                {cluster.evidenceIds.length} {t('evidence').toLowerCase()}
              </div>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
