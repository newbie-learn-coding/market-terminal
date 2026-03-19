'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d';
import { forceCollide } from 'd3-force-3d';
import * as d3Force from 'd3-force-3d';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/card';
import type { GraphEdge, GraphNode, NodeType } from '@/components/terminal/types';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false }) as unknown as typeof import('react-force-graph-2d').default;

type GraphNodeDatum = NodeObject<GraphNode>;
type GraphLinkDatum = LinkObject<GraphNode, GraphEdge>;

function stable01(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map uint32 to [0, 1).
  return (h >>> 0) / 4294967296;
}

function radialFor(type: NodeType, w: number, h: number) {
  // Spread lanes further apart to reduce overlap while preserving the familiar radial structure.
  const minSide = Math.min(w, h);
  const span = Math.max(760, Math.min(1360, minSide * 1.6));
  const r0 = span * 0.14;
  const r1 = span * 0.42;
  const r2 = span * 0.58;
  const r3 = span * 0.72;
  const r4 = span * 0.84;
  if (type === 'asset') return r0;
  if (type === 'event') return r1;
  if (type === 'entity') return r2;
  if (type === 'media') return r3;
  return r4; // source
}

function displayLabelFor(type: NodeType, label: string) {
  const raw = String(label || '');
  // Long event/source titles can overlap badly in a force layout; keep the canvas
  // labels compact and rely on tooltips/inspector for the full text.
  const max = type === 'event' ? 22 : type === 'entity' ? 22 : type === 'asset' ? 18 : type === 'media' ? 20 : 19;
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function collisionRadius(node: GraphNode) {
  // Approximate the rounded-rect label bounds so nodes don't overlap.
  // We draw monospace labels at ~12px with padding; treat that as the physical size.
  const label = displayLabelFor(node.type, node.label);
  const len = Math.max(1, label.length);
  const fontSize = 12;
  const padX = 12;
  const padY = 8;
  const charW = node.type === 'source' ? 7.0 : node.type === 'event' ? 7.2 : node.type === 'media' ? 6.7 : 6.8;

  const boxW = Math.max(74, len * charW + padX * 2);
  const boxH = fontSize + padY * 2;
  const halfW = boxW / 2;
  const halfH = boxH / 2;

  const bump = node.type === 'event' ? 30 : node.type === 'source' ? 28 : node.type === 'media' ? 26 : 22;
  return Math.sqrt(halfW * halfW + halfH * halfH) + bump;
}

function toneForNode(type: NodeType) {
  if (type === 'asset')
    return { fill: 'rgba(0, 102, 255, 0.18)', stroke: 'rgba(0, 102, 255, 0.58)' };
  if (type === 'event')
    return { fill: 'rgba(255, 82, 28, 0.16)', stroke: 'rgba(255, 82, 28, 0.6)' };
  if (type === 'entity')
    return { fill: 'rgba(20, 184, 166, 0.14)', stroke: 'rgba(20, 184, 166, 0.6)' };
  if (type === 'media')
    return { fill: 'rgba(255, 188, 92, 0.14)', stroke: 'rgba(255, 188, 92, 0.62)' };
  return { fill: 'rgba(255, 255, 255, 0.06)', stroke: 'rgba(255, 255, 255, 0.22)' };
}

function edgeStroke(edge: GraphEdge) {
  if (edge.type === 'mentions') return 'rgba(255,255,255,0.18)';
  if (edge.type === 'co_moves') return 'rgba(0,102,255,0.34)';
  if (edge.type === 'hypothesis') return 'rgba(255,82,28,0.34)';
  return 'rgba(20,184,166,0.28)';
}

function prettyType(type: NodeType, t: (k: string) => string) {
  const map: Record<NodeType, string> = {
    asset: t('legendAsset'),
    event: t('legendEvent'),
    entity: t('legendActors'),
    media: t('legendMedia'),
    source: t('legendSource'),
  };
  return map[type] || type;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function EvidenceGraph({
  nodes,
  edges,
  selected,
  onSelectNode,
  onSelectEdge,
  className,
  viewportClassName,
  fitSignal,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selected: { nodeId: string | null; edgeId: string | null };
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  className?: string;
  viewportClassName?: string;
  fitSignal?: number;
}) {
  const t = useTranslations('workspace');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphEdge> | undefined>(undefined);
  const [size, setSize] = useState({ w: 980, h: 470 });
  const [typeVisible, setTypeVisible] = useState<Record<NodeType, boolean>>({
    asset: true,
    event: true,
    entity: true,
    media: true,
    source: true,
  });

  const visibleTypesKey = useMemo(
    () =>
      `${Number(typeVisible.asset)}${Number(typeVisible.event)}${Number(typeVisible.entity)}${Number(typeVisible.media)}${Number(
        typeVisible.source,
      )}`,
    [typeVisible.asset, typeVisible.entity, typeVisible.event, typeVisible.media, typeVisible.source],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextW = Math.max(320, Math.round(entry.contentRect.width));
      const nextH = Math.max(240, Math.round(entry.contentRect.height));
      setSize({ w: nextW, h: nextH });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const filteredNodes = nodes.filter((n) => typeVisible[n.type]);
    const keepNodeIds = new Set(filteredNodes.map((n) => String(n.id || n.label || '')));
    const filteredEdges = edges.filter((e) => keepNodeIds.has(String(e.from)) && keepNodeIds.has(String(e.to)));

    // ForceGraph mutates node/link objects; keep it away from React state.
    const copiedNodes: GraphNodeDatum[] = filteredNodes.map((n) => {
      const id = String(n.id || n.label || '');
      const ang = stable01(`${id}:a`) * Math.PI * 2;
      const rr = radialFor(n.type, size.w, size.h) + (stable01(`${id}:r`) - 0.5) * 66;
      const jitter = (stable01(`${id}:j`) - 0.5) * 22;
      return {
        ...n,
        x: Math.cos(ang) * rr + jitter,
        y: Math.sin(ang) * rr - jitter,
      } as GraphNodeDatum;
    });
    const copiedLinks: GraphLinkDatum[] = filteredEdges.map((e) => ({ ...e, source: e.from, target: e.to }) as GraphLinkDatum);
    return { nodes: copiedNodes, links: copiedLinks };
  }, [edges, nodes, size.h, size.w, typeVisible]);

  useEffect(() => {
    if (!nodes.length) return;
    const t = window.setTimeout(() => {
      graphRef.current?.zoomToFit(560, 64);
    }, 80);
    return () => window.clearTimeout(t);
  }, [edges.length, fitSignal, nodes.length]);

  useEffect(() => {
    if (!nodes.length) return;
    const g = graphRef.current;
    if (!g) return;

    const collide = forceCollide((n) => collisionRadius(n as GraphNode));
    if (typeof (collide as any).iterations === 'function') (collide as any).iterations(15);
    g.d3Force('collide', collide as any);

    const fr = (d3Force as any).forceRadial(
      (n: GraphNodeDatum) => radialFor((n as unknown as GraphNode).type, size.w, size.h),
      0,
      0,
    );
    if (typeof (fr as any).strength === 'function') (fr as any).strength(0.22);
    g.d3Force('radial', fr as any);

    const link = g.d3Force('link') as any;
    if (link && typeof link.distance === 'function') {
      link.distance((l: GraphLinkDatum) => {
        const t = (l as any).type as GraphEdge['type'] | undefined;
        const s = (l as any).source;
        const t0 = (l as any).target;
        const st = typeof s === 'object' && s ? (s as any).type : null;
        const tt = typeof t0 === 'object' && t0 ? (t0 as any).type : null;

        const isSourceEvent = (st === 'source' && tt === 'event') || (st === 'event' && tt === 'source');
        const isEventAsset = (st === 'event' && tt === 'asset') || (st === 'asset' && tt === 'event');
        const isEntityAsset = (st === 'entity' && tt === 'asset') || (st === 'asset' && tt === 'entity');
        const isSourceAsset = (st === 'source' && tt === 'asset') || (st === 'asset' && tt === 'source');

        if (isSourceEvent) return 152;
        if (isEventAsset) return 168;
        if (isEntityAsset) return 182;
        if (isSourceAsset) return 208;

        if (t === 'mentions') return 176;
        if (t === 'hypothesis') return 204;
        if (t === 'co_moves') return 224;
        return 184;
      });
    }
    if (link && typeof link.strength === 'function') {
      link.strength((l: GraphLinkDatum) => {
        const conf = Number((l as any).confidence ?? 0.5);
        return Math.max(0.06, Math.min(0.2, 0.08 + conf * 0.12));
      });
    }

    const charge = g.d3Force('charge') as any;
    if (charge && typeof charge.strength === 'function') {
      charge.strength((n: GraphNodeDatum) => {
        const type = (n as any)?.type as NodeType | undefined;
        if (type === 'asset') return -240;
        if (type === 'event') return -360;
        if (type === 'media') return -300;
        if (type === 'source') return -320;
        return -290;
      });
    }
    if (charge && typeof charge.distanceMin === 'function') charge.distanceMin(28);
    if (charge && typeof charge.distanceMax === 'function') charge.distanceMax(620);

    // Slightly higher decay helps the layout settle quickly while keeping separation.
    if (typeof (g as any).d3VelocityDecay === 'function') (g as any).d3VelocityDecay(0.34);

    g.d3ReheatSimulation();
  }, [edges.length, nodes.length, size.h, size.w]);

  useEffect(() => {
    // Clear selection if it becomes hidden by filters.
    const visibleNodeIds = new Set(graphData.nodes.map((n) => String(n.id)));
    const visibleEdgeIds = new Set(graphData.links.map((l) => String((l as any).id)));
    if (selected.nodeId && !visibleNodeIds.has(selected.nodeId)) onSelectNode(null);
    if (selected.edgeId && !visibleEdgeIds.has(selected.edgeId)) onSelectEdge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData.nodes, graphData.links, visibleTypesKey]);

  const nodeCanvasObject = useCallback(
    (node: GraphNodeDatum, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const isSel = selected.nodeId === node.id;
      const tone = toneForNode(node.type);

      const fontSize = 12 / globalScale;
      const padX = 12 / globalScale;
      const padY = 8 / globalScale;
      const radius = 14 / globalScale;
      ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

      const label = displayLabelFor(node.type, node.label);
      const textW = ctx.measureText(label).width;
      const boxW = Math.max(58 / globalScale, textW + padX * 2);
      const boxH = fontSize + padY * 2;
      const left = x - boxW / 2;
      const top = y - boxH / 2;

      ctx.save();
      ctx.shadowColor = isSel ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.42)';
      ctx.shadowBlur = (isSel ? 18 : 12) / globalScale;
      ctx.shadowOffsetY = 2 / globalScale;
      roundedRectPath(ctx, left, top, boxW, boxH, radius);
      ctx.fillStyle = tone.fill;
      ctx.fill();
      ctx.lineWidth = (isSel ? 2.1 : 1.15) / globalScale;
      ctx.strokeStyle = isSel ? 'rgba(255,255,255,0.62)' : tone.stroke;
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isSel ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.82)';
      ctx.fillText(label, x, y + 0.5 / globalScale);
    },
    [selected.nodeId],
  );

  const nodePointerAreaPaint = useCallback(
    (node: GraphNodeDatum, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const fontSize = 12 / globalScale;
      const padX = 14 / globalScale;
      const padY = 10 / globalScale;
      ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      const textW = ctx.measureText(displayLabelFor(node.type, node.label)).width;
      const boxW = Math.max(74 / globalScale, textW + padX * 2);
      const boxH = fontSize + padY * 2;
      roundedRectPath(ctx, x - boxW / 2, y - boxH / 2, boxW, boxH, 14 / globalScale);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

  const linkColor = useCallback(
    (link: GraphLinkDatum) => {
      if (selected.edgeId === link.id) return 'rgba(255,255,255,0.56)';
      return edgeStroke(link);
    },
    [selected.edgeId],
  );

  const linkWidth = useCallback(
    (link: GraphLinkDatum) => {
      if (selected.edgeId === link.id) return 2.7;
      return 1.1 + Math.max(0, Math.min(1, link.confidence)) * 1.25;
    },
    [selected.edgeId],
  );

  const zoomIn = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    const z = g.zoom();
    g.zoom(Math.min(10, z * 1.25), 180);
  }, []);

  const zoomOut = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    const z = g.zoom();
    g.zoom(Math.max(0.22, z / 1.25), 180);
  }, []);

  const fit = useCallback(() => {
    graphRef.current?.zoomToFit(520, 64);
  }, []);

  const centerSelection = useCallback(() => {
    const g = graphRef.current;
    if (!g || !selected.nodeId) return;
    const n = graphData.nodes.find((v) => v.id === selected.nodeId);
    if (!n || typeof n.x !== 'number' || typeof n.y !== 'number') return;
    g.centerAt(n.x, n.y, 220);
    g.zoom(Math.max(1.05, Math.min(3.2, g.zoom() * 1.35)), 220);
  }, [graphData.nodes, selected.nodeId]);

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-70" />

      <div
        ref={containerRef}
        className={cn('relative w-full', viewportClassName ?? 'h-[320px] lg:h-[430px]')}
      >
        <ForceGraph2D<GraphNode, GraphEdge>
          ref={graphRef}
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          warmupTicks={18}
          cooldownTicks={220}
          nodeId="id"
          linkSource="source"
          linkTarget="target"
          showPointerCursor
          nodeRelSize={4}
          nodeCanvasObjectMode={() => 'replace'}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkCurvature={(l) => (l.type === 'same_story' ? 0.18 : 0.06)}
          linkLineDash={(l) => (l.type === 'hypothesis' ? [4, 4] : null)}
          linkDirectionalArrowLength={(l) => (l.type === 'hypothesis' ? 4 : 0)}
          linkDirectionalArrowRelPos={0.95}
          linkHoverPrecision={10}
          onNodeClick={(n) => {
            onSelectNode(String(n.id));
            onSelectEdge(null);
          }}
          onLinkClick={(l) => {
            onSelectEdge(l.id);
            onSelectNode(null);
          }}
          onBackgroundClick={() => {
            onSelectNode(null);
            onSelectEdge(null);
          }}
          nodeLabel={(n) => `${n.label} (${prettyType(n.type, t)})`}
          linkLabel={(l) => `${l.type.replace(/_/g, ' ')} · ${Math.round(l.confidence * 100)}%`}
        />

        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/10 bg-[#070b14]/70 px-3 py-1 text-[11px] text-white/65 backdrop-blur">
          {(
            [
              { type: 'asset' as const, label: t('legendAsset'), tone: 'bg-[rgba(0,102,255,0.18)] text-white/80' },
              { type: 'event' as const, label: t('legendEvent'), tone: 'bg-[rgba(255,82,28,0.16)] text-white/80' },
              { type: 'entity' as const, label: t('legendActors'), tone: 'bg-[rgba(20,184,166,0.14)] text-white/80' },
              { type: 'media' as const, label: t('legendMedia'), tone: 'bg-[rgba(255,188,92,0.18)] text-white/80' },
              { type: 'source' as const, label: t('legendSource'), tone: 'bg-white/[0.06] text-white/75' },
            ] as const
          ).map((item) => {
            const on = Boolean(typeVisible[item.type]);
            return (
              <button
                key={item.type}
                type="button"
                className={cn(
                  'rounded-full px-2 py-0.5 transition',
                  item.tone,
                  on ? 'opacity-100' : 'opacity-35 line-through',
                  'hover:opacity-95',
                )}
                onClick={() => {
                  setTypeVisible((prev) => ({ ...prev, [item.type]: !prev[item.type] }));
                  window.setTimeout(() => graphRef.current?.zoomToFit(420, 64), 0);
                }}
                title={on ? t('hideLabel', { label: item.label }) : t('showLabel', { label: item.label })}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="absolute right-3 top-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomIn}
            aria-label={t('zoomIn')}
            className="h-9 w-9 border border-white/10 bg-[#070b14]/60 hover:bg-white/10"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomOut}
            aria-label={t('zoomOut')}
            className="h-9 w-9 border border-white/10 bg-[#070b14]/60 hover:bg-white/10"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={fit}
            aria-label={t('fitGraph')}
            className="h-9 w-9 border border-white/10 bg-[#070b14]/60 hover:bg-white/10"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={centerSelection}
            aria-label={t('centerSelection')}
            className="h-9 w-9 border border-white/10 bg-[#070b14]/60 hover:bg-white/10"
            disabled={!selected.nodeId}
          >
            <span className="mono text-sm font-semibold">C</span>
          </Button>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/10 bg-[#070b14]/65 px-3 py-1 text-[11px] text-white/60 backdrop-blur">
          {t('graphHelp')}
        </div>
      </div>
    </Card>
  );
}
