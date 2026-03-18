import { toneForNode, edgeTypeMeta, pickRoot, sortByScore } from '@/components/terminal/graph-utils';
import type { GraphEdge, GraphNode, NodeType } from '@/components/terminal/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';
import { SectionLabel } from '@/components/ui/section-label';

export function StaticMindMap({
  topic,
  nodes,
  edges,
}: {
  topic: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const nodeById = new Map<string, GraphNode>();
  nodes.forEach((n) => nodeById.set(String(n.id), n));

  const edgesByNode = new Map<string, GraphEdge[]>();
  const neighbors = new Map<string, Set<string>>();
  const strongestEdgeByType = new Map<GraphEdge['type'], GraphEdge>();

  for (const e of edges) {
    const a = String(e.from);
    const b = String(e.to);
    const prevA = edgesByNode.get(a) || [];
    prevA.push(e);
    edgesByNode.set(a, prevA);
    const prevB = edgesByNode.get(b) || [];
    prevB.push(e);
    edgesByNode.set(b, prevB);

    const na = neighbors.get(a) || new Set<string>();
    na.add(b);
    neighbors.set(a, na);
    const nb = neighbors.get(b) || new Set<string>();
    nb.add(a);
    neighbors.set(b, nb);

    const prevStrong = strongestEdgeByType.get(e.type);
    if (!prevStrong || Number(e.confidence || 0) > Number(prevStrong.confidence || 0)) {
      strongestEdgeByType.set(e.type, e);
    }
  }

  const root = pickRoot(nodes, topic);
  const rootId = root ? String(root.id) : null;

  const scoreById = new Map<string, number>();
  for (const n of nodes) {
    const id = String(n.id);
    const linked = neighbors.get(id)?.size ?? 0;
    const localEdges = edgesByNode.get(id) || [];
    const avgConfidence = localEdges.length
      ? localEdges.reduce((sum, edge) => sum + Number(edge.confidence || 0), 0) / localEdges.length
      : 0;
    scoreById.set(id, linked + avgConfidence * 2);
  }

  const direct = rootId ? Array.from(neighbors.get(rootId) || []) : [];
  const directByType: Record<NodeType, string[]> = { asset: [], event: [], entity: [], source: [], media: [] };
  for (const id of direct) {
    const n = nodeById.get(id);
    if (!n) continue;
    directByType[n.type].push(id);
  }

  const events = sortByScore(directByType.event, scoreById).slice(0, 6);
  const spillovers = sortByScore(
    directByType.asset.filter((x) => x !== rootId),
    scoreById,
  ).slice(0, 6);
  const entities = sortByScore(directByType.entity, scoreById).slice(0, 6);

  // Channel counts
  const channelCounts: Record<GraphEdge['type'], number> = { mentions: 0, co_moves: 0, hypothesis: 0, same_story: 0 };
  for (const e of edges) channelCounts[e.type] += 1;
  const channelOrder = (['mentions', 'hypothesis', 'co_moves', 'same_story'] as GraphEdge['type'][]).filter(
    (t) => channelCounts[t] > 0,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <SectionLabel>Mind Map</SectionLabel>
          <span className="text-xs text-white/55">Graph structure overview</span>
        </div>
      </CardHeader>

      <CardContent>
        {/* Focus Asset */}
        <Card className="mx-auto max-w-[760px] p-4">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-white/50">FOCUS ASSET</div>
          <div className="mt-2 flex justify-center">
            {root ? (
              <Badge
                className={`px-4 py-2 text-sm ${toneForNode(root.type).border} ${toneForNode(root.type).bg} ${toneForNode(root.type).text}`}
              >
                {root.label}
              </Badge>
            ) : (
              <span className="text-sm text-white/60">No nodes</span>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {/* Catalysts */}
            <div className="rounded-xl border border-white/[0.08] bg-black/15 p-3">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-white/55">CATALYSTS</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {events.length ? (
                  events.map((id) => {
                    const node = nodeById.get(id);
                    if (!node) return null;
                    return (
                      <Badge key={id} variant="orange">
                        <span className="max-w-[200px] truncate">{node.label}</span>
                      </Badge>
                    );
                  })
                ) : (
                  <span className="text-xs text-white/55">No events</span>
                )}
              </div>
            </div>

            {/* Channels */}
            <div className="rounded-xl border border-white/[0.08] bg-black/15 p-3">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-white/55">CHANNELS</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {channelOrder.length ? (
                  channelOrder.map((type) => {
                    const meta = edgeTypeMeta(type);
                    return (
                      <Badge key={type} className={meta.chip}>
                        <span>{meta.label}</span>
                        <span className="opacity-80">{channelCounts[type]}</span>
                      </Badge>
                    );
                  })
                ) : (
                  <span className="text-xs text-white/55">No channels</span>
                )}
              </div>
            </div>

            {/* Impact */}
            <div className="rounded-xl border border-white/[0.08] bg-black/15 p-3">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-white/55">IMPACT</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[...spillovers, ...entities].slice(0, 6).length ? (
                  [...spillovers, ...entities].slice(0, 6).map((id) => {
                    const node = nodeById.get(id);
                    if (!node) return null;
                    const tone = toneForNode(node.type);
                    return (
                      <Badge
                        key={id}
                        className={`${tone.border} ${tone.bg} ${tone.text}`}
                      >
                        <span className="max-w-[200px] truncate">{node.label}</span>
                      </Badge>
                    );
                  })
                ) : (
                  <span className="text-xs text-white/55">No impact nodes</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      </CardContent>
    </Card>
  );
}
