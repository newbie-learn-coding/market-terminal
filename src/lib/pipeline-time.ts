function normalizeEpoch(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (value < 10_000_000_000) return Math.round(value * 1000);
  return Math.round(value);
}

function relativeMs(count: number, unit: string): number {
  if (unit.startsWith('min') || unit.startsWith('minute')) return count * 60_000;
  if (unit.startsWith('hr') || unit.startsWith('hour')) return count * 3_600_000;
  if (unit.startsWith('day')) return count * 86_400_000;
  if (unit.startsWith('week')) return count * 7 * 86_400_000;
  if (unit.startsWith('month')) return count * 30 * 86_400_000;
  if (unit.startsWith('year')) return count * 365 * 86_400_000;
  return 0;
}

export function parsePublishedAtFromSnippet(
  snippet: string | undefined,
  observedAt: number,
): number | null {
  const s = (snippet || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  const rel = lower.match(
    /\b(\d{1,3})\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s*ago\b/,
  );
  if (rel) {
    const count = Number(rel[1]);
    const unit = rel[2] || '';
    if (Number.isFinite(count) && count > 0) {
      const ms = relativeMs(count, unit);
      if (ms > 0) return Math.max(0, observedAt - ms);
    }
  }

  const abs = s.match(
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i,
  );
  if (abs) {
    const ts = Date.parse(abs[0]);
    if (Number.isFinite(ts)) return ts;
  }

  const iso = s.match(/\b(20\d{2}-\d{2}-\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2})?Z?)?\b/);
  if (iso) {
    const ts = Date.parse(iso[0]);
    if (Number.isFinite(ts)) return ts;
  }

  return null;
}

export function coerceTimestampLoose(value: unknown): number | undefined {
  if (value == null) return undefined;

  if (typeof value === 'number') return normalizeEpoch(value);

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return undefined;

    const asNum = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(asNum)) return normalizeEpoch(asNum);

    const asDate = Date.parse(raw);
    if (Number.isFinite(asDate) && asDate > 0) return Math.round(asDate);

    const rel = raw
      .toLowerCase()
      .match(
        /\b(\d{1,3})\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s*ago\b/,
      );
    if (rel) {
      const count = Number(rel[1]);
      const unit = rel[2] || '';
      if (Number.isFinite(count) && count > 0) {
        const ms = relativeMs(count, unit);
        if (ms > 0) return Math.max(0, Date.now() - ms);
      }
    }

    return undefined;
  }

  if (value instanceof Date) return normalizeEpoch(value.getTime());

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidate =
      obj.publishedAt ??
      obj.timestamp ??
      obj.ts ??
      obj.time ??
      obj.unix ??
      obj.epoch ??
      obj.value;

    if (candidate !== undefined) return coerceTimestampLoose(candidate);
  }

  return undefined;
}
