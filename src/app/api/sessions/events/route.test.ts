import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasDb = vi.fn();
const getSession = vi.fn();
const listEventsPage = vi.fn();

vi.mock('@/lib/db', () => ({
  hasDb,
  getSession,
  listEventsPage,
}));

describe('/api/sessions/events GET', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns cursor-based event pages', async () => {
    hasDb.mockReturnValue(true);
    getSession.mockResolvedValue({
      sessionId: '8d0e2f3d-a338-46a8-bfdc-a626751f6e5f',
      topic: 'Bitcoin',
      status: 'ready',
      step: 'ready',
      progress: 1,
      meta: {},
      _creationTime: Date.UTC(2026, 2, 18),
    });
    listEventsPage.mockResolvedValue({
      items: [
        {
          id: 11,
          sessionId: '8d0e2f3d-a338-46a8-bfdc-a626751f6e5f',
          type: 'step',
          payload: { step: 'ready' },
          created_at: new Date(Date.UTC(2026, 2, 18)).toISOString(),
        },
      ],
      nextCursor: 'cursor-12',
      hasMore: true,
    });

    const { GET } = await import('@/app/api/sessions/events/route');
    const response = await GET(
      new Request(
        'http://localhost/api/sessions/events?sessionId=8d0e2f3d-a338-46a8-bfdc-a626751f6e5f&limit=1&cursor=cursor-11',
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(listEventsPage).toHaveBeenCalledWith({
      sessionId: '8d0e2f3d-a338-46a8-bfdc-a626751f6e5f',
      limit: 1,
      cursor: 'cursor-11',
    });
    expect(json.pageInfo).toEqual({ nextCursor: 'cursor-12', hasMore: true });
    expect(json.events).toHaveLength(1);
  });

  it('returns 404 when the session is missing', async () => {
    hasDb.mockReturnValue(true);
    getSession.mockResolvedValue(null);

    const { GET } = await import('@/app/api/sessions/events/route');
    const response = await GET(
      new Request('http://localhost/api/sessions/events?sessionId=8d0e2f3d-a338-46a8-bfdc-a626751f6e5f'),
    );

    expect(response.status).toBe(404);
  });
});
