'use client';

import type { ReactNode } from 'react';
import { Maximize2, Network } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LoadRipple } from '@/components/ui/load-ripple';
import { EvidenceGraph } from '@/components/terminal/EvidenceGraph';
import { EvidenceFlow } from '@/components/terminal/EvidenceFlow';
import { EvidenceMindMap } from '@/components/terminal/EvidenceMindMap';
import { EvidenceTimeline, type TimelineItem } from '@/components/terminal/EvidenceTimeline';
import type { EvidenceView } from '@/components/terminal/EvidenceViewToggle';
import type { GraphEdge, GraphNode } from '@/components/terminal/types';

function WorkspaceLoading({
  title,
  subtitle,
  stage,
}: {
  title: string;
  subtitle: string;
  stage?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/25">
      <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:radial-gradient(circle_at_20%_20%,rgba(0,102,255,0.18),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(255,82,28,0.14),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:54px_54px]" />
      <div className="relative grid h-[56vh] min-h-[340px] place-items-center px-4">
        <div className="flex flex-col items-center text-center">
          <LoadRipple compact />
          <div className="mt-3 text-sm font-semibold text-white/86">{title}</div>
          <div className="mt-1 max-w-md text-xs leading-relaxed text-white/55">{subtitle}</div>
          {stage ? <div className="mt-2 text-[11px] text-[rgba(173,212,255,0.95)]">{stage}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function WorkspacePanel({
  isEmpty,
  session,
  evidenceView,
  hasWorkspaceGraph,
  workspaceGraph,
  timelineData,
  selectedNodeId,
  selectedEdgeId,
  flowFocusNodeId,
  flowFocusEdgeId,
  selectedTag,
  tagOptions,
  graphFitSignal,
  graphFullscreen,
  chatPanelOpen,
  snapshotLoading,
  stepLabel,
  onEvidenceViewChange,
  onSelectNode,
  onSelectEdge,
  onFlowFocusNode,
  onFlowFocusEdge,
  onInspectNode,
  onSelectTag,
  onGraphFullscreen,
  onToggleChat,
  onOpenEvidence,
}: {
  isEmpty: boolean;
  session: { topic: string; evidence: { id: string }[]; step: string } | null;
  evidenceView: EvidenceView;
  hasWorkspaceGraph: boolean;
  workspaceGraph: { nodes: GraphNode[]; edges: GraphEdge[] };
  timelineData: TimelineItem[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  flowFocusNodeId: string | null;
  flowFocusEdgeId: string | null;
  selectedTag: string | null;
  tagOptions: string[];
  graphFitSignal: number;
  graphFullscreen: boolean;
  chatPanelOpen: boolean;
  snapshotLoading: boolean;
  stepLabel: string;
  onEvidenceViewChange: (v: EvidenceView) => void;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onFlowFocusNode: (id: string | null) => void;
  onFlowFocusEdge: (id: string | null) => void;
  onInspectNode: (id: string) => void;
  onSelectTag: (tag: string | null) => void;
  onGraphFullscreen: () => void;
  onToggleChat: () => void;
  onOpenEvidence: (title: string, evidenceIds: string[]) => void;
}) {
  return (
    <Card className="lg:min-h-[68vh]">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-white/80" />
          <div>
            <CardTitle>Evidence Workspace</CardTitle>
            <CardDescription>
              {isEmpty
                ? 'Run a topic, then work directly in Graph / Mind / Flow / Timeline'
                : hasWorkspaceGraph || evidenceView === 'timeline'
                  ? 'Map-first view with linked evidence, media, and timeline filters'
                  : 'Generating workspace graph...'}
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onGraphFullscreen}
            className="border-white/12 bg-white/[0.03]"
            disabled={!hasWorkspaceGraph && evidenceView !== 'timeline'}
          >
            <Maximize2 className="h-4 w-4" />
            Full
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleChat}
            className="border-white/12 bg-white/[0.03]"
          >
            {chatPanelOpen ? 'Hide chat' : 'Chat'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {isEmpty ? (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-5">
            <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:radial-gradient(circle_at_20%_20%,rgba(0,102,255,0.18),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(255,82,28,0.14),transparent_55%)]" />
            <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:54px_54px]" />
            <div className="relative grid h-[56vh] min-h-[340px] place-items-center">
              <div className="max-w-sm text-center">
                <div className="text-sm font-semibold text-white/85">Empty workspace</div>
                <div className="mt-1 text-xs leading-relaxed text-white/55">
                  Run a topic and the map will include evidence, media links, and timeline points.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tabs
                value={evidenceView}
                onValueChange={(v) => onEvidenceViewChange(v as EvidenceView)}
              >
                <TabsList>
                  <TabsTrigger value="graph" disabled={!hasWorkspaceGraph && evidenceView !== 'timeline'}>Graph</TabsTrigger>
                  <TabsTrigger value="mind" disabled={!hasWorkspaceGraph && evidenceView !== 'timeline'}>Mind</TabsTrigger>
                  <TabsTrigger value="flow" disabled={!hasWorkspaceGraph && evidenceView !== 'timeline'}>Flow</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                  nodes <span className="mono text-white/75">{workspaceGraph.nodes.length}</span>
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                  edges <span className="mono text-white/75">{workspaceGraph.edges.length}</span>
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                  evidence <span className="mono text-white/75">{session?.evidence.length ?? 0}</span>
                </span>
              </div>
            </div>

            {tagOptions.length ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition',
                    selectedTag ? 'border-white/10 bg-white/[0.03] text-white/65 hover:text-white/85' : 'border-white/15 bg-white/[0.08] text-white/85',
                  )}
                  onClick={() => onSelectTag(null)}
                >
                  all
                </button>
                {tagOptions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] transition',
                      selectedTag?.toLowerCase() === tag.toLowerCase()
                        ? 'border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.16)] text-[rgba(170,209,255,0.95)]'
                        : 'border-white/10 bg-white/[0.03] text-white/65 hover:text-white/85',
                    )}
                    onClick={() => onSelectTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}

            {snapshotLoading ? (
              <WorkspaceLoading
                title="Opening Snapshot"
                subtitle="Restoring your saved evidence map and timeline exactly as captured."
              />
            ) : evidenceView === 'timeline' ? (
              <EvidenceTimeline
                items={timelineData}
                selectedTag={selectedTag}
                onSelectTag={onSelectTag}
                onSelectNode={(id) => {
                  onSelectNode(id);
                  onSelectEdge(null);
                }}
                onOpenEvidence={(title, evidenceIds) => onOpenEvidence(title, evidenceIds)}
                viewportClassName="h-[56vh] min-h-[340px]"
              />
            ) : !hasWorkspaceGraph ? (
              <WorkspaceLoading
                title="Building Evidence Map"
                subtitle="Linking sources, events, assets, and media into a single map workspace."
                stage={stepLabel}
              />
            ) : evidenceView === 'graph' ? (
              <EvidenceGraph
                nodes={workspaceGraph.nodes}
                edges={workspaceGraph.edges}
                selected={{ nodeId: selectedNodeId, edgeId: selectedEdgeId }}
                onSelectNode={onSelectNode}
                onSelectEdge={onSelectEdge}
                fitSignal={graphFitSignal}
                viewportClassName="h-[56vh] min-h-[340px]"
              />
            ) : evidenceView === 'mind' ? (
              <EvidenceMindMap
                topic={session!.topic}
                nodes={workspaceGraph.nodes}
                edges={workspaceGraph.edges}
                selected={{ nodeId: selectedNodeId, edgeId: selectedEdgeId }}
                onSelectNode={onSelectNode}
                onSelectEdge={onSelectEdge}
                viewportClassName="h-[56vh] min-h-[340px]"
              />
            ) : (
              <EvidenceFlow
                nodes={workspaceGraph.nodes}
                edges={workspaceGraph.edges}
                selected={{ nodeId: flowFocusNodeId, edgeId: flowFocusEdgeId }}
                onSelectNode={(id) => {
                  onFlowFocusNode(id);
                  onFlowFocusEdge(null);
                }}
                onSelectEdge={(id) => {
                  onFlowFocusEdge(id);
                  if (id) onFlowFocusNode(null);
                }}
                onInspectNode={(id) => {
                  onInspectNode(id);
                  onSelectEdge(null);
                }}
                viewportClassName="h-[56vh] min-h-[340px]"
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
