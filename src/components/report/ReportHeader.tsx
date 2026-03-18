import { getLocale } from 'next-intl/server';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';

const LOCALE_MAP: Record<string, string> = { en: 'en-US', es: 'es-MX', zh: 'zh-CN' };

export async function ReportHeader({
  topic,
  date,
  mode,
  stats,
}: {
  topic: string;
  date: string;
  mode: 'fast' | 'deep';
  stats: { evidence: number; nodes: number; edges: number; clusters: number };
}) {
  const locale = await getLocale();
  const fmtDate = new Date(date).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white/90 sm:text-3xl">{topic}</h1>
            <p className="mt-1 text-sm text-white/50">{fmtDate}</p>
          </div>
          <Badge variant={mode === 'deep' ? 'teal' : 'blue'}>
            {mode.toUpperCase()} MODE
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Evidence', value: stats.evidence },
            { label: 'Nodes', value: stats.nodes },
            { label: 'Edges', value: stats.edges },
            { label: 'Clusters', value: stats.clusters },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-center"
            >
              <div className="text-lg font-bold text-white/85">{s.value}</div>
              <div className="text-[11px] font-semibold tracking-wider text-white/45">{s.label.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
