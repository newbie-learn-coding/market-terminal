import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasDb = vi.fn();
const listSessionsPage = vi.fn();

vi.mock('@/lib/db', () => ({
  hasDb,
  listSessionsPage,
}));

describe('/api/sessions GET', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns additive pageInfo with cursor pagination', async () => {
    hasDb.mockReturnValue(true);
    listSessionsPage.mockResolvedValue({
      items: [
        {
          sessionId: 's_1',
          topic: 'Bitcoin',
          status: 'ready',
          step: 'ready',
          progress: 1,
          meta: { mode: 'deep', artifacts: { evidence: [], tape: [], nodes: [], edges: [], clusters: [] } },
          published: false,
          slug: null,
          assetKey: 'bitcoin',
          _creationTime: Date.UTC(2026, 2, 18),
        },
      ],
      nextCursor: 'cursor-2',
      hasMore: true,
    });

    const { GET } = await import('@/app/api/sessions/route');
    const response = await GET(new Request('http://localhost/api/sessions?limit=1&cursor=cursor-1'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(listSessionsPage).toHaveBeenCalledWith({
      limit: 1,
      q: undefined,
      status: undefined,
      cursor: 'cursor-1',
    });
    expect(json.pageInfo).toEqual({ nextCursor: 'cursor-2', hasMore: true });
    expect(json.sessions).toHaveLength(1);
  });

  it('returns 400 when database is unavailable', async () => {
    hasDb.mockReturnValue(false);

    const { GET } = await import('@/app/api/sessions/route');
    const response = await GET(new Request('http://localhost/api/sessions'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Database not configured' });
  });
});
