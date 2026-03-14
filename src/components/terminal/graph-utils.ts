import type { GraphEdge, GraphNode, NodeType } from '@/components/terminal/types';

export function toneForNode(type: NodeType) {
  if (type === 'asset')
    return {
      bg: 'bg-[rgba(0,102,255,0.14)]',
      border: 'border-[rgba(0,102,255,0.35)]',
      text: 'text-[rgba(153,197,255,0.95)]',
    };
  if (type === 'event')
    return {
      bg: 'bg-[rgba(255,82,28,0.14)]',
      border: 'border-[rgba(255,82,28,0.35)]',
      text: 'text-[rgba(255,205,185,0.95)]',
    };
  if (type === 'entity')
    return {
      bg: 'bg-[rgba(20,184,166,0.14)]',
      border: 'border-[rgba(20,184,166,0.35)]',
      text: 'text-[rgba(167,243,235,0.95)]',
    };
  if (type === 'media')
    return {
      bg: 'bg-[rgba(255,188,92,0.14)]',
      border: 'border-[rgba(255,188,92,0.35)]',
      text: 'text-[rgba(255,225,168,0.95)]',
    };
  return { bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/70' };
}

export function edgeTypeMeta(type: GraphEdge['type']) {
  if (type === 'mentions') {
    return {
      label: 'reported',
      chip: 'border-[rgba(153,197,255,0.45)] bg-[rgba(0,102,255,0.14)] text-[rgba(180,214,255,0.95)]',
    };
  }
  if (type === 'co_moves') {
    return {
      label: 'co-move',
      chip: 'border-[rgba(20,184,166,0.45)] bg-[rgba(20,184,166,0.14)] text-[rgba(170,250,238,0.95)]',
    };
  }
  if (type === 'same_story') {
    return {
      label: 'context',
      chip: 'border-white/20 bg-white/[0.06] text-white/80',
    };
  }
  return {
    label: 'hypothesis',
    chip: 'border-[rgba(255,82,28,0.45)] bg-[rgba(255,82,28,0.14)] text-[rgba(255,215,194,0.95)]',
  };
}

export function formatPct(v: number) {
  return `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
}

export function scoreRootCandidate(label: string, topic: string) {
  const a = String(label || '').trim().toLowerCase();
  const b = String(topic || '').trim().toLowerCase();
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.replace(/\s+/g, '') === b.replace(/\s+/g, '')) return 92;
  if (a.startsWith(b) || b.startsWith(a)) return 84;
  if (a.includes(b) || b.includes(a)) return 72;
  return 0;
}

export function pickRoot(nodes: GraphNode[], topic: string) {
  const assets = nodes.filter((n) => n.type === 'asset');
  if (!assets.length) return nodes[0] || null;
  if (assets.length === 1) return assets[0];
  let best = assets[0];
  let bestScore = scoreRootCandidate(best.label, topic);
  for (const n of assets.slice(1)) {
    const s = scoreRootCandidate(n.label, topic);
    if (s > bestScore) {
      best = n;
      bestScore = s;
    }
  }
  return best;
}

export function edgeBetween(a: string, b: string, edgesByNode: Map<string, GraphEdge[]>) {
  const list = edgesByNode.get(a) || [];
  let best: GraphEdge | null = null;
  for (const e of list) {
    if (!((e.from === a && e.to === b) || (e.from === b && e.to === a))) continue;
    if (!best || Number(e.confidence || 0) > Number(best.confidence || 0)) best = e;
  }
  return best;
}

export function sortByScore(ids: string[], scoreById: Map<string, number>) {
  return [...ids].sort((x, y) => (scoreById.get(y) || 0) - (scoreById.get(x) || 0));
}
