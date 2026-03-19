type ValueEntry = {
  expiresAt: number;
  value: unknown;
};

const valueCache = new Map<string, ValueEntry>();
const inflightCache = new Map<string, Promise<unknown>>();

export function buildCacheKey(parts: unknown[]): string {
  return parts
    .map((part) => {
      if (part == null) return '';
      if (typeof part === 'string') return part;
      return JSON.stringify(part);
    })
    .join('::');
}

export async function getOrComputeCached<T>({
  key,
  ttlMs,
  loader,
}: {
  key: string;
  ttlMs: number;
  loader: () => Promise<T>;
}): Promise<T> {
  const now = Date.now();
  const cached = valueCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const inflight = inflightCache.get(key);
  if (inflight) return inflight as Promise<T>;

  const promise = loader()
    .then((value) => {
      if (ttlMs > 0) {
        valueCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })
    .finally(() => {
      inflightCache.delete(key);
    });

  inflightCache.set(key, promise);
  return promise;
}

export function clearServerCaches() {
  valueCache.clear();
  inflightCache.clear();
}
