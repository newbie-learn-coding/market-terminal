import { beforeEach, describe, expect, it, vi } from 'vitest';

const brightDataSerpZone = vi.fn(() => 'serp-zone');
const hasBrightData = vi.fn();
const hasDb = vi.fn();
const getAIConfig = vi.fn();
const createChatCompletion = vi.fn();
const brightDataSerpGoogle = vi.fn();
const probeBrightDataMarkdown = vi.fn();
const probeDb = vi.fn();
const probeDbSchema = vi.fn();

vi.mock('@/lib/env', () => ({
  env: {
    brightdata: {
      token: 'token-123',
      zone: 'unlocker-zone',
    },
    ai: {
      openrouter: { model: 'test-model' },
      allowClientApiKeys: false,
    },
  },
  brightDataSerpZone,
  hasBrightData,
  hasDb,
}));

vi.mock('@/lib/ai', () => ({
  getAIConfig,
  createChatCompletion,
}));

vi.mock('@/lib/brightdata', () => ({
  brightDataSerpGoogle,
  probeBrightDataMarkdown,
}));

vi.mock('@/lib/db', () => ({
  probeDb,
  probeDbSchema,
}));

describe('/api/health GET', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    hasBrightData.mockReturnValue(true);
    hasDb.mockReturnValue(true);
    getAIConfig.mockReturnValue({ model: 'test-model' });
    probeBrightDataMarkdown.mockResolvedValue({ ok: true, latencyMs: 1, bytes: 8 });
    probeDbSchema.mockResolvedValue({ ok: true, latencyMs: 1, missing: [], present: [] });
  });

  it('returns config-only health without active probes', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(new Request('http://localhost/api/health'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.config.brightdata.unlockerZone).toBe('unlocker-zone');
    expect(createChatCompletion).not.toHaveBeenCalled();
  });

  it('returns 503 when any active probe fails', async () => {
    brightDataSerpGoogle.mockResolvedValue([{ url: 'https://example.com', title: 'x' }]);
    createChatCompletion.mockResolvedValue({ content: 'ok' });
    probeDb.mockResolvedValue({ ok: false, latencyMs: 4, error: 'db-down' });
    probeDbSchema.mockResolvedValue({ ok: true, latencyMs: 1, missing: [], present: ['market_signal.sessions'] });
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(new Request('http://localhost/api/health?probe=1'));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.probes.db.ok).toBe(false);
  });

  it('returns 503 when required schema relations are missing', async () => {
    brightDataSerpGoogle.mockResolvedValue([{ url: 'https://example.com', title: 'x' }]);
    createChatCompletion.mockResolvedValue({ content: 'ok' });
    probeDb.mockResolvedValue({ ok: true, latencyMs: 3 });
    probeDbSchema.mockResolvedValue({
      ok: false,
      latencyMs: 2,
      missing: ['market_signal.idx_events_session_id'],
      present: ['market_signal.sessions'],
    });
    const { GET } = await import('@/app/api/health/route');
    const response = await GET(new Request('http://localhost/api/health?probe=1'));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.probes.dbSchema.ok).toBe(false);
    expect(json.probes.dbSchema.missing).toContain('market_signal.idx_events_session_id');
  });
});
