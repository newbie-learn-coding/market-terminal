import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasBrightData = vi.fn();
const hasDb = vi.fn();
const getAIConfig = vi.fn();
const chatJson = vi.fn();
const createSession = vi.fn();
const updateStep = vi.fn();
const updateStatus = vi.fn();
const insertEvent = vi.fn();
const selectStageModel = vi.fn();
const runSearchStage = vi.fn();
const buildEvidenceHybrid = vi.fn();
const summarizeEvidence = vi.fn();

vi.mock('@/lib/env', () => ({
  env: {
    ai: {
      allowClientApiKeys: false,
      openrouter: {
        modelPlan: '',
        modelSummaries: '',
        modelArtifacts: '',
      },
    },
  },
  hasBrightData,
  hasDb,
}));

vi.mock('@/lib/ai', () => ({
  getAIConfig,
  chatJson,
}));

vi.mock('@/lib/db', () => ({
  createSession,
  updateStep,
  updateStatus,
  insertEvent,
}));

vi.mock('@/lib/modelRouting', () => ({
  selectStageModel,
}));

vi.mock('@/lib/run-pipeline/stages/search', () => ({
  runSearchStage,
}));

vi.mock('@/lib/run-pipeline/stages/evidence', () => ({
  buildEvidenceHybrid,
  summarizeEvidence,
}));

async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const eventLine = chunk.split('\n').find((line) => line.startsWith('event: '));
      const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
      return {
        event: eventLine?.replace('event: ', '') || '',
        data: dataLine ? JSON.parse(dataLine.replace('data: ', '')) : null,
      };
    });
}

describe('/api/run POST', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    hasBrightData.mockReturnValue(false);
    hasDb.mockReturnValue(false);
    getAIConfig.mockReturnValue(null);
    selectStageModel.mockReturnValue(undefined);
    runSearchStage.mockResolvedValue([]);
    buildEvidenceHybrid.mockResolvedValue([]);
    summarizeEvidence.mockImplementation(async ({ evidence }: { evidence: unknown[] }) => evidence);
    createSession.mockResolvedValue(undefined);
    updateStep.mockResolvedValue(undefined);
    updateStatus.mockResolvedValue(undefined);
    insertEvent.mockResolvedValue(undefined);
  });

  it('returns 400 for invalid request bodies', async () => {
    const { POST } = await import('@/app/api/run/route');
    const response = await POST(
      new Request('http://localhost/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Invalid request body');
  });

  it('emits a fallback-ready SSE run when providers are unavailable', async () => {
    const { POST } = await import('@/app/api/run/route');
    const response = await POST(
      new Request('http://localhost/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: 'Bitcoin', mode: 'fast' }),
      }),
    );

    expect(response.status).toBe(200);
    const events = await readSseEvents(response);
    const eventNames = events.map((item) => item.event);

    expect(eventNames).toContain('session');
    expect(eventNames).toContain('plan');
    expect(eventNames).toContain('search');
    expect(eventNames).toContain('artifacts.fallback');
    expect(eventNames).toContain('perf.summary');
    expect(eventNames).toContain('done');
    expect(eventNames.indexOf('perf.summary')).toBeLessThan(eventNames.indexOf('done'));
  });

  it('emits perf.summary before error on pipeline failure', async () => {
    hasBrightData.mockReturnValue(true);
    runSearchStage.mockRejectedValueOnce(new Error('search exploded'));

    const { POST } = await import('@/app/api/run/route');
    const response = await POST(
      new Request('http://localhost/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: 'Gold', mode: 'fast' }),
      }),
    );

    const events = await readSseEvents(response);
    const eventNames = events.map((item) => item.event);

    expect(eventNames).toContain('perf.summary');
    expect(eventNames).toContain('error');
    expect(eventNames.indexOf('perf.summary')).toBeLessThan(eventNames.indexOf('error'));
  });
});
