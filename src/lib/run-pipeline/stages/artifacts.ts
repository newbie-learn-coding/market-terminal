import { z } from 'zod';

import type { GraphEdge, GraphNode } from '@/components/terminal/types';
import { chatJson, getAIConfig } from '@/lib/ai';
import { env } from '@/lib/env';
import { coerceTimestampLoose } from '@/lib/pipeline-time';
import { ensureMinimumGraph, enrichEntitiesFromEvidence, enrichGraphFromTapeAndEvidence, enforceLinkCoherence, normalizeNodeTypeByLabel } from '@/lib/run-pipeline/graph-heuristics';
import type { EvidenceItem, StoryCluster, TapeItem } from '@/lib/run-pipeline/contracts';
import { slugId, truncateText } from '@/lib/run-pipeline/utils';
import { buildSignalTerminalArtifactsPrompt, buildSignalTerminalArtifactsRepairPrompt } from '@/prompts/signalTerminalArtifacts';

function normalizeArtifactsPayload(raw: unknown): unknown {
  let value = raw;

  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) break;
      try {
        value = JSON.parse(trimmed);
        continue;
      } catch {
        break;
      }
    }

    if (Array.isArray(value)) {
      if (!value.length) break;
      const first = value[0];
      if (value.length === 1) {
        value = first;
        continue;
      }
      const likely = value.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          ('tape' in (item as Record<string, unknown>) ||
            'nodes' in (item as Record<string, unknown>) ||
            'edges' in (item as Record<string, unknown>) ||
            'clusters' in (item as Record<string, unknown>)),
      );
      if (likely) {
        value = likely;
        continue;
      }
      break;
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;

      if ('items' in obj && Array.isArray(obj.items) && obj.items.length === 1) {
        value = obj.items[0];
        continue;
      }

      const wrapperKeys = ['result', 'results', 'output', 'response', 'data', 'json', 'payload', 'artifact', 'artifacts'];
      let unwrapped = false;
      for (const key of wrapperKeys) {
        const wrapped = obj[key];
        if (wrapped === undefined) continue;
        if (wrapped && (typeof wrapped === 'object' || Array.isArray(wrapped) || typeof wrapped === 'string')) {
          value = wrapped;
          unwrapped = true;
          break;
        }
      }
      if (unwrapped) continue;
    }

    break;
  }

  return value;
}

const ArtifactsPayloadSchema = z.object({
  tape: z.array(
    z.object({
      title: z.string().min(6).max(200),
      source: z.string().min(2).max(120),
      publishedAt: z.preprocess((v) => coerceTimestampLoose(v), z.number().int().nonnegative().optional()),
      tags: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 6) : v), z.array(z.string().min(1).max(40)).max(6)),
      evidenceId: z.string().min(3),
    }),
  ).max(12),
  nodes: z.array(
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
  ).max(26),
  edges: z.array(
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
  ).max(40),
  clusters: z.array(
    z.object({
      title: z.string().min(4).max(64),
      summary: z.string().min(30).max(360),
      momentum: z.preprocess((v) => {
        const raw = typeof v === 'string' ? v.toLowerCase().trim() : '';
        if (raw === 'rising' || raw === 'up' || raw === 'accelerating') return 'rising';
        if (raw === 'fading' || raw === 'down' || raw === 'cooling') return 'fading';
        return 'steady';
      }, z.enum(['rising', 'steady', 'fading'])),
      evidenceIds: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 8) : v), z.array(z.string().min(3)).min(1).max(8)),
      related: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 8) : v), z.array(z.string().min(1).max(80)).max(8)),
    }),
  ).max(6),
  assistantMessage: z.string().min(20).max(420).optional(),
});

const ArtifactsSchema = z.preprocess((v) => normalizeArtifactsPayload(v), ArtifactsPayloadSchema);

export async function buildArtifacts({
  topic,
  evidence,
  mode,
  model,
  apiKey,
  onAiUsage,
}: {
  topic: string;
  evidence: EvidenceItem[];
  mode: 'fast' | 'deep';
  model?: string;
  apiKey?: string;
  onAiUsage?: (u: {
    model: string;
    tag?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }) => void;
}): Promise<{
  tape: TapeItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: StoryCluster[];
  assistantMessage?: string;
  usedAI: boolean;
  fallbackReason?: string;
}> {
  const canUseClientKey = env.ai.allowClientApiKeys;
  const keyOverride = canUseClientKey ? apiKey : undefined;
  const stageModel = env.ai.openrouter.modelArtifacts;
  const config = getAIConfig({ apiKeyOverride: keyOverride, modelOverride: model || stageModel || undefined });
  const startedAt = Date.now();

  if (!config) {
    const baseTape: TapeItem[] = evidence.slice(0, 4).map((ev, idx) => ({
      id: `t${idx + 1}`,
      title: ev.title,
      source: ev.source,
      publishedAt: ev.publishedAt,
      tags: ['news', 'unverified'],
      evidenceId: ev.id,
    }));

    const seeded = ensureMinimumGraph({
      topic,
      evidence,
      nodes: [
        { id: 'n_asset', type: 'asset', label: topic.toUpperCase().slice(0, 8) },
        { id: 'n_source', type: 'source', label: 'Sources' },
      ],
      edges: evidence.slice(0, 2).map((ev, idx) => ({
        id: `e${idx + 1}`,
        from: 'n_source',
        to: 'n_asset',
        type: 'mentions',
        confidence: 0.3,
        evidenceIds: [ev.id],
      })),
    });
    const structured = enrichGraphFromTapeAndEvidence({ topic, evidence, tape: baseTape, nodes: seeded.nodes, edges: seeded.edges });
    const withEntities = enrichEntitiesFromEvidence({ topic, evidence, nodes: structured.nodes, edges: structured.edges });
    const coherent = enforceLinkCoherence({ evidence, nodes: withEntities.nodes, edges: withEntities.edges });

    return {
      usedAI: false,
      fallbackReason: 'no_ai_config',
      assistantMessage: 'No AI key configured. Set OPENROUTER_API_KEY (or enable ALLOW_CLIENT_API_KEYS) to generate live artifacts.',
      tape: baseTape,
      nodes: coherent.nodes,
      edges: coherent.edges,
      clusters: [
        {
          id: 'c1',
          title: 'Needs AI key',
          summary: 'Configure an AI key to generate narratives, map edges, and structured tape items.',
          momentum: 'steady',
          evidenceIds: evidence.slice(0, 2).map((e) => e.id),
          related: [topic.toUpperCase().slice(0, 8)],
        },
      ],
    };
  }

  const promptEvidence = evidence.slice(0, mode === 'fast' ? 8 : 12);
  const excerptLimit = mode === 'fast' ? 220 : 380;
  const evidenceSlim = promptEvidence.map((e) => ({
    id: e.id,
    title: e.title,
    url: e.url,
    source: e.source,
    excerptSource: e.excerptSource || 'serp',
    excerpt: (e.excerpt || '').slice(0, excerptLimit),
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

  const fallbackFromEvidence = (reason: string) => {
    const tape: TapeItem[] = evidence.slice(0, 10).map((ev, idx) => ({
      id: `t${idx + 1}`,
      title: ev.title,
      source: ev.source,
      publishedAt: ev.publishedAt,
      tags: ['serp', 'needs-review'],
      evidenceId: ev.id,
    }));

    const seeded = ensureMinimumGraph({
      topic,
      evidence,
      nodes: [{ id: `n_${slugId(topic) || 'asset'}`, type: 'asset', label: topic.toUpperCase().slice(0, 12) }],
      edges: [],
    });
    const enriched = enrichGraphFromTapeAndEvidence({ topic, evidence, tape, nodes: seeded.nodes, edges: seeded.edges });
    const withEntities = enrichEntitiesFromEvidence({ topic, evidence, nodes: enriched.nodes, edges: enriched.edges });
    const coherent = enforceLinkCoherence({ evidence, nodes: withEntities.nodes, edges: withEntities.edges });

    const clusters: StoryCluster[] = [
      {
        id: 'c1',
        title: 'Fallback artifacts',
        summary: `AI artifact JSON failed validation (${truncateText(reason, 120)}). Showing a structured fallback map from SERP evidence; try Deep mode for richer extraction.`,
        momentum: 'steady',
        evidenceIds: evidence.slice(0, 6).map((e) => e.id),
        related: [truncateText(topic.toUpperCase(), 12)],
      },
    ];

    return {
      usedAI: false,
      fallbackReason: truncateText(reason, 220),
      assistantMessage: 'I hit an output-format issue upstream. I rendered a safe fallback graph; try Deep mode or ask a narrower question.',
      tape,
      nodes: coherent.nodes,
      edges: coherent.edges,
      clusters,
    };
  };

  const artifactsPrompt = buildSignalTerminalArtifactsPrompt({ topic, evidence: evidenceSlim });

  let out: z.infer<typeof ArtifactsSchema>;
  try {
    out = await chatJson({
      config,
      schema: ArtifactsSchema,
      system: artifactsPrompt.system,
      user: artifactsPrompt.user,
      temperature: mode === 'fast' ? 0.1 : 0.25,
      telemetry: { tag: 'artifacts', onUsage: onAiUsage },
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const repairPrompt = buildSignalTerminalArtifactsRepairPrompt({
      baseSystem: artifactsPrompt.system,
      baseUser: artifactsPrompt.user,
      validationErrors: err,
    });
    const likelyFormatIssue = /did not return valid json|json schema mismatch/i.test(err);
    const shouldRetryRepair = mode === 'deep' || likelyFormatIssue;

    if (!shouldRetryRepair) return fallbackFromEvidence(err);

    try {
      out = await chatJson({
        config,
        schema: ArtifactsSchema,
        system: repairPrompt.system,
        user: repairPrompt.user,
        temperature: 0,
        telemetry: { tag: mode === 'fast' ? 'artifacts.repair.fast' : 'artifacts.repair', onUsage: onAiUsage },
      });
    } catch (e2) {
      const err2 = e2 instanceof Error ? e2.message : String(e2);
      return fallbackFromEvidence(err2 || err);
    }
  }

  const evidenceIds = new Set(evidence.map((e) => e.id));
  const evidenceById = new Map<string, EvidenceItem>();
  for (const ev of evidence) evidenceById.set(ev.id, ev);

  const nodes: GraphNode[] = out.nodes.slice(0, 24).map((n) => {
    const normalizedType = normalizeNodeTypeByLabel(n.type, n.label);
    const max = normalizedType === 'asset' ? 14 : normalizedType === 'source' ? 22 : normalizedType === 'event' ? 28 : 20;
    return { ...n, type: normalizedType, label: truncateText(n.label, max) };
  });
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: GraphEdge[] = out.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      ...e,
      evidenceIds: e.evidenceIds.filter((id) => evidenceIds.has(id)).slice(0, 6),
      confidence: Math.max(0, Math.min(1, e.confidence)),
      rationale: typeof e.rationale === 'string' ? truncateText(e.rationale, 160) : undefined,
    }))
    .filter((e) => e.from !== e.to)
    .filter((e) => e.evidenceIds.length > 0)
    .slice(0, 36);

  const tape: TapeItem[] = out.tape
    .filter((t) => evidenceIds.has(t.evidenceId))
    .slice(0, 12)
    .map((t, idx) => ({
      id: `t${idx + 1}`,
      title: t.title,
      source: t.source,
      publishedAt: evidenceById.get(t.evidenceId)?.publishedAt ?? (Number.isFinite(t.publishedAt) ? (t.publishedAt as number) : startedAt),
      tags: t.tags.slice(0, 6),
      evidenceId: t.evidenceId,
    }));

  const clusters: StoryCluster[] = out.clusters.slice(0, 5).map((c, idx) => ({
    id: `c${idx + 1}`,
    title: c.title,
    summary: c.summary,
    momentum: c.momentum,
    evidenceIds: c.evidenceIds.filter((id) => evidenceIds.has(id)).slice(0, 8),
    related: Array.from(new Set(c.related.map((r) => truncateText(r, 12)).filter(Boolean))).slice(0, 8),
  }));

  const seeded = ensureMinimumGraph({ topic, evidence, nodes, edges });
  const enriched = enrichGraphFromTapeAndEvidence({ topic, evidence, tape, nodes: seeded.nodes, edges: seeded.edges });
  const withEntities = enrichEntitiesFromEvidence({ topic, evidence, nodes: enriched.nodes, edges: enriched.edges });
  const coherent = enforceLinkCoherence({ evidence, nodes: withEntities.nodes, edges: withEntities.edges });

  return {
    usedAI: true,
    assistantMessage: out.assistantMessage,
    tape,
    nodes: coherent.nodes,
    edges: coherent.edges,
    clusters,
  };
}
