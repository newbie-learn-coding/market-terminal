import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasDb = vi.fn();
const getSession = vi.fn();
const insertEvent = vi.fn();
const insertEventBatch = vi.fn();
const getAIConfig = vi.fn();
const createChatCompletion = vi.fn();

vi.mock('@/lib/db', () => ({
  hasDb,
  getSession,
  insertEvent,
  insertEventBatch,
}));

vi.mock('@/lib/ai', () => ({
  getAIConfig,
  createChatCompletion,
}));

describe('/api/chat POST', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    hasDb.mockReturnValue(true);
    getAIConfig.mockReturnValue({ model: 'test-model' });
    insertEvent.mockResolvedValue(undefined);
    insertEventBatch.mockResolvedValue(undefined);
  });

  it('returns 400 for invalid bodies', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 when session does not exist', async () => {
    getSession.mockResolvedValue(null);

    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: '8d0e2f3d-a338-46a8-bfdc-a626751f6e5f',
          message: 'What happened?',
        }),
      }),
    );

    expect(response.status).toBe(404);
  });

  it('returns 502 when the AI provider fails', async () => {
    getSession.mockResolvedValue({
      sessionId: '8d0e2f3d-a338-46a8-bfdc-a626751f6e5f',
      topic: 'Bitcoin',
      meta: { mode: 'deep', artifacts: { evidence: [], tape: [], nodes: [], edges: [], clusters: [] } },
    });
    createChatCompletion.mockRejectedValue(new Error('provider down'));

    const { POST } = await import('@/app/api/chat/route');
    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: '8d0e2f3d-a338-46a8-bfdc-a626751f6e5f',
          message: 'What happened?',
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toContain('Chat model request failed');
  });
});
