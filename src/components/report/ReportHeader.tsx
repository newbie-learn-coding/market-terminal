export function ReportHeader({
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
  const fmtDate = new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="rounded-2xl border border-white/10 bg-black/25 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white/90 sm:text-3xl">{topic}</h1>
          <p className="mt-1 text-sm text-white/50">{fmtDate}</p>
        </div>
        <span
          className={
            mode === 'deep'
              ? 'inline-flex items-center rounded-full border border-[rgba(20,184,166,0.45)] bg-[rgba(20,184,166,0.14)] px-3 py-1 text-xs font-semibold text-[rgba(170,250,238,0.95)]'
              : 'inline-flex items-center rounded-full border border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.14)] px-3 py-1 text-xs font-semibold text-[rgba(180,214,255,0.95)]'
          }
        >
          {mode.toUpperCase()} MODE
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Evidence', value: stats.evidence },
          { label: 'Nodes', value: stats.nodes },
          { label: 'Edges', value: stats.edges },
          { label: 'Clusters', value: stats.clusters },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center"
          >
            <div className="text-lg font-bold text-white/85">{s.value}</div>
            <div className="text-[11px] font-semibold tracking-wider text-white/45">{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>
    </header>
  );
}
