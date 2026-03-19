import { z } from 'zod';

import type { GraphEdge, GraphNode } from '@/components/terminal/types';
import { chatJson, getAIConfig } from '@/lib/ai';
import { env } from '@/lib/env';
import { ensureMinimumGraph, enrichEntitiesFromEvidence, enrichGraphFromTapeAndEvidence, enforceLinkCoherence, normalizeNodeTypeByLabel } from '@/lib/run-pipeline/graph-heuristics';
import type { EvidenceItem } from '@/lib/run-pipeline/contracts';
import { truncateText } from '@/lib/run-pipeline/utils';
import { buildSignalTerminalImpactPrompt } from '@/prompts/signalTerminalImpact';

const GraphExpansionSchema = z.object({
  addNodes: z.array(
    z.object({
      id: z.string().min(2).max(40),
      type: z.preprocess((v) => {
        const raw = typeof v === 'string' ? v.toLowerCase().trim() : '';
        if (raw === 'asset' || raw === 'ticker' || raw === 'symbol') return 'asset';
        if (raw === 'event' || raw === 'headline' || raw === 'catalyst') return 'event';
        if (raw === 'source' || raw === 'publisher' || raw === 'site') return 'source';
        if (raw === 'entity' || raw === 'person' || raw === 'org' || raw === 'organization') return 'entity';
        return 'entity';
      }, z.enum(['asset', 'event', 'entity', 'source'])),
      label: z.string().min(1).max(80),
    }),
  ).max(10),
  addEdges: z.array(
    z.object({
      id: z.string().min(2).max(40),
      from: z.string().min(2).max(40),
      to: z.string().min(2).max(40),
      type: z.preprocess((v) => {
        const raw = typeof v === 'string' ? v.toLowerCase().trim() : '';
        if (raw === 'mentions' || raw === 'cites' || raw === 'source') return 'mentions';
        if (raw === 'co_moves' || raw === 'correlates' || raw === 'correlation') return 'co_moves';
        if (raw === 'same_story' || raw === 'related' || raw === 'linked') return 'same_story';
        if (raw === 'hypothesis' || raw === 'impact' || raw === 'causes') return 'hypothesis';
        return 'hypothesis';
      }, z.enum(['mentions', 'co_moves', 'hypothesis', 'same_story'])),
      confidence: z.number().min(0).max(1),
      evidenceIds: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 6) : v), z.array(z.string().min(3)).max(6)),
      rationale: z.string().min(6).max(180).optional(),
    }),
  ).max(16),
});

function shouldExpandImpact({
  topic,
  question,
  evidence,
  nodes,
  edges,
}: {
  topic: string;
  question?: string;
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const densityLow = nodes.length < 12 || edges.length < 10;
  const hay = [
    topic,
    question || '',
    ...evidence.map((e) =>
      [
        e.title,
        e.source,
        e.excerpt || '',
        (e.aiSummary?.entities || []).join(' '),
        (e.aiSummary?.catalysts || []).join(' '),
      ].join(' '),
    ),
  ]
    .join('\n')
    .toLowerCase();

  const macroSignal = /(gold|xau|dxy|dollar|rates?|yield|treasury|cpi|inflation|etf|oil|wti|brent|miners?|mstr|microstrategy|nasdaq|equities?|spx|s\\&p)/.test(hay);
  if (!macroSignal && !densityLow) return false;

  const assetCount = nodes.filter((n) => n.type === 'asset').length;
  const crossCount = edges.filter((e) => e.type === 'co_moves' || e.type === 'hypothesis').length;
  if (macroSignal && (assetCount < 2 || crossCount < 2)) return true;
  return densityLow;
}

export async function expandGraphImpact({
  topic,
  question,
  evidence,
  nodes,
  edges,
  model,
  apiKey,
  onAiUsage,
}: {
  topic: string;
  question?: string;
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  model?: string;
  apiKey?: string;
  onAiUsage?: (u: {
    model: string;
    tag?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }) => void;
}): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] } | null> {
  if (!shouldExpandImpact({ topic, question, evidence, nodes, edges })) return null;

  const canUseClientKey = env.ai.allowClientApiKeys;
  const keyOverride = canUseClientKey ? apiKey : undefined;
  const stageModel = env.ai.openrouter.modelArtifacts;
  const config = getAIConfig({ apiKeyOverride: keyOverride, modelOverride: model || stageModel || undefined });
  if (!config) return null;

  const evidenceCompact = evidence.slice(0, 12).map((e) => ({
    id: e.id,
    title: e.title,
    source: e.source,
    excerpt: truncateText(e.excerpt || '', 240),
    aiSummary: e.aiSummary
      ? {
          bullets: e.aiSummary.bullets.slice(0, 4),
          entities: (e.aiSummary.entities || []).slice(0, 10),
          catalysts: (e.aiSummary.catalysts || []).slice(0, 8),
          sentiment: e.aiSummary.sentiment,
          confidence: e.aiSummary.confidence,
        }
      : undefined,
  }));

  const impactPrompt = buildSignalTerminalImpactPrompt({
    topic,
    question,
    existingGraph: { nodes: nodes.slice(0, 26), edges: edges.slice(0, 40) },
    evidence: evidenceCompact,
  });

  let out: z.infer<typeof GraphExpansionSchema>;
  try {
    out = await chatJson({
      config,
      schema: GraphExpansionSchema,
      system: impactPrompt.system,
      user: impactPrompt.user,
      temperature: 0.15,
      telemetry: { tag: 'impact', onUsage: onAiUsage },
    });
  } catch {
    return null;
  }

  const evidenceIds = new Set(evidence.map((e) => e.id));
  const mergedNodes: GraphNode[] = [...nodes];
  const nodeIds = new Set(mergedNodes.map((n) => n.id));

  for (const n of out.addNodes) {
    if (mergedNodes.length >= 26) break;
    if (!n?.id || nodeIds.has(n.id)) continue;
    const normalizedType = normalizeNodeTypeByLabel(n.type, n.label);
    mergedNodes.push({ id: n.id, type: normalizedType, label: truncateText(n.label, 32) });
    nodeIds.add(n.id);
  }

  const mergedEdges: GraphEdge[] = [...edges];
  const edgeIds = new Set(mergedEdges.map((e) => e.id));
  const edgeKeys = new Set(mergedEdges.map((e) => `${e.from}|${e.to}|${e.type}`));

  for (const e of out.addEdges) {
    if (mergedEdges.length >= 40) break;
    if (!e?.id || edgeIds.has(e.id)) continue;
    if (e.from === e.to) continue;
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    const key = `${e.from}|${e.to}|${e.type}`;
    if (edgeKeys.has(key)) continue;
    const eids = Array.from(new Set(e.evidenceIds)).filter((id) => evidenceIds.has(id)).slice(0, 6);
    if (!eids.length) continue;

    mergedEdges.push({
      id: e.id,
      from: e.from,
      to: e.to,
      type: e.type,
      confidence: Math.max(0, Math.min(1, e.confidence)),
      evidenceIds: eids,
      rationale: typeof e.rationale === 'string' ? truncateText(e.rationale, 160) : undefined,
    });
    edgeIds.add(e.id);
    edgeKeys.add(key);
  }

  const seeded = ensureMinimumGraph({ topic, evidence, nodes: mergedNodes, edges: mergedEdges });
  const connected = enrichGraphFromTapeAndEvidence({ topic, evidence, tape: [], nodes: seeded.nodes, edges: seeded.edges });
  const withEntities = enrichEntitiesFromEvidence({ topic, evidence, nodes: connected.nodes, edges: connected.edges });
  return enforceLinkCoherence({ evidence, nodes: withEntities.nodes, edges: withEntities.edges });
}
