import { z } from 'zod';

import { hasBrightData, hasDb } from '@/lib/env';
import { type SerpResult } from '@/lib/brightdata';
import { createSession, updateStep as dbUpdateStep, updateStatus, insertEvent } from '@/lib/db';
import { createLogger } from '@/lib/log';
import { selectStageModel } from '@/lib/modelRouting';
import { EvidenceItemsWithScrapeMeta, PerfMark, PipelineStep, RunRequestSchema } from '@/lib/run-pipeline/contracts';
import { buildEvidenceHybrid, summarizeEvidence } from '@/lib/run-pipeline/stages/evidence';
import { buildArtifacts } from '@/lib/run-pipeline/stages/artifacts';
import { expandGraphImpact } from '@/lib/run-pipeline/stages/impact';
import { planQueries } from '@/lib/run-pipeline/stages/plan';
import { runSearchStage } from '@/lib/run-pipeline/stages/search';
import { domainFromUrl, extractOutputPreviewFromReason, filterStaleEvidence, pickSerpDiverse, safeErrorText, truncateText } from '@/lib/run-pipeline/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Orchestrates the end-to-end run and streams incremental SSE updates to the frontend.
  const reqId = crypto.randomUUID();
  const startedAt = Date.now();
  const log = createLogger({ reqId, route: '/api/run' });

  let body: z.infer<typeof RunRequestSchema>;
  try {
    body = RunRequestSchema.parse(await request.json());
  } catch {
    log.warn('run.bad_request', { ms: Date.now() - startedAt });
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const sessionId = crypto.randomUUID();
  const provider = 'openrouter' as const;
  const signal = request.signal;
  const serpFormat = body.serpFormat || 'light';

  log.info('run.request', {
    sessionId,
    topic: body.topic.slice(0, 120),
    mode: body.mode,
    provider,
    serpFormat,
    hasBrightData: hasBrightData(),
    hasDb: hasDb(),
  });

  const dbReady = hasDb();

  if (dbReady) {
    try {
      await createSession(
        sessionId,
        body.topic,
        'running',
        'plan',
        0.05,
        { mode: body.mode, provider, model: body.model || null },
      );
      log.info('run.db.session_inserted', { sessionId });
    } catch {
      // ignore; still stream
      log.warn('run.db.session_insert_failed', { sessionId });
    }
  }

  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const persistEvent = (type: string, payload: unknown) => {
        if (!dbReady) return;
        void insertEvent(sessionId, type, payload)
          .catch((e) => log.debug('run.db.event_insert_failed', { sessionId, type, error: String(e) }));
      };

      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        persistEvent(event, data);
      };

      const diag = (stage: string, details: Record<string, unknown> = {}) => {
        const payload = { stage, ts: Date.now(), ...details };
        send('diag', payload);
        log.info('run.diag', { sessionId, ...payload });
      };

      const emitAiUsage = (u: {
        model: string;
        tag?: string;
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }) => {
        // Keep it safe for storage: no prompt content, just counters.
        const payload = {
          model: u.model,
          tag: u.tag || 'ai',
          prompt_tokens: u.prompt_tokens ?? 0,
          completion_tokens: u.completion_tokens ?? 0,
          total_tokens: u.total_tokens ?? 0,
        };
        send('ai.usage', payload);
        log.info('run.ai.usage', { sessionId, ...payload });
      };

      const updateSession = async (step: PipelineStep, progress: number, meta?: Record<string, unknown>) => {
        if (!dbReady) return;
        try {
          await dbUpdateStep(sessionId, step, progress, meta);
        } catch {
          // ignore
        }
      };

      // Lightweight run-level telemetry:
      // - emits granular `perf.mark` events into session_events
      // - emits one `perf.summary` at the end
      // This is intentionally temporary/simple so we can diagnose bottlenecks quickly.
      const perfMarks: PerfMark[] = [];
      const stepDurationsMs: Partial<Record<PipelineStep, number>> = {};
      const apiTotals = new Map<string, { count: number; ms: number; failures: number }>();
      let activeStep: { step: PipelineStep; startedAt: number } | null = null;

      const recordPerfMark = (mark: PerfMark) => {
        perfMarks.push(mark);
        if (perfMarks.length > 800) perfMarks.shift();

        if (mark.phase === 'api') {
          const prev = apiTotals.get(mark.name) || { count: 0, ms: 0, failures: 0 };
          prev.count += 1;
          prev.ms += mark.ms;
          if (!mark.ok) prev.failures += 1;
          apiTotals.set(mark.name, prev);
        }

        send('perf.mark', mark);
      };

      // Wrap any awaited task (API or stage) and capture elapsed time + failure state.
      const timed = async <T>(
        phase: PerfMark['phase'],
        name: string,
        details: Record<string, unknown>,
        fn: () => Promise<T>,
      ): Promise<T> => {
        const markStartedAt = Date.now();
        try {
          const out = await fn();
          recordPerfMark({
            phase,
            name,
            startedAt: markStartedAt,
            endedAt: Date.now(),
            ms: Date.now() - markStartedAt,
            ok: true,
            details,
          });
          return out;
        } catch (e) {
          recordPerfMark({
            phase,
            name,
            startedAt: markStartedAt,
            endedAt: Date.now(),
            ms: Date.now() - markStartedAt,
            ok: false,
            details: { ...details, error: safeErrorText(e) },
          });
          throw e;
        }
      };

      // Step tracker:
      // We close the previous step when a new one starts, so `stepDurationsMs`
      // reflects time spent "between step transitions" (what the UI shows as step bars).
      const emitStep = async (step: PipelineStep, progress: number, meta?: Record<string, unknown>) => {
        const nowTs = Date.now();
        if (activeStep) {
          const elapsed = Math.max(0, nowTs - activeStep.startedAt);
          stepDurationsMs[activeStep.step] = (stepDurationsMs[activeStep.step] || 0) + elapsed;
          recordPerfMark({
            phase: 'step',
            name: activeStep.step,
            startedAt: activeStep.startedAt,
            endedAt: nowTs,
            ms: elapsed,
            ok: true,
            details: { nextStep: step },
          });
        }

        activeStep = { step, startedAt: nowTs };
        await updateSession(step, progress, meta);
        send('step', { step, progress });
      };

      const finalizePerfSummary = (status: 'ready' | 'error') => {
        const endedAt = Date.now();
        if (activeStep) {
          const elapsed = Math.max(0, endedAt - activeStep.startedAt);
          stepDurationsMs[activeStep.step] = (stepDurationsMs[activeStep.step] || 0) + elapsed;
          recordPerfMark({
            phase: 'step',
            name: activeStep.step,
            startedAt: activeStep.startedAt,
            endedAt,
            ms: elapsed,
            ok: true,
            details: { terminalState: status },
          });
          activeStep = null;
        }

        const api = Array.from(apiTotals.entries())
          .map(([name, data]) => ({
            name,
            calls: data.count,
            totalMs: data.ms,
            avgMs: data.count ? Math.round(data.ms / data.count) : 0,
            failures: data.failures,
          }))
          .sort((a, b) => b.totalMs - a.totalMs);

        return {
          status,
          generatedAt: endedAt,
          totalMs: Math.max(0, endedAt - startedAt),
          stepDurationsMs,
          api,
          marksStored: perfMarks.length,
        };
      };

      send('session', {
        sessionId,
        topic: body.topic,
        startedAt,
        mode: body.mode,
        provider,
        hasBrightData: hasBrightData(),
        hasDb: hasDb(),
      });
      diag('run.init', {
        topic: truncateText(body.topic, 120),
        mode: body.mode,
        provider,
        serpFormat,
        hasBrightData: hasBrightData(),
      });

      try {
        await emitStep('plan', 0.08);

        const planModel = selectStageModel({
          stage: 'plan',
          mode: body.mode,
          requestedModel: body.model,
        });
        diag('plan.model', { model: planModel || 'default' });

        const plan = await timed('api', 'ai.plan', { provider, mode: body.mode, model: planModel || 'default' }, () =>
          planQueries({
            topic: body.topic,
            question: body.question,
            model: planModel,
            apiKey: body.apiKey,
            onAiUsage: emitAiUsage,
          }),
        );
        if (!plan.usedAI && plan.reason) {
          const outputPreview = extractOutputPreviewFromReason(plan.reason);
          send('warn', {
            message: `Plan model returned invalid JSON; using deterministic fallback queries. (${truncateText(plan.reason, 160)})`,
          });
          send('plan.fallback', { reason: plan.reason, model: planModel || 'default', outputPreview });
          log.warn('run.plan.fallback', { sessionId, reason: plan.reason, model: planModel || 'default', outputPreview });
        }
        log.info('run.plan', { sessionId, usedAI: plan.usedAI, reason: plan.reason || null, queries: plan.queries.length });
        send('plan', plan);
        await emitStep('search', 0.18, { mode: body.mode, provider, model: body.model || null, plan });

        const queries = plan.queries.slice(0, body.mode === 'deep' ? 6 : 4);
        let serp: SerpResult[] = [];
        const serpResponseFormat =
          serpFormat === 'full'
            ? 'full_json_google'
            : serpFormat === 'markdown'
              ? 'markdown'
              : 'light_json_google';

        if (hasBrightData()) {
          serp = await timed(
            'stage',
            'search.run',
            { queries: queries.length, mode: body.mode, format: serpResponseFormat },
            () =>
              runSearchStage({
                queries,
                mode: body.mode,
                serpResponseFormat,
                signal,
                onDiag: (stage, details = {}) => diag(stage, details),
                onWarn: (payload) => {
                  if (payload.query) {
                    log.warn('run.search.query_failed', {
                      sessionId,
                      query: payload.query.slice(0, 160),
                      message: payload.message.slice(0, 320),
                    });
                  }
                  send('warn', payload);
                },
                onPartial: (payload) => send('search.partial', payload),
              }),
          );

          log.info('run.search', { sessionId, queries: queries.length, serp: serp.length });
        } else {
          send('warn', { message: 'BRIGHTDATA_API_TOKEN is not set. Search/scrape steps will be limited.' });
          log.warn('run.search.no_brightdata', { sessionId, queries: queries.length });
        }

        if (!serp.length) {
          send('warn', { message: 'No SERP results collected. Check Bright Data zones/tokens, then re-run.' });
        }

        const picked = pickSerpDiverse(serp, body.mode === 'deep' ? 14 : 12);
        const pickedDomains = Array.from(new Set(picked.map((r) => domainFromUrl(r.url)))).slice(0, 14);
        log.info('run.search.picked', { sessionId, picked: picked.length, domains: pickedDomains });
        send('search', { queries, results: picked });
        if (body.mode === 'deep') {
          await emitStep('scrape', 0.34);
        } else {
          await updateSession('extract', 0.34);
        }

        let evidence = await timed('stage', 'evidence.build', { mode: body.mode, picked: picked.length }, () =>
          buildEvidenceHybrid({
            results: picked,
            startedAt,
            mode: body.mode,
            signal,
            onScrape: body.mode === 'deep' ? (evt) => send('scrape.page', evt) : undefined,
            onScrapeTiming:
              body.mode === 'deep'
                ? (evt) =>
                    recordPerfMark({
                      phase: 'api',
                      name: 'brightdata.markdown',
                      startedAt: Date.now() - evt.ms,
                      endedAt: Date.now(),
                      ms: evt.ms,
                      ok: evt.ok,
                      details: { url: truncateText(evt.url, 220), domain: domainFromUrl(evt.url) },
                    })
                : undefined,
          }),
        );
        const scrapeMeta = (evidence as EvidenceItemsWithScrapeMeta)._scrape;
        diag('evidence.built', {
          mode: body.mode,
          evidence: evidence.length,
          scrapeAttempted: scrapeMeta?.attempted || 0,
          scrapeFailures: scrapeMeta?.failures || 0,
          scrapeConcurrency: scrapeMeta?.concurrency || 0,
        });
        if (body.mode === 'deep' && scrapeMeta?.attempted) {
          if ((scrapeMeta.failures || 0) > 0) {
            send('warn', {
              message: `Deep scrape: ${scrapeMeta.failures}/${scrapeMeta.attempted} pages failed; using SERP excerpts where needed.`,
            });
          }
          diag('scrape.summary', {
            attempted: scrapeMeta.attempted || 0,
            failures: scrapeMeta.failures || 0,
            concurrency: scrapeMeta.concurrency || 0,
            firstFailure: scrapeMeta.firstFailure ? truncateText(scrapeMeta.firstFailure, 160) : null,
          });
        }

        const maxAgeDays = body.mode === 'deep' ? 60 : 180;
        const filtered = filterStaleEvidence(evidence, startedAt, maxAgeDays);
        if (filtered.dropped > 0 && filtered.keep.length >= Math.min(8, evidence.length)) {
          evidence = filtered.keep;
          send('warn', { message: `Filtered ${filtered.dropped} stale results older than ~${maxAgeDays}d.` });
        }

        let evidenceWithSummaries = evidence;
        if (body.mode === 'deep') {
          const summariesModel = selectStageModel({
            stage: 'summaries',
            mode: body.mode,
            requestedModel: body.model,
          });
          evidenceWithSummaries = await timed(
            'api',
            'ai.summaries',
            { provider, evidence: evidence.length, model: summariesModel || 'default' },
            () =>
            summarizeEvidence({
              topic: body.topic,
              evidence,
              model: summariesModel,
              apiKey: body.apiKey,
              onAiUsage: emitAiUsage,
            }),
          );
          send('summaries', {
            items: evidenceWithSummaries
              .filter((e) => Boolean(e.aiSummary?.bullets?.length))
              .map((e) => ({ id: e.id, ...e.aiSummary })),
          });
          diag('summaries.done', {
            model: summariesModel || 'default',
            withSummaries: evidenceWithSummaries.filter((e) => Boolean(e.aiSummary?.bullets?.length)).length,
          });
        }

        const evidenceSources = Array.from(new Set(evidenceWithSummaries.map((e) => e.source))).slice(0, 14);
        log.info('run.evidence', { sessionId, items: evidenceWithSummaries.length, mode: body.mode, sources: evidenceSources });
        send('evidence', { items: evidenceWithSummaries });
        await emitStep('extract', 0.55);

        await emitStep('link', 0.72);

        const artifactsModel = selectStageModel({
          stage: 'artifacts',
          mode: body.mode,
          requestedModel: body.model,
        });

        const artifacts = await timed(
          'api',
          'ai.artifacts',
          { provider, evidence: evidenceWithSummaries.length, model: artifactsModel || 'default' },
          () =>
          buildArtifacts({
            topic: body.topic,
            evidence: evidenceWithSummaries,
            mode: body.mode,
            model: artifactsModel,
            apiKey: body.apiKey,
            onAiUsage: emitAiUsage,
          }),
        );
        if (!artifacts.usedAI) {
          const reasonFull = artifacts.fallbackReason || 'model JSON/format issue';
          const reason = truncateText(reasonFull, 180);
          const outputPreview = extractOutputPreviewFromReason(reasonFull);
          send('warn', { message: `Artifact generation used fallback map output (${reason}).` });
          send('artifacts.fallback', { mode: body.mode, provider, model: artifactsModel || 'default', reason: reasonFull, outputPreview });
          diag('artifacts.fallback', {
            mode: body.mode,
            provider,
            model: artifactsModel || 'default',
            reason: truncateText(reasonFull, 220),
            outputPreview,
          });
        }
        const nodeTypes = artifacts.nodes.reduce<Record<string, number>>((acc, n) => {
          acc[n.type] = (acc[n.type] || 0) + 1;
          return acc;
        }, {});
        log.info('run.artifacts', {
          sessionId,
          usedAI: artifacts.usedAI,
          tape: artifacts.tape.length,
          nodes: artifacts.nodes.length,
          edges: artifacts.edges.length,
          clusters: artifacts.clusters.length,
          nodeTypes,
        });

        // Stream the first map immediately after linking so the UI feels live.
        send('tape', { items: artifacts.tape });
        send('graph', { nodes: artifacts.nodes, edges: artifacts.edges, variant: 'initial' });

        let finalNodes = artifacts.nodes;
        let finalEdges = artifacts.edges;

        if (body.mode === 'deep') {
          const expanded = await timed(
            'api',
            'ai.impact',
            { provider, mode: body.mode, model: artifactsModel || 'default' },
            () =>
            expandGraphImpact({
              topic: body.topic,
              question: body.question,
              evidence: evidenceWithSummaries,
              nodes: artifacts.nodes,
              edges: artifacts.edges,
              model: artifactsModel,
              apiKey: body.apiKey,
              onAiUsage: emitAiUsage,
            }),
          );

          if (expanded && (expanded.nodes.length !== artifacts.nodes.length || expanded.edges.length !== artifacts.edges.length)) {
            finalNodes = expanded.nodes;
            finalEdges = expanded.edges;
            send('graph', { nodes: finalNodes, edges: finalEdges, variant: 'expanded' });
            diag('impact.expanded', { nodes: finalNodes.length, edges: finalEdges.length });
          } else {
            diag('impact.no_change', { nodes: artifacts.nodes.length, edges: artifacts.edges.length });
          }
        }

        await emitStep('cluster', 0.86);

        send('clusters', { items: artifacts.clusters });
        await emitStep('render', 0.94);
        if (artifacts.assistantMessage) send('message', { role: 'assistant', content: artifacts.assistantMessage });

        const readyMeta = {
          mode: body.mode,
          provider,
          model: body.model || null,
          plan,
          selectedUrls: picked.slice(0, 10).map((r) => r.url),
          artifacts: {
            evidence: evidenceWithSummaries,
            tape: artifacts.tape,
            nodes: finalNodes,
            edges: finalEdges,
            clusters: artifacts.clusters,
            price: null,
            videos: null,
          },
        };
        await emitStep('ready', 1, readyMeta);

        if (dbReady) {
          await updateStatus(sessionId, 'ready').catch(() => {});
        }

        const perfSummary = finalizePerfSummary('ready');
        send('perf.summary', perfSummary);
        await updateSession('ready', 1, { ...readyMeta, perf: perfSummary });

        send('done', { sessionId });
        diag('run.complete', { totalMs: perfSummary.totalMs, status: 'ready' });
        log.info('run.done', { sessionId, ms: Date.now() - startedAt, perf: perfSummary });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        const perfSummary = finalizePerfSummary('error');
        send('perf.summary', perfSummary);
        send('error', { message: msg });
        diag('run.error', { message: truncateText(msg, 220), totalMs: perfSummary.totalMs });
        log.error('run.error', { sessionId, message: msg, ms: Date.now() - startedAt, perf: perfSummary });
        if (dbReady) {
          await updateStatus(sessionId, 'error').catch(() => {});
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}
