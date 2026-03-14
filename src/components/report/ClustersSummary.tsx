import type { StoryCluster } from '@/lib/types';

function momentumBadge(momentum: StoryCluster['momentum']) {
  if (momentum === 'rising') {
    return 'border-[rgba(20,184,166,0.45)] bg-[rgba(20,184,166,0.14)] text-[rgba(170,250,238,0.95)]';
  }
  if (momentum === 'fading') {
    return 'border-[rgba(255,82,28,0.45)] bg-[rgba(255,82,28,0.14)] text-[rgba(255,205,185,0.95)]';
  }
  return 'border-white/20 bg-white/[0.06] text-white/70';
}

export function ClustersSummary({ clusters }: { clusters: StoryCluster[] }) {
  if (!clusters.length) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/25 p-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[rgba(255,188,92,0.45)] bg-[rgba(255,188,92,0.14)] px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-[rgba(255,225,168,0.95)]">
            CLUSTERS
          </span>
        </div>
        <p className="mt-3 text-sm text-white/50">No story clusters identified.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[rgba(255,188,92,0.45)] bg-[rgba(255,188,92,0.14)] px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-[rgba(255,225,168,0.95)]">
            CLUSTERS
          </span>
          <span className="text-xs text-white/55">Related story groups</span>
        </div>
        <span className="text-[11px] text-white/45">{clusters.length} clusters</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clusters.map((cluster) => (
          <div
            key={cluster.id}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-white/85">{cluster.title}</h3>
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${momentumBadge(cluster.momentum)}`}
              >
                {cluster.momentum}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/55">{cluster.summary}</p>
            <div className="mt-3 text-[11px] text-white/40">
              {cluster.evidenceIds.length} evidence items
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
