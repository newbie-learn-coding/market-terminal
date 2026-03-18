'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowRightLeft, Layers, Link2 } from 'lucide-react';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/card';
import type { GraphEdge, GraphNode, NodeType } from '@/components/terminal/types';

type NodePos = {
  x: number;
  y: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type FlowDebugWindow = Window & { __FLOW_DEBUG__?: boolean };

function flowDebug(event: string, payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const w = window as FlowDebugWindow;
  if (!w.__FLOW_DEBUG__) return;
  console.info(`[EvidenceFlow] ${event}`, payload);
}

function toneForNode(type: NodeType) {
  if (type === 'asset')
    return { bg: 'bg-[rgba(0,102,255,0.14)]', border: 'border-[rgba(0,102,255,0.35)]', text: 'text-[rgba(153,197,255,0.95)]' };
  if (type === 'event')
    return { bg: 'bg-[rgba(255,82,28,0.14)]', border: 'border-[rgba(255,82,28,0.35)]', text: 'text-[rgba(255,205,185,0.95)]' };
  if (type === 'entity')
    return { bg: 'bg-[rgba(20,184,166,0.14)]', border: 'border-[rgba(20,184,166,0.35)]', text: 'text-[rgba(167,243,235,0.95)]' };
  if (type === 'media')
    return { bg: 'bg-[rgba(255,188,92,0.14)]', border: 'border-[rgba(255,188,92,0.35)]', text: 'text-[rgba(255,225,168,0.95)]' };
  return { bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/70' };
}

function edgeStroke(edge: GraphEdge) {
  if (edge.type === 'mentions') return 'rgba(255,255,255,0.18)';
  if (edge.type === 'co_moves') return 'rgba(0,102,255,0.34)';
  if (edge.type === 'hypothesis') return 'rgba(255,82,28,0.34)';
  return 'rgba(20,184,166,0.28)';
}

function edgeConfidence(edge: GraphEdge) {
  const c = Number(edge.confidence || 0);
  if (!Number.isFinite(c)) return 0;
  return Math.max(0, Math.min(1, c));
}

function edgeTypeLabel(type: GraphEdge['type'], t: (k: string) => string) {
  if (type === 'mentions') return t('mentionsLabel');
  if (type === 'co_moves') return t('coMovesLabel');
  if (type === 'hypothesis') return t('hypothesisLabel');
  if (type === 'same_story') return t('sameStoryLabel');
  return type;
}

const COL_BY_TYPE: Record<NodeType, number> = { source: 0, event: 1, asset: 2, entity: 3, media: 4 };

function stableBucket(seed: string, mod: number) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = (h >>> 0) % Math.max(1, mod);
  return Number.isFinite(out) ? out : 0;
}

export function EvidenceFlow({
  nodes,
  edges,
  selected,
  onSelectNode,
  onSelectEdge,
  onInspectNode,
  className,
  viewportClassName,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selected: { nodeId: string | null; edgeId: string | null };
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onInspectNode?: (id: string) => void;
  className?: string;
  viewportClassName?: string;
}) {
  const t = useTranslations('workspace');
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 980, h: 430 });
  const [pos, setPos] = useState<Record<string, NodePos>>({});
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const updateCanvasSize = useCallback(() => {
    const root = viewportRef.current;
    if (!root) return;
    const next = {
      w: Math.max(320, Math.ceil(root.scrollWidth)),
      h: Math.max(240, Math.ceil(root.scrollHeight)),
    };
    setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
  }, []);

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    nodes.forEach((n) => m.set(String(n.id), n));
    return m;
  }, [nodes]);

  const degreeById = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of edges) {
      const a = String(e.from);
      const b = String(e.to);
      m.set(a, (m.get(a) || 0) + 1);
      m.set(b, (m.get(b) || 0) + 1);
    }
    return m;
  }, [edges]);

  const cols = useMemo(() => {
    const byType: Record<NodeType, GraphNode[]> = { source: [], event: [], asset: [], entity: [], media: [] };
    for (const n of nodes) byType[n.type].push(n);
    const sort = (arr: GraphNode[]) =>
      [...arr].sort((a, b) => (degreeById.get(String(b.id)) || 0) - (degreeById.get(String(a.id)) || 0));
    return [
      { type: 'source' as const, label: t('sources'), icon: <Layers className="h-4 w-4" />, items: sort(byType.source) },
      { type: 'event' as const, label: t('events'), icon: <ArrowRightLeft className="h-4 w-4" />, items: sort(byType.event) },
      { type: 'asset' as const, label: t('assets'), icon: <Link2 className="h-4 w-4" />, items: sort(byType.asset) },
      { type: 'entity' as const, label: t('actors'), icon: <Layers className="h-4 w-4" />, items: sort(byType.entity) },
      { type: 'media' as const, label: t('media'), icon: <Layers className="h-4 w-4" />, items: sort(byType.media) },
    ];
  }, [degreeById, nodes, t]);

  const drawEdges = useMemo(() => {
    if (!edges.length || !nodes.length) return [];

    // Keep one strongest edge per directed pair; duplicate links are visually noisy in lane view.
    const byPair = new Map<string, GraphEdge>();
    const sorted = [...edges].sort((a, b) => edgeConfidence(b) - edgeConfidence(a));
    for (const e of sorted) {
      const from = String(e.from);
      const to = String(e.to);
      if (!from || !to || from === to) continue;
      const pairKey = `${from}->${to}`;
      if (!byPair.has(pairKey)) byPair.set(pairKey, e);
    }

    const unique = Array.from(byPair.values()).sort((a, b) => edgeConfidence(b) - edgeConfidence(a));
    const outCount = new Map<string, number>();
    const inCount = new Map<string, number>();
    const picked: GraphEdge[] = [];

    const maxDrawn = Math.max(16, Math.min(48, Math.round(nodes.length * 1.9)));
    const perNodeCap = nodes.length > 20 ? 5 : 6;
    const minConfidence = 0.24;

    const take = (e: GraphEdge) => {
      const from = String(e.from);
      const to = String(e.to);
      outCount.set(from, (outCount.get(from) || 0) + 1);
      inCount.set(to, (inCount.get(to) || 0) + 1);
      picked.push(e);
    };

    for (const e of unique) {
      const conf = edgeConfidence(e);
      const from = String(e.from);
      const to = String(e.to);
      const outN = outCount.get(from) || 0;
      const inN = inCount.get(to) || 0;
      const shouldForce = conf >= 0.58 || e.type === 'co_moves';
      if ((outN < perNodeCap && inN < perNodeCap && conf >= minConfidence) || shouldForce) {
        take(e);
      }
      if (picked.length >= maxDrawn) break;
    }

    // Guarantee enough structure even on low-confidence runs.
    if (picked.length < Math.min(12, maxDrawn)) {
      for (const e of unique) {
        if (picked.some((x) => x.id === e.id)) continue;
        const from = String(e.from);
        const to = String(e.to);
        const outN = outCount.get(from) || 0;
        const inN = inCount.get(to) || 0;
        if (outN >= perNodeCap + 2 || inN >= perNodeCap + 2) continue;
        take(e);
        if (picked.length >= Math.min(12, maxDrawn)) break;
      }
    }

    // Keep selected edge visible even if normally filtered out.
    if (selected.edgeId) {
      const chosen = picked.some((e) => String(e.id) === selected.edgeId);
      if (!chosen) {
        const forced = unique.find((e) => String(e.id) === selected.edgeId) ?? edges.find((e) => String(e.id) === selected.edgeId);
        if (forced) picked.push(forced);
      }
    }

    // Keep top related edges visible while a node is selected.
    const selectedRelated =
      selected.nodeId
        ? unique.filter((e) => String(e.from) === selected.nodeId || String(e.to) === selected.nodeId)
        : [];
    if (selectedRelated.length) {
      for (const e of selectedRelated) {
        if (picked.some((x) => x.id === e.id)) continue;
        picked.push(e);
      }
    }

    const dedup = new Map<string, GraphEdge>();
    for (const e of picked) dedup.set(String(e.id), e);
    const dedupList = Array.from(dedup.values());

    if (selectedRelated.length) {
      const relatedIds = new Set(selectedRelated.map((e) => String(e.id)));
      const related = dedupList.filter((e) => relatedIds.has(String(e.id)));
      const others = dedupList.filter((e) => !relatedIds.has(String(e.id)));
      const ordered = [...related, ...others];
      const limit = Math.max(maxDrawn + 10, related.length + 6);
      return ordered.slice(0, limit);
    }

    return dedupList.slice(0, maxDrawn);
  }, [edges, nodes.length, selected.edgeId, selected.nodeId]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const el = viewportRef.current;
    const content = contentRef.current;
    updateCanvasSize();
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const root = viewportRef.current;
      if (!root) return;
      const next = {
        w: Math.max(320, Math.max(Math.round(entry.contentRect.width), Math.ceil(root.scrollWidth))),
        h: Math.max(240, Math.max(Math.round(entry.contentRect.height), Math.ceil(root.scrollHeight))),
      };
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    });
    ro.observe(el);
    if (content) ro.observe(content);
    return () => ro.disconnect();
  }, [updateCanvasSize]);

  const computePositions = useCallback(() => {
    const root = viewportRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const sx = root.scrollLeft;
    const sy = root.scrollTop;
    const next: Record<string, NodePos> = {};
    const els = root.querySelectorAll<HTMLElement>('[data-nodeid]');
    els.forEach((el) => {
      const id = el.dataset.nodeid;
      if (!id) return;
      const r = el.getBoundingClientRect();
      const left = r.left - rootRect.left + sx;
      const right = r.right - rootRect.left + sx;
      const top = r.top - rootRect.top + sy;
      const bottom = r.bottom - rootRect.top + sy;

      next[id] = {
        x: left + r.width / 2,
        y: top + r.height / 2,
        left,
        right,
        top,
        bottom,
      };
    });
    updateCanvasSize();
    setPos(next);
  }, [updateCanvasSize]);

  const rafRef = useRef<number | null>(null);
  const scheduleCompute = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => computePositions());
  }, [computePositions]);

  useEffect(() => {
    scheduleCompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length, size.w, size.h]);

  useEffect(() => {
    scheduleCompute();
  }, [scheduleCompute, selected.nodeId, selected.edgeId]);

  useEffect(() => {
    const root = viewportRef.current;
    if (!root) return;
    const onScroll = () => scheduleCompute();
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [scheduleCompute]);

  const focusNodeId = selected.nodeId;
  const focusEdgeId = selected.edgeId || hoveredEdgeId;
  const hasFocus = Boolean(focusNodeId || focusEdgeId);

  const selectedNodeConnections = useMemo(() => {
    if (!focusNodeId) return null;
    const center = nodeById.get(focusNodeId);
    if (!center) return null;

    const byNeighbor = new Map<
      string,
      {
        id: string;
        node: GraphNode;
        edgeCount: number;
        incoming: number;
        outgoing: number;
        strongest: number;
        edgeTypes: Set<GraphEdge['type']>;
      }
    >();
    const edgeTypeCounts: Record<GraphEdge['type'], number> = { mentions: 0, co_moves: 0, hypothesis: 0, same_story: 0 };

    for (const edge of drawEdges) {
      const from = String(edge.from);
      const to = String(edge.to);
      if (from !== focusNodeId && to !== focusNodeId) continue;
      const neighborId = from === focusNodeId ? to : from;
      const neighbor = nodeById.get(neighborId);
      if (!neighbor) continue;

      const row = byNeighbor.get(neighborId) || {
        id: neighborId,
        node: neighbor,
        edgeCount: 0,
        incoming: 0,
        outgoing: 0,
        strongest: 0,
        edgeTypes: new Set<GraphEdge['type']>(),
      };
      row.edgeCount += 1;
      if (from === focusNodeId) row.outgoing += 1;
      else row.incoming += 1;
      row.strongest = Math.max(row.strongest, edgeConfidence(edge));
      row.edgeTypes.add(edge.type);
      byNeighbor.set(neighborId, row);
      edgeTypeCounts[edge.type] += 1;
    }

    const neighbors = Array.from(byNeighbor.values())
      .map((item) => ({
        ...item,
        edgeTypes: Array.from(item.edgeTypes),
      }))
      .sort((a, b) => b.edgeCount - a.edgeCount || b.strongest - a.strongest || a.node.label.localeCompare(b.node.label));

    const edgeCountTotal = neighbors.reduce((sum, n) => sum + n.edgeCount, 0);
    return { center, neighbors, edgeCountTotal, edgeTypeCounts };
  }, [drawEdges, focusNodeId, nodeById]);

  const selectedEdgeSummary = useMemo(() => {
    if (!focusEdgeId) return null;
    const edge = drawEdges.find((e) => String(e.id) === focusEdgeId) || null;
    if (!edge) return null;
    const from = nodeById.get(String(edge.from));
    const to = nodeById.get(String(edge.to));
    if (!from || !to) return null;
    return { edge, from, to };
  }, [drawEdges, focusEdgeId, nodeById]);

  const relatedNodeIds = useMemo(() => {
    const out = new Set<string>();
    if (selectedNodeConnections) {
      out.add(String(selectedNodeConnections.center.id));
      for (const n of selectedNodeConnections.neighbors) out.add(String(n.id));
      return out;
    }
    if (selectedEdgeSummary) {
      out.add(String(selectedEdgeSummary.from.id));
      out.add(String(selectedEdgeSummary.to.id));
      return out;
    }
    return out;
  }, [selectedEdgeSummary, selectedNodeConnections]);

  useEffect(() => {
    if (!focusNodeId) return;
    flowDebug('node.focus', {
      nodeId: focusNodeId,
      connectedNodes: selectedNodeConnections?.neighbors.length || 0,
      connectedIds: (selectedNodeConnections?.neighbors || []).slice(0, 12).map((n) => n.id),
      edgeCounts: selectedNodeConnections?.edgeTypeCounts || null,
    });
  }, [focusNodeId, selectedNodeConnections]);

  useEffect(() => {
    if (!focusEdgeId) return;
    flowDebug('edge.focus', {
      edgeId: focusEdgeId,
      from: selectedEdgeSummary?.from.id || null,
      to: selectedEdgeSummary?.to.id || null,
      type: selectedEdgeSummary?.edge.type || null,
    });
  }, [focusEdgeId, selectedEdgeSummary]);

  const paths = useMemo(() => {
    const out: Array<{
      id: string;
      d: string;
      stroke: string;
      width: number;
      dashed: boolean;
      opacity: number;
      title: string;
      focused: boolean;
      edgeType: GraphEdge['type'];
    }> = [];

    for (const e of drawEdges) {
      const a = String(e.from);
      const b = String(e.to);
      const na = nodeById.get(a);
      const nb = nodeById.get(b);
      if (!na || !nb) continue;
      const pa = pos[a];
      const pb = pos[b];
      if (!pa || !pb) continue;

      let ai = COL_BY_TYPE[na.type];
      let bi = COL_BY_TYPE[nb.type];
      const diff = Math.abs(ai - bi);
      const isSameCol = diff === 0;
      if (isSameCol) {
        // In-column links are usually unreadable in lane view; only keep clear asset spillover links.
        if (!(na.type === 'asset' && nb.type === 'asset' && e.type === 'co_moves')) continue;
      }

      // Very long mentions links (for example source -> asset skipping events) dominate the screen.
      // Keep only stronger ones in flow mode.
      const conf = edgeConfidence(e);
      if (diff >= 2 && e.type === 'mentions' && conf < 0.72) continue;

      let leftNode = na;
      let rightNode = nb;
      let leftPos = pa;
      let rightPos = pb;
      let reversed = false;
      if (ai > bi) {
        reversed = true;
        leftNode = nb;
        rightNode = na;
        leftPos = pb;
        rightPos = pa;
        ai = COL_BY_TYPE[leftNode.type];
        bi = COL_BY_TYPE[rightNode.type];
      }

      let x1 = leftPos.right - 6;
      let y1 = leftPos.y;
      let x2 = rightPos.left + 6;
      let y2 = rightPos.y;
      let c1x = x1 + 60;
      let c1y = y1;
      let c2x = x2 - 60;
      let c2y = y2;

      if (isSameCol) {
        const upper = pa.y <= pb.y ? pa : pb;
        const lower = pa.y <= pb.y ? pb : pa;
        x1 = upper.right - 8;
        y1 = upper.y;
        x2 = lower.right - 8;
        y2 = lower.y;
        const bow = 28 + stableBucket(String(e.id), 6) * 8;
        c1x = x1 + bow;
        c1y = y1 + 12;
        c2x = x2 + bow;
        c2y = y2 - 12;
      } else {
        const laneDiff = Math.max(1, bi - ai);
        const span = Math.max(12, x2 - x1);
        const idealHandle = 48 + laneDiff * 22;
        const maxHandle = Math.max(14, span / 2 - 10);
        const dx = Math.max(14, Math.min(idealHandle, maxHandle));
        const bundle = stableBucket(`${e.id}:${a}:${b}`, 7) - 3;
        const spread = Math.max(2, Math.min(12, span * 0.06));
        const laneOffset = bundle * spread;
        c1x = x1 + dx;
        c1y = y1 + laneOffset;
        c2x = x2 - dx;
        c2y = y2 + laneOffset;
        if (c2x <= c1x) {
          const mid = (x1 + x2) / 2;
          c1x = mid - 6;
          c2x = mid + 6;
        }
      }

      const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      const id = String(e.id);
      const relatesToSelectedNode = focusNodeId ? a === focusNodeId || b === focusNodeId : false;
      const focused = focusEdgeId ? id === focusEdgeId : relatesToSelectedNode;
      const muted = hasFocus && !focused;
      const width = 1 + conf * 1.6 + (focused ? 0.95 : 0);
      const opacity = muted ? 0.11 : focused ? 0.98 : 0.72;

      out.push({
        id,
        d,
        stroke: edgeStroke(e),
        width,
        dashed: e.type === 'hypothesis' || isSameCol || reversed,
        opacity,
        title: `${leftNode.label} -> ${rightNode.label} (${e.type.replace('_', ' ')}, ${(conf * 100).toFixed(0)}%)`,
        focused,
        edgeType: e.type,
      });
    }
    out.sort((a, b) => {
      if (a.focused === b.focused) return 0;
      return a.focused ? 1 : -1;
    });
    return out;
  }, [drawEdges, focusEdgeId, focusNodeId, hasFocus, nodeById, pos]);

  const edgeTypeCounts = useMemo(() => {
    const out: Record<GraphEdge['type'], number> = { mentions: 0, co_moves: 0, hypothesis: 0, same_story: 0 };
    for (const p of paths) out[p.edgeType] += 1;
    return out;
  }, [paths]);

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-70" />
      <div
        ref={viewportRef}
        className={cn('relative w-full overflow-auto', viewportClassName ?? 'h-[320px] lg:h-[430px]')}
      >
        <svg
          className="absolute left-0 top-0"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          onMouseLeave={() => setHoveredEdgeId(null)}
        >
          <defs>
            <linearGradient id="flowFade" x1="0" x2="1">
              <stop offset="0" stopColor="rgba(255,255,255,0.0)" />
              <stop offset="0.25" stopColor="rgba(255,255,255,0.24)" />
              <stop offset="0.85" stopColor="rgba(255,255,255,0.16)" />
              <stop offset="1" stopColor="rgba(255,255,255,0.0)" />
            </linearGradient>
          </defs>
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              stroke={p.stroke}
              strokeWidth={p.width}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={p.dashed ? '4 4' : undefined}
              opacity={p.opacity}
              className={cn('cursor-pointer transition-opacity', p.focused ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.24)]' : '')}
              onMouseEnter={() => setHoveredEdgeId(p.id)}
              onMouseLeave={() => setHoveredEdgeId((prev) => (prev === p.id ? null : prev))}
              onClick={() => {
                flowDebug('edge.click', { edgeId: p.id });
                onSelectNode(null);
                onSelectEdge(p.id);
              }}
            >
              <title>{p.title}</title>
            </path>
          ))}
        </svg>

        <div ref={contentRef} className="relative min-w-[920px] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone="blue" className="mono">
                {t('flowBadge')}
              </Badge>
              <div className="text-xs text-white/55">{t('flowDesc')}</div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/55">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                {t('nodes')} <span className="mono text-white/75">{nodes.length}</span>
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                {t('edges')} <span className="mono text-white/75">{edges.length}</span>
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                {t('drawnLabel')} <span className="mono text-white/75">{paths.length}</span>
              </span>
              {hasFocus ? (
                <span className="rounded-full border border-[rgba(153,197,255,0.35)] bg-[rgba(0,102,255,0.12)] px-2.5 py-1 text-[rgba(153,197,255,0.95)]">
                  {t('focusOn')}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
            <span className="inline-flex items-center gap-1">
              <span className="h-0 w-5 border-t border-white/45" /> {t('mentionsLabel')} {edgeTypeCounts.mentions}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0 w-5 border-t border-[rgba(0,102,255,0.65)]" /> {t('coMovesLabel')} {edgeTypeCounts.co_moves}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0 w-5 border-t border-dashed border-[rgba(255,82,28,0.75)]" /> {t('hypothesisLabel')} {edgeTypeCounts.hypothesis}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0 w-5 border-t border-[rgba(20,184,166,0.75)]" /> {t('sameStoryLabel')} {edgeTypeCounts.same_story}
            </span>
          </div>

          {selectedNodeConnections ? (
            <div className="mt-3 rounded-2xl border border-[rgba(153,197,255,0.35)] bg-[rgba(0,102,255,0.08)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-white/75">
                  <span className={cn('font-semibold', toneForNode(selectedNodeConnections.center.type).text)}>
                    {selectedNodeConnections.center.label}
                  </span>
                  <span className="text-white/60">
                    {' '}
                    {t('connectedWith', { nodeCount: selectedNodeConnections.neighbors.length, linkCount: selectedNodeConnections.edgeCountTotal })}
                  </span>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/70 transition hover:text-white"
                  onClick={() => {
                    onSelectNode(null);
                    onSelectEdge(null);
                  }}
                >
                  {t('clearFocus')}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {(Object.entries(selectedNodeConnections.edgeTypeCounts) as Array<[GraphEdge['type'], number]>)
                  .filter(([, count]) => count > 0)
                  .map(([type, count]) => (
                    <span key={type} className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-white/70">
                      {edgeTypeLabel(type, t)} {count}
                    </span>
                  ))}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {selectedNodeConnections.neighbors.slice(0, 16).map((item) => {
                  const tone = toneForNode(item.node.type);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-left text-[11px] transition hover:bg-white/[0.1]',
                        tone.border,
                        tone.bg,
                        tone.text,
                      )}
                      onClick={() => {
                        onSelectNode(item.id);
                        onSelectEdge(null);
                      }}
                      title={`${item.node.label} (${item.edgeCount} link${item.edgeCount === 1 ? '' : 's'})`}
                    >
                      <span className="max-w-[180px] truncate">{item.node.label}</span>
                      <span className="mono text-[10px] text-white/55">{item.edgeCount}</span>
                    </button>
                  );
                })}
                {selectedNodeConnections.neighbors.length > 16 ? (
                  <span className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
                    {t('moreItems', { count: selectedNodeConnections.neighbors.length - 16 })}
                  </span>
                ) : null}
              </div>
            </div>
          ) : selectedEdgeSummary ? (
            <div className="mt-3 rounded-2xl border border-white/12 bg-white/[0.04] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-white/75">
                  <span className={cn('font-semibold', toneForNode(selectedEdgeSummary.from.type).text)}>{selectedEdgeSummary.from.label}</span>
                  <span className="mx-2 text-white/40">→</span>
                  <span className={cn('font-semibold', toneForNode(selectedEdgeSummary.to.type).text)}>{selectedEdgeSummary.to.label}</span>
                  <span className="text-white/55">
                    {' '}
                    {edgeTypeLabel(selectedEdgeSummary.edge.type, t)} · {(edgeConfidence(selectedEdgeSummary.edge) * 100).toFixed(0)}%
                  </span>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/70 transition hover:text-white"
                  onClick={() => {
                    onSelectEdge(null);
                    onSelectNode(null);
                  }}
                >
                  {t('clearFocus')}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-5 gap-4">
            {cols.map((col) => (
              <div key={col.type} className="rounded-2xl border border-white/10 bg-black/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/70">
                    <span className="text-white/60">{col.icon}</span>
                    {col.label}
                  </div>
                  <Badge className="mono">{col.items.length}</Badge>
                </div>
                <div className="mt-2 space-y-2">
                  {col.items.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/60">
                      {t('none')}
                    </div>
                  ) : (
                    col.items.slice(0, 22).map((n) => {
                      const id = String(n.id);
                      const tone = toneForNode(n.type);
                      const sel = selected.nodeId === id;
                      const related = relatedNodeIds.has(id);
                      const muted = hasFocus && !related;
                      return (
                        <div
                          key={id}
                          data-nodeid={id}
                          className={cn(
                            'flex w-full items-center gap-1 rounded-full border px-1 py-1 text-left text-sm transition',
                            tone.border,
                            tone.bg,
                            sel ? 'ring-2 ring-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.14)]' : 'hover:bg-white/[0.06]',
                            muted ? 'opacity-35' : '',
                          )}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 rounded-full px-2 py-1.5 text-left"
                            onClick={() => {
                              setHoveredEdgeId(null);
                              flowDebug('pill.click', { nodeId: id, label: n.label, type: n.type });
                              onSelectNode(id);
                              onSelectEdge(null);
                            }}
                            title={n.label}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className={cn('truncate font-semibold', tone.text)}>{n.label}</div>
                              {hasFocus && related && !sel ? <div className="mono text-[10px] text-white/50">{t('linkedLabel')}</div> : null}
                            </div>
                          </button>
                          <button
                            type="button"
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.04] text-white/55 transition hover:text-white"
                            title={t('openInInspector', { label: n.label })}
                            onClick={() => {
                              setHoveredEdgeId(null);
                              flowDebug('pill.inspect.click', { nodeId: id, label: n.label, type: n.type });
                              onSelectNode(id);
                              onSelectEdge(null);
                              onInspectNode?.(id);
                            }}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                  {col.items.length > 22 ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/55">
                      {t('showingTop')}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-[11px] text-white/45">
            {t('flowTip')}
          </div>
        </div>
      </div>
    </Card>
  );
}
