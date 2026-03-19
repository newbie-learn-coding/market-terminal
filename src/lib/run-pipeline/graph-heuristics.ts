import type { GraphEdge, GraphNode } from '@/components/terminal/types';
import type { EvidenceItem, TapeItem } from '@/lib/run-pipeline/contracts';
import { slugId, truncateText } from '@/lib/run-pipeline/utils';

function normalizeEntityCandidate(raw: string) {
  return String(raw || '')
    .replace(/\bU\.S\.\b/g, 'US')
    .replace(/^[^A-Za-z0-9$]+|[^A-Za-z0-9]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoisyEntityCandidate(label: string) {
  const s = String(label || '').toLowerCase().trim();
  if (!s) return true;
  if (/\d{2,}/.test(s)) return true;
  if (/\b(previous close|week range|day range|open interest|market cap|prediction|forecast|price|chart|today)\b/.test(s)) return true;
  if (/\b(falls|rises|surges|drops|waits|climbs|slips|struggles|extends)\b/.test(s)) return true;
  if (/\b(bitcoin|btc|gold|xau|dxy|usd)\b/.test(s)) return true;
  if (/\b(news|analysis|report|reports|update|updates)\b/.test(s) && s.split(/\s+/).length <= 3) return true;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/.test(s)) return true;
  return false;
}

function isNameLikeEntityLabel(label: string) {
  const compact = String(label || '').replace(/…/g, '').trim();
  if (!compact) return false;
  if (isNoisyEntityCandidate(compact)) return false;

  const words = compact.split(/\s+/).filter(Boolean);
  const blacklist = new Set(
    [
      'market', 'crypto', 'cryptos', 'bitcoin', 'gold', 'dollar', 'price', 'analysis', 'forecast', 'update', 'flows',
      'yield', 'yields', 'rates', 'jobs', 'report', 'reports', 'news', 'optimism', 'weakness', 'liquidity',
      'session', 'today', 'trading', 'day', 'cut', 'data', 'despite', 'stunning', 'research', 'team', 'strong',
      'weak', 'fragile', 'structural', 'case', 'first', 'bottom',
    ].map((w) => w.toLowerCase()),
  );
  if (words.some((w) => blacklist.has(w.toLowerCase()))) return false;
  const compactLower = compact.toLowerCase();
  if (compactLower.includes('bitcoin') || compactLower.includes('crypto')) return false;
  if (words.length === 1) return false;

  if (words.length === 2) {
    const w0 = words[0] || '';
    const w1 = words[1] || '';
    return (
      (/^[A-Z][a-z]{2,}$/.test(w0) && /^[A-Z][a-z]{2,}$/.test(w1)) ||
      (/^[A-Z]{2,4}$/.test(w0) && /^[A-Z][a-z]{2,}$/.test(w1))
    );
  }
  if (words.length === 3) {
    const w0 = words[0] || '';
    const w1 = words[1] || '';
    const w2 = words[2] || '';
    return /^[A-Z]{2,4}$/.test(w0) && /^[A-Z][a-z]{2,}$/.test(w1) && /^[A-Z][a-z]{2,}$/.test(w2);
  }

  return false;
}

function canonicalizeActorLabel(label: string) {
  const s = String(label || '').trim();
  const lower = s.toLowerCase();
  if (lower === 'fed' || lower === 'federal reserve') return 'Federal Reserve';
  if (lower === 'treasury' || lower === 'us treasury') return 'US Treasury';
  if (lower === 'sec' || lower === 'securities and exchange commission') return 'SEC';
  if (lower === 'doj' || lower === 'department of justice') return 'DOJ';
  if (lower === 'cftc') return 'CFTC';
  if (lower === 'ecb') return 'ECB';
  if (lower === 'imf') return 'IMF';
  return s;
}

function extractHeuristicEntities(text: string): string[] {
  const source = String(text || '')
    .replace(/\bU\.S\.\b/g, 'US')
    .replace(/[|()[\]{}]/g, ' ');
  if (!source.trim()) return [];

  const candidates: string[] = [];
  const pushMatches = (regex: RegExp) => {
    const matches = source.match(regex) || [];
    for (const match of matches) candidates.push(match);
  };

  pushMatches(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g);
  pushMatches(/\b[A-Z][a-z]+[A-Z][A-Za-z]+\b/g);
  pushMatches(/\b(?:SEC|Fed|Federal Reserve|US Treasury|Treasury|JPMorgan|BlackRock|Coinbase|Binance|MicroStrategy|Grayscale|Glassnode|ECB|IMF|CFTC|DOJ)\b/gi);

  const stopWords = new Set(
    [
      'today', 'latest', 'news', 'analysis', 'update', 'market', 'markets', 'price', 'prices', 'crypto',
      'cryptocurrency', 'bitcoin', 'gold', 'dollar', 'index', 'futures', 'etf', 'etfs', 'forecast', 'outlook',
      'traders', 'investors', 'session',
    ].map((w) => w.toLowerCase()),
  );

  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    const cleaned = normalizeEntityCandidate(raw);
    if (!cleaned) continue;
    if (cleaned.length < 3 || cleaned.length > 40) continue;
    if (isNoisyEntityCandidate(cleaned)) continue;
    if (!isNameLikeEntityLabel(cleaned)) continue;
    if (cleaned.includes('.') || cleaned.includes('/')) continue;
    if (/^\d+$/.test(cleaned)) continue;

    const words = cleaned.split(/\s+/).map((w) => w.toLowerCase());
    if (!words.length) continue;
    if (words.every((w) => stopWords.has(w))) continue;
    if (words.length === 1 && words[0] && stopWords.has(words[0])) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }

  return out.slice(0, 10);
}

function looksLikeDomainLabel(label: string) {
  const s = String(label || '').trim().toLowerCase();
  if (!s) return false;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\.[a-z]{2,})?$/.test(s);
}

export function normalizeNodeTypeByLabel(type: GraphNode['type'], label: string): GraphNode['type'] {
  const raw = String(label || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return type;

  if (type === 'entity' && looksLikeDomainLabel(raw)) return 'source';

  if (type === 'source') {
    if (looksLikeDomainLabel(raw)) return 'source';
    if (
      /\b(federal reserve|us treasury|treasury|sec|cftc|doj|ecb|imf|jpmorgan|blackrock|coinbase|binance|microstrategy|grayscale|michael saylor|elon musk)\b/.test(
        lower,
      )
    ) {
      return 'entity';
    }
  }

  return type;
}

function extractKeywordActors(text: string): string[] {
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return [];

  const out = new Set<string>();
  if (/\b(fed|federal reserve|fomc)\b/.test(s)) out.add('Federal Reserve');
  if (/\b(sec|securities and exchange commission)\b/.test(s)) out.add('SEC');
  if (/\b(us treasury|treasury)\b/.test(s)) out.add('US Treasury');
  if (/\b(cftc)\b/.test(s)) out.add('CFTC');
  if (/\b(doj|department of justice)\b/.test(s)) out.add('DOJ');
  if (/\b(ecb)\b/.test(s)) out.add('ECB');
  if (/\b(imf)\b/.test(s)) out.add('IMF');
  if (/\b(blackrock|ibit)\b/.test(s)) out.add('BlackRock');
  if (/\b(grayscale|gbtc)\b/.test(s)) out.add('Grayscale');
  if (/\b(binance)\b/.test(s)) out.add('Binance');
  if (/\b(coinbase)\b/.test(s)) out.add('Coinbase');
  if (/\b(jpmorgan)\b/.test(s)) out.add('JPMorgan');
  if (/\b(microstrategy|mstr)\b/.test(s)) out.add('MicroStrategy');

  return Array.from(out).slice(0, 6);
}

export function ensureMinimumGraph({
  topic,
  evidence,
  nodes,
  edges,
}: {
  topic: string;
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const evidenceIds = evidence.map((e) => e.id);
  const seedEvidenceId = evidenceIds[0];
  if (!seedEvidenceId) return { nodes, edges };

  const outNodes: GraphNode[] = [...nodes];
  const outEdges: GraphEdge[] = edges.filter((e) => e.from !== e.to);
  const ids = new Set(outNodes.map((n) => n.id));
  const edgeIds = new Set(outEdges.map((e) => e.id));

  const firstSourceLabel = evidence.find((e) => e.source)?.source || 'Sources';
  const sourceId = `n_${slugId(firstSourceLabel) || 'source'}`;
  if (!outNodes.some((n) => n.type === 'source')) {
    const id = ids.has(sourceId) ? 'n_source' : sourceId;
    if (!ids.has(id)) {
      outNodes.push({ id, type: 'source', label: firstSourceLabel.slice(0, 24) });
      ids.add(id);
    }
  }

  const topicLabel = topic.trim() ? topic.trim() : 'Asset';
  const assetId = `n_${slugId(topicLabel) || 'asset'}`;
  if (!outNodes.some((n) => n.type === 'asset')) {
    const id = ids.has(assetId) ? 'n_asset' : assetId;
    if (!ids.has(id)) {
      outNodes.push({ id, type: 'asset', label: topicLabel.toUpperCase().slice(0, 12) });
      ids.add(id);
    }
  }

  if (outEdges.length === 0) {
    const src = outNodes.find((n) => n.type === 'source')?.id;
    const asset = outNodes.find((n) => n.type === 'asset')?.id;
    if (src && asset && src !== asset) {
      let id = 'e_seed';
      let i = 1;
      while (edgeIds.has(id) && i < 20) {
        id = `e_seed_${i}`;
        i += 1;
      }
      outEdges.push({
        id,
        from: src,
        to: asset,
        type: 'mentions',
        confidence: 0.25,
        evidenceIds: [seedEvidenceId],
      });
    }
  }

  return { nodes: outNodes.slice(0, 26), edges: outEdges.slice(0, 40) };
}

export function enrichGraphFromTapeAndEvidence({
  topic,
  evidence,
  tape,
  nodes,
  edges,
}: {
  topic: string;
  evidence: EvidenceItem[];
  tape: TapeItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const MAX_NODES = 26;
  const MAX_EDGES = 40;
  const outNodes: GraphNode[] = [...nodes];
  const outEdges: GraphEdge[] = edges.filter((e) => e.from !== e.to);
  const nodeIds = new Set(outNodes.map((n) => n.id));
  const edgeIds = new Set(outEdges.map((e) => e.id));
  const keyToNodeId = new Map<string, string>();

  for (const n of outNodes) keyToNodeId.set(`${n.type}|${n.label.toLowerCase()}`, n.id);

  const evidenceById = new Map<string, EvidenceItem>();
  for (const ev of evidence) evidenceById.set(ev.id, ev);

  const ensureNode = (id: string, type: GraphNode['type'], label: string): string | null => {
    const safeLabel = truncateText(label, 32) || 'Unknown';
    const key = `${type}|${safeLabel.toLowerCase()}`;
    const existing = keyToNodeId.get(key);
    if (existing) return existing;

    let nextId = id.slice(0, 40);
    if (!nextId) nextId = `n_${slugId(`${type}_${safeLabel}`)}`.slice(0, 40);
    if (nodeIds.has(nextId)) {
      let i = 1;
      while (i < 30 && nodeIds.has(`${nextId}_${i}`)) i += 1;
      nextId = `${nextId}_${i}`.slice(0, 40);
    }

    if (outNodes.length >= MAX_NODES) return null;
    outNodes.push({ id: nextId, type, label: safeLabel });
    nodeIds.add(nextId);
    keyToNodeId.set(key, nextId);
    return nextId;
  };

  const ensureEdge = (edge: Omit<GraphEdge, 'id'> & { id: string }) => {
    if (edge.from === edge.to) return;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return;
    const evidenceIds = Array.from(new Set(edge.evidenceIds)).slice(0, 6);
    if (!evidenceIds.length) return;

    let id = edge.id.slice(0, 40);
    if (!id) id = `e_${slugId(`${edge.from}_${edge.to}_${edge.type}`)}`.slice(0, 40);
    if (edgeIds.has(id)) {
      let i = 1;
      while (i < 30 && edgeIds.has(`${id}_${i}`)) i += 1;
      id = `${id}_${i}`.slice(0, 40);
    }

    if (outEdges.length >= MAX_EDGES) return;
    outEdges.push({
      id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      confidence: Math.max(0, Math.min(1, edge.confidence)),
      evidenceIds,
    });
    edgeIds.add(id);
  };

  const assetNodeId =
    outNodes.find((n) => n.type === 'asset')?.id ||
    ensureNode(`n_${slugId(topic) || 'asset'}`, 'asset', topic.toUpperCase().slice(0, 12)) ||
    outNodes[0]?.id ||
    null;

  const domains = Array.from(new Set(evidence.map((e) => e.source).filter(Boolean))).slice(0, 6);
  for (const d of domains) {
    if (outNodes.length >= MAX_NODES) break;
    ensureNode(`n_src_${slugId(d) || 'source'}`, 'source', d);
  }

  const existingEventCount = outNodes.filter((n) => n.type === 'event').length;
  const targetEvents = Math.min(6, Math.max(4, Math.min(6, tape.length)));
  if (existingEventCount < targetEvents) {
    for (const t of tape) {
      if (outNodes.length >= MAX_NODES || outEdges.length >= MAX_EDGES) break;
      const ev = evidenceById.get(t.evidenceId);
      if (!ev || !assetNodeId) continue;

      const sourceLabel = ev.source || t.source || 'source';
      const srcId = ensureNode(`n_src_${slugId(sourceLabel) || 'source'}`, 'source', sourceLabel);
      const evtId = ensureNode(`n_evt_${t.id}`, 'event', t.title);
      if (!srcId || !evtId) continue;

      ensureEdge({
        id: `e_src_${t.id}`,
        from: srcId,
        to: evtId,
        type: 'mentions',
        confidence: 0.58,
        evidenceIds: [t.evidenceId],
      });
      ensureEdge({
        id: `e_evt_${t.id}`,
        from: evtId,
        to: assetNodeId,
        type: 'hypothesis',
        confidence: 0.42,
        evidenceIds: [t.evidenceId],
      });

      const nowEvents = outNodes.filter((n) => n.type === 'event').length;
      if (nowEvents >= targetEvents) break;
    }
  }

  const degrees = new Map<string, number>();
  for (const n of outNodes) degrees.set(n.id, 0);
  for (const e of outEdges) {
    degrees.set(e.from, (degrees.get(e.from) ?? 0) + 1);
    degrees.set(e.to, (degrees.get(e.to) ?? 0) + 1);
  }

  const evidenceForSource = (sourceLabel: string) => {
    const key = sourceLabel.toLowerCase();
    return evidence.find((ev) => (ev.source || '').toLowerCase() === key) || evidence[0] || null;
  };

  for (const n of outNodes) {
    if ((degrees.get(n.id) ?? 0) > 0) continue;
    if (!assetNodeId || n.id === assetNodeId || outEdges.length >= MAX_EDGES) continue;

    const ev = n.type === 'source' ? evidenceForSource(n.label) : evidence[0] || null;
    if (!ev) continue;

    if (n.type === 'source') {
      ensureEdge({ id: `e_iso_${slugId(n.id)}`, from: n.id, to: assetNodeId, type: 'mentions', confidence: 0.22, evidenceIds: [ev.id] });
    } else if (n.type === 'event') {
      ensureEdge({ id: `e_iso_${slugId(n.id)}`, from: n.id, to: assetNodeId, type: 'hypothesis', confidence: 0.18, evidenceIds: [ev.id] });
    } else {
      ensureEdge({ id: `e_iso_${slugId(n.id)}`, from: n.id, to: assetNodeId, type: 'same_story', confidence: 0.16, evidenceIds: [ev.id] });
    }

    degrees.set(n.id, 1);
    degrees.set(assetNodeId, (degrees.get(assetNodeId) ?? 0) + 1);
  }

  return { nodes: outNodes.slice(0, MAX_NODES), edges: outEdges.slice(0, MAX_EDGES) };
}

export function enrichEntitiesFromEvidence({
  topic,
  evidence,
  nodes,
  edges,
}: {
  topic: string;
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const MAX_NODES = 26;
  const MAX_EDGES = 40;
  const outNodes: GraphNode[] = [...nodes];
  const outEdges: GraphEdge[] = edges.filter((e) => e.from !== e.to);
  const nodeIds = new Set(outNodes.map((n) => n.id));
  const edgeIds = new Set(outEdges.map((e) => e.id));
  const labelKey = new Set(outNodes.map((n) => `${n.type}|${n.label.toLowerCase()}`));
  const edgeKey = new Set(outEdges.map((e) => `${e.from}|${e.to}|${e.type}`));

  const topicLower = topic.trim().toLowerCase();
  const banned = new Set([topicLower, 'bitcoin', 'btc', 'gold', 'xau', 'usd', 'dxy', 'sp500', 's&p 500', 's&p500'].map((s) => s.trim()).filter(Boolean));

  const assetId = outNodes.find((n) => n.type === 'asset')?.id || outNodes[0]?.id || null;
  if (!assetId) return { nodes: outNodes, edges: outEdges };

  const candidates = new Map<string, { score: number; evidenceIds: Set<string> }>();
  for (const ev of evidence) {
    const textBlob = `${ev.title}\n${truncateText(ev.excerpt || '', 300)}`;
    const aiEntities = ev.aiSummary?.entities || [];
    const heuristicEntities = extractHeuristicEntities(textBlob);
    const keywordActors = extractKeywordActors(textBlob);
    const ents = Array.from(new Set([...aiEntities, ...heuristicEntities, ...keywordActors]));

    for (const raw of ents) {
      const cleaned = String(raw || '').replace(/^[#@]+/, '').replace(/\s+/g, ' ').trim();
      if (!cleaned) continue;
      const canonical = canonicalizeActorLabel(cleaned);
      if (canonical.length < 2 || canonical.length > 36) continue;
      if (isNoisyEntityCandidate(canonical)) continue;
      if (banned.has(canonical.toLowerCase())) continue;

      const entry = candidates.get(canonical) || { score: 0, evidenceIds: new Set<string>() };
      entry.score += aiEntities.includes(raw) ? 1.2 : keywordActors.includes(raw) ? 1.0 : 0.8;
      entry.evidenceIds.add(ev.id);
      candidates.set(canonical, entry);
    }
  }

  const ranked = Array.from(candidates.entries()).sort((a, b) => b[1].score - a[1].score).slice(0, 6);

  const ensureNode = (id: string, type: GraphNode['type'], label: string) => {
    const safeLabel = truncateText(label, 24) || 'Unknown';
    const key = `${type}|${safeLabel.toLowerCase()}`;
    if (labelKey.has(key)) return outNodes.find((n) => `${n.type}|${n.label.toLowerCase()}` === key)?.id || null;

    let nextId = id.slice(0, 40);
    if (!nextId) nextId = `n_${slugId(`${type}_${safeLabel}`)}`.slice(0, 40);
    if (nodeIds.has(nextId)) {
      let i = 1;
      while (i < 30 && nodeIds.has(`${nextId}_${i}`)) i += 1;
      nextId = `${nextId}_${i}`.slice(0, 40);
    }

    if (outNodes.length >= MAX_NODES) return null;
    outNodes.push({ id: nextId, type, label: safeLabel });
    nodeIds.add(nextId);
    labelKey.add(key);
    return nextId;
  };

  const ensureEdge = (edge: Omit<GraphEdge, 'id'> & { id: string }) => {
    if (edge.from === edge.to) return;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return;
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    if (edgeKey.has(key)) return;
    const evidenceIds = Array.from(new Set(edge.evidenceIds)).slice(0, 6);
    if (!evidenceIds.length) return;

    let id = edge.id.slice(0, 40);
    if (edgeIds.has(id)) {
      let i = 1;
      while (i < 30 && edgeIds.has(`${id}_${i}`)) i += 1;
      id = `${id}_${i}`.slice(0, 40);
    }

    if (outEdges.length >= MAX_EDGES) return;
    outEdges.push({ ...edge, id, evidenceIds });
    edgeIds.add(id);
    edgeKey.add(key);
  };

  for (const [label, meta] of ranked) {
    if (outNodes.length >= MAX_NODES || outEdges.length >= MAX_EDGES) break;

    const isTicker = /^\$?[A-Z]{2,6}$/.test(label) && label.toUpperCase() === label.replace(/^\$/, '');
    const cleanLabel = label.replace(/^\$/, '').trim();
    const type: GraphNode['type'] = isTicker ? 'asset' : 'entity';
    const nodeLabel = isTicker ? cleanLabel.toUpperCase() : cleanLabel;
    const nodeId = ensureNode(`n_${slugId(nodeLabel)}`, type, nodeLabel);
    if (!nodeId) continue;
    const eids = Array.from(meta.evidenceIds).slice(0, 3);
    ensureEdge({
      id: `e_ent_${slugId(`${assetId}_${nodeId}`)}`,
      from: assetId,
      to: nodeId,
      type: isTicker ? 'co_moves' : 'same_story',
      confidence: isTicker ? 0.32 : 0.28,
      evidenceIds: eids,
      rationale: isTicker ? 'Mentioned as related asset/spillover.' : 'Mentioned as a key actor/entity in evidence.',
    });
  }

  return { nodes: outNodes.slice(0, MAX_NODES), edges: outEdges.slice(0, MAX_EDGES) };
}

export function enforceLinkCoherence({
  evidence,
  nodes,
  edges,
}: {
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const MAX_EDGES = 40;
  const outNodes = nodes.slice(0, 26);
  const outEdges = edges.filter((e) => e.from !== e.to).slice(0, MAX_EDGES);

  const nodeById = new Map<string, GraphNode>();
  for (const n of outNodes) nodeById.set(n.id, n);
  const sourceNodes = outNodes.filter((n) => n.type === 'source');
  const eventNodes = outNodes.filter((n) => n.type === 'event');
  const assetNode = outNodes.find((n) => n.type === 'asset') || null;
  if (!assetNode || !sourceNodes.length || !eventNodes.length) return { nodes: outNodes, edges: outEdges };

  const evidenceById = new Map<string, EvidenceItem>();
  for (const ev of evidence) evidenceById.set(ev.id, ev);

  const edgeIds = new Set(outEdges.map((e) => e.id));
  const edgeKeys = new Set(outEdges.map((e) => `${e.from}|${e.to}|${e.type}`));

  const normalizedDomain = (raw: string) =>
    String(raw || '').trim().toLowerCase().replace(/^www\./, '');

  const sourceIdByDomain = new Map<string, string>();
  for (const s of sourceNodes) sourceIdByDomain.set(normalizedDomain(s.label), s.id);

  const eventEdgeEvidenceIds = (eventId: string) => {
    const ids = new Set<string>();
    for (const e of outEdges) {
      if (e.from === eventId || e.to === eventId) {
        for (const evId of e.evidenceIds || []) ids.add(evId);
      }
    }
    return Array.from(ids);
  };

  const hasLinkBetweenTypes = (eventId: string, targetType: GraphNode['type']) =>
    outEdges.some((e) => {
      if (e.from !== eventId && e.to !== eventId) return false;
      const otherId = e.from === eventId ? e.to : e.from;
      return nodeById.get(otherId)?.type === targetType;
    });

  const pickEvidenceForSource = (sourceLabel: string) => {
    const key = normalizedDomain(sourceLabel);
    return evidence.find((ev) => normalizedDomain(ev.source) === key)?.id || evidence[0]?.id || null;
  };

  const sourceForEvidenceId = (evidenceId: string | null) => {
    if (!evidenceId) return sourceNodes[0]?.id || null;
    const ev = evidenceById.get(evidenceId);
    if (!ev) return sourceNodes[0]?.id || null;
    return (
      sourceIdByDomain.get(normalizedDomain(ev.source)) ||
      sourceNodes.find((s) => normalizedDomain(s.label) === normalizedDomain(ev.source))?.id ||
      sourceNodes[0]?.id ||
      null
    );
  };

  const addEdge = ({
    from,
    to,
    type,
    confidence,
    evidenceIds,
    rationale,
  }: {
    from: string;
    to: string;
    type: GraphEdge['type'];
    confidence: number;
    evidenceIds: string[];
    rationale: string;
  }) => {
    if (!nodeById.has(from) || !nodeById.has(to)) return;
    if (from === to || outEdges.length >= MAX_EDGES) return;
    const uniqueEvidence = Array.from(new Set(evidenceIds)).filter(Boolean).slice(0, 4);
    const finalEvidence = uniqueEvidence.length ? uniqueEvidence : evidence[0]?.id ? [evidence[0].id] : [];
    if (!finalEvidence.length) return;

    const directKey = `${from}|${to}|${type}`;
    const reverseKey = `${to}|${from}|${type}`;
    if (edgeKeys.has(directKey) || edgeKeys.has(reverseKey)) return;

    let id = `e_coh_${slugId(`${from}_${to}_${type}`)}`.slice(0, 40);
    if (edgeIds.has(id)) {
      let i = 1;
      while (i < 30 && edgeIds.has(`${id}_${i}`)) i += 1;
      id = `${id}_${i}`.slice(0, 40);
    }

    outEdges.push({
      id,
      from,
      to,
      type,
      confidence: Math.max(0, Math.min(1, confidence)),
      evidenceIds: finalEvidence,
      rationale,
    });
    edgeIds.add(id);
    edgeKeys.add(directKey);
  };

  for (const evt of eventNodes) {
    const eids = eventEdgeEvidenceIds(evt.id);
    const seedEvidenceId = eids[0] || evidence[0]?.id || null;

    if (!hasLinkBetweenTypes(evt.id, 'source')) {
      const srcId = sourceForEvidenceId(seedEvidenceId);
      if (srcId) {
        addEdge({
          from: srcId,
          to: evt.id,
          type: 'mentions',
          confidence: 0.24,
          evidenceIds: seedEvidenceId ? [seedEvidenceId] : [],
          rationale: 'Coherence: source linked to event by cited evidence.',
        });
      }
    }

    if (!hasLinkBetweenTypes(evt.id, 'asset')) {
      addEdge({
        from: evt.id,
        to: assetNode.id,
        type: 'hypothesis',
        confidence: 0.2,
        evidenceIds: seedEvidenceId ? [seedEvidenceId] : [],
        rationale: 'Coherence: event connected to primary asset context.',
      });
    }
  }

  for (const src of sourceNodes) {
    const hasAny = outEdges.some((e) => e.from === src.id || e.to === src.id);
    if (hasAny) continue;

    const evId = pickEvidenceForSource(src.label);
    const targetEventId =
      sourceForEvidenceId(evId) === src.id
        ? eventNodes.find((evt) => {
            const ids = eventEdgeEvidenceIds(evt.id);
            return !ids.length || ids.includes(String(evId || ''));
          })?.id
        : eventNodes[0]?.id;

    if (targetEventId) {
      addEdge({
        from: src.id,
        to: targetEventId,
        type: 'mentions',
        confidence: 0.2,
        evidenceIds: evId ? [evId] : [],
        rationale: 'Coherence: orphan source attached to nearest event.',
      });
    } else {
      addEdge({
        from: src.id,
        to: assetNode.id,
        type: 'mentions',
        confidence: 0.16,
        evidenceIds: evId ? [evId] : [],
        rationale: 'Coherence: orphan source attached to primary asset.',
      });
    }
  }

  return { nodes: outNodes, edges: outEdges.slice(0, MAX_EDGES) };
}
