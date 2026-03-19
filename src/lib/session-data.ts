import type { GraphEdge, GraphNode } from '@/components/terminal/types';
import type { EvidenceItem, StoryCluster, TapeItem } from '@/lib/types';

export type JsonRecord = Record<string, unknown>;

export type SessionArtifacts = {
  evidence?: EvidenceItem[];
  tape?: TapeItem[];
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  clusters?: StoryCluster[];
  price?: unknown;
  videos?: unknown;
};

export type SessionMeta = JsonRecord & {
  mode?: 'fast' | 'deep';
  provider?: string;
  model?: string;
  plan?: {
    queries?: string[];
    angles?: string[];
  };
  selectedUrls?: string[];
  artifacts?: SessionArtifacts;
  perf?: unknown;
};

export function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonRecord;
}

export function asSessionMeta(value: unknown): SessionMeta {
  return asRecord(value) as SessionMeta;
}

export function asSessionArtifacts(value: unknown): SessionArtifacts {
  return asRecord(value) as SessionArtifacts;
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function evidenceItems(value: unknown): EvidenceItem[] {
  return Array.isArray(value) ? (value as EvidenceItem[]) : [];
}

export function tapeItems(value: unknown): TapeItem[] {
  return Array.isArray(value) ? (value as TapeItem[]) : [];
}

export function graphNodes(value: unknown): GraphNode[] {
  return Array.isArray(value) ? (value as GraphNode[]) : [];
}

export function graphEdges(value: unknown): GraphEdge[] {
  return Array.isArray(value) ? (value as GraphEdge[]) : [];
}

export function storyClusters(value: unknown): StoryCluster[] {
  return Array.isArray(value) ? (value as StoryCluster[]) : [];
}

export function countOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function getArtifacts(meta: unknown): SessionArtifacts {
  return asSessionArtifacts(asSessionMeta(meta).artifacts);
}

export function firstEvidenceSentiment(meta: unknown): string | null {
  const evidence = evidenceItems(getArtifacts(meta).evidence);
  for (const item of evidence) {
    if (item.aiSummary?.sentiment) return item.aiSummary.sentiment;
  }
  return null;
}
