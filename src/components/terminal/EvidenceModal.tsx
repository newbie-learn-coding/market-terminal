'use client';

import type { ReactNode } from 'react';
import { Copy, RefreshCw, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EvidenceGraph } from '@/components/terminal/EvidenceGraph';
import { EvidenceFlow } from '@/components/terminal/EvidenceFlow';
import { EvidenceMindMap } from '@/components/terminal/EvidenceMindMap';
import { EvidenceTimeline, type TimelineItem } from '@/components/terminal/EvidenceTimeline';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { EvidenceView } from '@/components/terminal/EvidenceViewToggle';
import type { GraphEdge, GraphNode } from '@/components/terminal/types';

type EvidenceItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  observedAt: number;
  timeKind: 'published' | 'observed';
  language?: string;
  excerpt?: string;
  excerptSource?: 'serp' | 'markdown';
  aiSummary?: {
    bullets: string[];
    entities?: string[];
    catalysts?: string[];
    sentiment?: 'bullish' | 'bearish' | 'mixed' | 'neutral';
    confidence?: number;
  };
};

type TraceEventRow = {
  id: number;
  created_at: string;
  type: string;
  payload: any;
};

type TraceResponse = {
  session: {
    id: string;
    created_at: string;
    topic: string;
    status: string;
    step: string;
    progress: number;
    meta: any;
  };
  events: TraceEventRow[];
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toneForTag(tag: string): 'neutral' | 'blue' | 'orange' | 'teal' {
  const t = String(tag || '').toLowerCase();
  if (!t) return 'neutral';
  if (/(fed|rates?|yield|treasury|cpi|inflation|macro|dxy|dollar|gold|xau|oil|wti|brent)/.test(t)) return 'blue';
  if (/(etf|sec|regulat|lawsuit|policy|approval|ban|sanction)/.test(t)) return 'orange';
  if (/(flow|liquidity|volume|derivatives|funding|miners?|spillover|correlat|co[_-]?move)/.test(t)) return 'teal';
  if (/(rumou?r|unverified|speculation)/.test(t)) return 'orange';
  return 'neutral';
}

function sanitizeExcerpt(raw: string) {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/```[\s\S]*?```/g, '\n');
  s = s.replace(/!\[[^\]]*]\([^)]*\)/g, ' ');
  s = s.replace(/\[([^\]]{0,220})]\(([^)]+)\)/g, (_, label) => String(label || '').trim());
  s = s.replace(/\[\s*]\([^)]+\)/g, ' ');
  s = s.replace(/[*_`>#]/g, ' ');
  s = s.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  const best = lines.find((l) => l.length >= 90 && /[.!?]/.test(l)) || lines.find((l) => l.length >= 140) || lines[0] || '';
  return best.replace(/\s+/g, ' ').trim();
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      el.style.top = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function EvidenceCard({
  ev,
  tapeTagsByEvidenceId,
  copiedKey,
  keyPrefix,
  onCopy,
}: {
  ev: EvidenceItem;
  tapeTagsByEvidenceId: Map<string, string[]>;
  copiedKey: string | null;
  keyPrefix: string;
  onCopy: (key: string) => void;
}) {
  const tapeTags = tapeTagsByEvidenceId.get(ev.id) || [];
  const catalysts = (ev.aiSummary?.catalysts || []).slice(0, 3);
  const entities = (ev.aiSummary?.entities || []).slice(0, 2);
  const tags = tapeTags.slice(0, 4);
  const excerpt = ev.excerpt ? sanitizeExcerpt(ev.excerpt) : '';
  const copyKey = `ev.url.${keyPrefix}.${ev.id}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-white/86">{ev.title}</div>
        <div className="text-[11px] text-white/45 mono">
          {ev.timeKind === 'published' ? 'Published' : 'Seen'} {formatTime(ev.publishedAt)}
        </div>
      </div>
      <div className="mt-1 text-[11px] text-white/50">
        {ev.source}
        {ev.language ? ` \u00B7 ${ev.language.toUpperCase()}` : ''}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5">ARTICLE</span>
        <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-white/50">
          {ev.excerptSource === 'markdown' ? 'Bright Data markdown' : 'SERP snippet'}
        </span>
      </div>
      {(tags.length > 0 || catalysts.length > 0 || entities.length > 0) ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge key={`${ev.id}_t_${keyPrefix}_${tag}`} tone={toneForTag(tag)} className="mono">{tag}</Badge>
          ))}
          {catalysts.map((c) => (
            <Badge key={`${ev.id}_c_${keyPrefix}_${c}`} variant="teal" className="mono">{c}</Badge>
          ))}
          {entities.map((c) => (
            <Badge key={`${ev.id}_e_${keyPrefix}_${c}`} variant="neutral" className="mono text-white/70">{c}</Badge>
          ))}
        </div>
      ) : null}
      {excerpt ? <div className="mt-2 text-sm leading-relaxed text-white/72">{excerpt}</div> : null}
      {ev.aiSummary?.bullets?.length ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-white/55">AI SUMMARY</div>
            {typeof ev.aiSummary.confidence === 'number' ? (
              <div className="text-[11px] text-white/45 mono">conf {Math.round(ev.aiSummary.confidence * 100)}%</div>
            ) : null}
          </div>
          <div className="mt-2 space-y-1 text-sm text-white/75">
            {ev.aiSummary.bullets.slice(0, 5).map((b, idx) => (
              <div key={`${ev.id}_b_${keyPrefix}_${idx}`} className="flex gap-2">
                <span className="text-white/35">-</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
          {(ev.aiSummary.catalysts?.length || ev.aiSummary.entities?.length) ? (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/55">
              {(ev.aiSummary.catalysts || []).slice(0, 6).map((c) => (
                <span key={`${ev.id}_c2_${keyPrefix}_${c}`} className="rounded-full bg-white/[0.04] px-2.5 py-1">{c}</span>
              ))}
              {(ev.aiSummary.entities || []).slice(0, 6).map((c) => (
                <span key={`${ev.id}_e2_${keyPrefix}_${c}`} className="rounded-full bg-white/[0.03] px-2.5 py-1 text-white/50">{c}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <a
          href={ev.url}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs text-[rgba(153,197,255,0.9)] hover:text-white underline underline-offset-4"
        >
          Open source
        </a>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Copy source link"
          onClick={async () => {
            const ok = await copyToClipboard(ev.url);
            if (ok) onCopy(copyKey);
          }}
        >
          <Copy className={cn('h-3.5 w-3.5', copiedKey === copyKey ? 'text-white/85' : 'text-white/55')} />
        </Button>
      </div>
    </div>
  );
}

/* ── Drawer (side panel) ─────────────────────────────────────────── */

function Drawer({
  open,
  title,
  subtitle,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={cn('fixed inset-0 z-[60] transition-opacity', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
      <div
        className={cn('absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute right-3 top-20 bottom-4 w-[min(520px,calc(100%-1.5rem))] transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-[110%]',
        )}
      >
        <div className="h-full overflow-hidden rounded-3xl border border-white/10 bg-[#070b14]/95 shadow-[0_40px_100px_-55px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-white/90">{title}</div>
              <div className="text-[11px] text-white/45">{subtitle || 'Evidence and excerpts'}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close drawer">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-full overflow-auto px-5 py-4 pb-24">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Evidence Drawer (main) ──────────────────────────────────────── */

export function EvidenceDrawer({
  open,
  title,
  note,
  evidence,
  tapeTagsByEvidenceId,
  copiedKey,
  onClose,
  onCopy,
}: {
  open: boolean;
  title: string;
  note: string | null;
  evidence: EvidenceItem[];
  tapeTagsByEvidenceId: Map<string, string[]>;
  copiedKey: string | null;
  onClose: () => void;
  onCopy: (key: string) => void;
}) {
  return (
    <Drawer open={open} title={title} onClose={onClose}>
      {evidence.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
          No evidence selected yet.
        </div>
      ) : (
        <div className="space-y-3">
          {note ? (
            <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-4 text-sm text-white/70">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-white/50">WHY THIS LINK</div>
              <div className="mt-1 leading-relaxed">{note}</div>
            </div>
          ) : null}
          {evidence.map((ev) => (
            <EvidenceCard
              key={ev.id}
              ev={ev}
              tapeTagsByEvidenceId={tapeTagsByEvidenceId}
              copiedKey={copiedKey}
              keyPrefix="dr"
              onCopy={onCopy}
            />
          ))}
        </div>
      )}
    </Drawer>
  );
}

/* ── Trace Drawer ────────────────────────────────────────────────── */

export function TraceDrawer({
  open,
  session,
  mode,
  runMeta,
  trace,
  traceLoading,
  traceError,
  copiedKey,
  onClose,
  onRefresh,
  onCopy,
}: {
  open: boolean;
  session: { id: string; topic: string } | null;
  mode: 'fast' | 'deep';
  runMeta: { mode: 'fast' | 'deep'; provider: string } | null;
  trace: TraceResponse | null;
  traceLoading: boolean;
  traceError: string | null;
  copiedKey: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onCopy: (key: string) => void;
}) {
  return (
    <Drawer open={open} title="Run Trace" subtitle="Stored pipeline events (PostgreSQL)" onClose={onClose}>
      {!session ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
          Run a topic to generate a trace.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white/90 mono">{session.id}</div>
              <div className="mt-0.5 text-[11px] text-white/45">
                {session.topic} \u00B7 {runMeta?.mode ?? mode} \u00B7 {runMeta?.provider ?? 'ai'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/12 bg-white/[0.03]"
                onClick={async () => {
                  const ok = await copyToClipboard(session.id);
                  if (ok) onCopy('trace.session');
                }}
                disabled={!isUuid(session.id)}
              >
                <Copy className="h-4 w-4" />
                {copiedKey === 'trace.session' ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-white/12 bg-white/[0.03]"
                onClick={onRefresh}
                disabled={traceLoading || !isUuid(session.id)}
              >
                <RefreshCw className={cn('h-4 w-4', traceLoading ? 'animate-spin' : '')} />
                Refresh
              </Button>
            </div>
          </div>

          {traceError ? (
            <div className="rounded-2xl border border-white/10 bg-[rgba(255,82,28,0.08)] px-4 py-3 text-xs text-white/70">
              {traceError}
            </div>
          ) : null}

          {!isUuid(session.id) ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
              Waiting for server session id...
            </div>
          ) : traceLoading && !trace ? (
            <div className="space-y-2">
              <div className="h-12 rounded-2xl bg-white/[0.03] shimmer" />
              <div className="h-12 rounded-2xl bg-white/[0.03] shimmer" />
              <div className="h-12 rounded-2xl bg-white/[0.03] shimmer" />
            </div>
          ) : !trace ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
              No stored trace yet. Click refresh, or finish the run and refresh again.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-white/45">
                <span>
                  Stored: <span className="mono text-white/70">{new Date(trace.session.created_at).toLocaleTimeString()}</span>
                </span>
                <span className="mono">{trace.events.length} events</span>
              </div>
              <div className="max-h-[62vh] overflow-auto rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                <div className="space-y-2">
                  {trace.events.map((ev) => {
                    const summary = (() => {
                      const p = ev.payload;
                      if (ev.type === 'step') return `${p?.step ?? 'step'} \u00B7 ${Math.round((p?.progress ?? 0) * 100)}%`;
                      if (ev.type === 'plan') return `${(p?.queries?.length ?? 0)} queries`;
                      if (ev.type === 'search.partial') return `${p?.query ?? 'query'} \u00B7 ${p?.found ?? 0} found`;
                      if (ev.type === 'search') return `${(p?.results?.length ?? 0)} results`;
                      if (ev.type === 'evidence') return `${(p?.items?.length ?? 0)} evidence`;
                      if (ev.type === 'tape') return `${(p?.items?.length ?? 0)} tape items`;
                      if (ev.type === 'graph') return `${(p?.nodes?.length ?? 0)} nodes \u00B7 ${(p?.edges?.length ?? 0)} edges`;
                      if (ev.type === 'clusters') return `${(p?.items?.length ?? 0)} clusters`;
                      if (ev.type === 'ai.usage') {
                        const tag = String(p?.tag || 'ai');
                        const total = Number(p?.total_tokens ?? 0);
                        const model = String(p?.model || '');
                        return `${tag} \u00B7 ${total} tok${model ? ` \u00B7 ${model}` : ''}`;
                      }
                      if (ev.type === 'warn' || ev.type === 'error') return String(p?.message || '').slice(0, 140);
                      if (ev.type === 'message') return String(p?.content || '').slice(0, 140);
                      if (ev.type === 'done') return 'done';
                      return '';
                    })();
                    return (
                      <div key={ev.id} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mono text-[11px] font-semibold text-white/70">{ev.type}</div>
                            {summary ? <div className="mt-1 truncate text-sm text-white/80">{summary}</div> : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[11px] text-white/45 mono">{new Date(ev.created_at).toLocaleTimeString()}</div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="mt-1 h-7 w-7"
                              aria-label="Copy event payload"
                              onClick={async () => {
                                const text = JSON.stringify({ type: ev.type, payload: ev.payload }, null, 2);
                                const ok = await copyToClipboard(text);
                                if (ok) onCopy(`trace.ev.${ev.id}`);
                              }}
                            >
                              <Copy className={cn('h-3.5 w-3.5', copiedKey === `trace.ev.${ev.id}` ? 'text-white/85' : 'text-white/55')} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* ── Fullscreen Modal ────────────────────────────────────────────── */

export function FullscreenModal({
  open,
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
  graphFitSignal,
  drawerTitle,
  drawerEvidence,
  tapeTagsByEvidenceId,
  copiedKey,
  topic,
  onClose,
  onEvidenceViewChange,
  onSelectNode,
  onSelectEdge,
  onFlowFocusNode,
  onFlowFocusEdge,
  onSelectTag,
  onGraphFit,
  onAskAI,
  onOpenEvidence,
  onCopy,
}: {
  open: boolean;
  session: { topic: string; id: string } | null;
  evidenceView: EvidenceView;
  hasWorkspaceGraph: boolean;
  workspaceGraph: { nodes: GraphNode[]; edges: GraphEdge[] };
  timelineData: TimelineItem[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  flowFocusNodeId: string | null;
  flowFocusEdgeId: string | null;
  selectedTag: string | null;
  graphFitSignal: number;
  drawerTitle: string;
  drawerEvidence: EvidenceItem[];
  tapeTagsByEvidenceId: Map<string, string[]>;
  copiedKey: string | null;
  topic: string;
  onClose: () => void;
  onEvidenceViewChange: (v: EvidenceView) => void;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onFlowFocusNode: (id: string | null) => void;
  onFlowFocusEdge: (id: string | null) => void;
  onSelectTag: (tag: string | null) => void;
  onGraphFit: () => void;
  onAskAI: () => void;
  onOpenEvidence: (title: string, evidenceIds: string[]) => void;
  onCopy: (key: string) => void;
}) {
  return (
    <Modal
      open={open}
      title={session ? `Evidence Map: ${session.topic}` : 'Evidence Map'}
      hint="Fullscreen map with pinned inspector. Escape closes."
      onClose={onClose}
      actions={
        <>
          {session && (hasWorkspaceGraph || evidenceView === 'timeline') ? (
            <Tabs
              value={evidenceView}
              onValueChange={(v) => onEvidenceViewChange(v as EvidenceView)}
            >
              <TabsList>
                <TabsTrigger value="graph">Graph</TabsTrigger>
                <TabsTrigger value="mind">Mind</TabsTrigger>
                <TabsTrigger value="flow">Flow</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          {evidenceView === 'graph' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onGraphFit}
              className="border-white/12 bg-white/[0.03]"
              disabled={!hasWorkspaceGraph}
            >
              Fit
            </Button>
          ) : null}
        </>
      }
      className="bg-[#050913]/96"
    >
      <div className="grid h-full gap-4 lg:grid-cols-[1fr_420px]">
        <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-black/25">
          {session && (hasWorkspaceGraph || evidenceView === 'timeline') ? (
            evidenceView === 'timeline' ? (
              <EvidenceTimeline
                items={timelineData}
                selectedTag={selectedTag}
                onSelectTag={onSelectTag}
                onSelectNode={(id) => {
                  onSelectNode(id);
                  onSelectEdge(null);
                }}
                onOpenEvidence={(title, evidenceIds) => onOpenEvidence(title, evidenceIds)}
                viewportClassName="h-[min(62vh,760px)] lg:h-[calc(100vh-220px)]"
                className="h-full rounded-none border-0 bg-transparent"
              />
            ) : evidenceView === 'graph' ? (
              <EvidenceGraph
                nodes={workspaceGraph.nodes}
                edges={workspaceGraph.edges}
                selected={{ nodeId: selectedNodeId, edgeId: selectedEdgeId }}
                onSelectNode={onSelectNode}
                onSelectEdge={onSelectEdge}
                viewportClassName="h-[min(62vh,760px)] lg:h-[calc(100vh-220px)]"
                fitSignal={graphFitSignal}
                className="h-full rounded-none border-0 bg-transparent"
              />
            ) : evidenceView === 'mind' ? (
              <EvidenceMindMap
                topic={session.topic}
                nodes={workspaceGraph.nodes}
                edges={workspaceGraph.edges}
                selected={{ nodeId: selectedNodeId, edgeId: selectedEdgeId }}
                onSelectNode={onSelectNode}
                onSelectEdge={onSelectEdge}
                viewportClassName="h-[min(62vh,760px)] lg:h-[calc(100vh-220px)]"
                className="h-full rounded-none border-0 bg-transparent"
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
                  onSelectNode(id);
                  onSelectEdge(null);
                }}
                viewportClassName="h-[min(62vh,760px)] lg:h-[calc(100vh-220px)]"
                className="h-full rounded-none border-0 bg-transparent"
              />
            )
          ) : (
            <div className="grid h-[min(62vh,760px)] place-items-center text-sm text-white/60">
              Run a topic to generate the map.
            </div>
          )}
        </div>

        <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-white/90">Inspector</div>
              <div className="mt-0.5 text-[11px] text-white/45">Click nodes/edges to load evidence here.</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-white/12 bg-white/[0.03]"
              disabled={!session || !isUuid(session.id) || drawerEvidence.length === 0}
              onClick={onAskAI}
            >
              Ask AI
            </Button>
          </div>
          <div className="h-[calc(100%-56px)] overflow-auto px-5 py-4">
            {drawerEvidence.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
                Nothing selected yet.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-white/70">{drawerTitle}</div>
                {drawerEvidence.map((ev) => (
                  <EvidenceCard
                    key={ev.id}
                    ev={ev}
                    tapeTagsByEvidenceId={tapeTagsByEvidenceId}
                    copiedKey={copiedKey}
                    keyPrefix="fs"
                    onCopy={onCopy}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
