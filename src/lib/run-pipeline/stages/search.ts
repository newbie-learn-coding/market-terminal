import { brightDataSerpGoogle, type SerpResult } from '@/lib/brightdata';
import { parseStatusFromBrightDataErrorMessage, pickSerpDiverse, truncateText } from '@/lib/run-pipeline/utils';

export async function runSearchStage({
  queries,
  mode,
  serpResponseFormat,
  signal,
  onDiag,
  onWarn,
  onPartial,
}: {
  queries: string[];
  mode: 'fast' | 'deep';
  serpResponseFormat: 'light_json_google' | 'full_json_google' | 'markdown';
  signal: AbortSignal;
  onDiag: (stage: string, details?: Record<string, unknown>) => void;
  onWarn: (payload: { message: string; query?: string }) => void;
  onPartial: (payload: { query: string; added: number; found: number; picked: SerpResult[]; vertical: 'web' | 'news' }) => void;
}): Promise<SerpResult[]> {
  let serp: SerpResult[] = [];
  const searchVertical: 'web' | 'news' = mode === 'deep' ? 'news' : 'web';
  const searchRecency: 'd' | 'w' = mode === 'deep' ? 'd' : 'w';
  const maxConcurrency = mode === 'deep' ? 3 : 4;
  let queryCursor = 0;

  onDiag('search.config', {
    queries: queries.length,
    maxConcurrency,
    vertical: searchVertical,
    recency: searchRecency,
    format: serpResponseFormat,
  });

  const runQuery = async (query: string) => {
    const queryStartedAt = Date.now();
    onDiag('search.query.start', { query: truncateText(query, 120), vertical: searchVertical, recency: searchRecency });
    try {
      const results = await brightDataSerpGoogle({
        query,
        format: serpResponseFormat,
        vertical: searchVertical,
        recency: searchRecency,
      });

      let finalResults = results;
      let finalVertical: 'web' | 'news' = searchVertical;
      if (mode === 'deep' && finalVertical === 'news' && finalResults.length === 0) {
        try {
          onDiag('search.query.fallback.start', { query: truncateText(query, 120), fromVertical: 'news', toVertical: 'web' });
          const fallback = await brightDataSerpGoogle({
            query,
            format: serpResponseFormat,
            vertical: 'web',
            recency: 'd',
          });
          if (fallback.length) {
            finalResults = fallback;
            finalVertical = 'web';
            onDiag('search.query.fallback.hit', { query: truncateText(query, 120), fallbackResults: fallback.length });
          }
        } catch {
          onDiag('search.query.fallback.failed', { query: truncateText(query, 120) });
        }
      }

      serp = serp.concat(finalResults);
      const partialPicked = pickSerpDiverse(serp, mode === 'deep' ? 14 : 12).map((r) => ({
        title: r.title || r.url,
        url: r.url,
        snippet: r.snippet,
      }));
      onPartial({
        query,
        added: finalResults.length,
        found: serp.length,
        picked: partialPicked,
        vertical: finalVertical,
      });
      onDiag('search.query.done', {
        query: truncateText(query, 120),
        vertical: finalVertical,
        added: finalResults.length,
        cumulative: serp.length,
        ms: Date.now() - queryStartedAt,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const status = parseStatusFromBrightDataErrorMessage(message);
      const statusLabel = status ? ` (${status})` : '';
      onWarn({ message: `Search query failed${statusLabel}; continuing with partial results.`, query });
      onDiag('search.query.failed', {
        query: truncateText(query, 120),
        status: status || null,
        message: truncateText(message, 220),
        ms: Date.now() - queryStartedAt,
      });
    }
  };

  const workers = Array.from({ length: Math.min(maxConcurrency, queries.length) }, async () => {
    while (true) {
      if (signal.aborted) throw new Error('aborted');
      const idx = queryCursor;
      queryCursor += 1;
      if (idx >= queries.length) return;
      const query = queries[idx];
      if (!query) return;
      await runQuery(query);
    }
  });

  await Promise.all(workers);
  return serp;
}
