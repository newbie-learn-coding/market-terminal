import { afterEach, describe, expect, it, vi } from 'vitest';

import { coerceTimestampLoose, parsePublishedAtFromSnippet } from '@/lib/pipeline-time';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pipeline time helpers', () => {
  it('parses relative SERP snippets against the observed timestamp', () => {
    const observedAt = Date.UTC(2026, 2, 18, 12, 0, 0);

    expect(parsePublishedAtFromSnippet('2 hours ago - macro headline', observedAt)).toBe(
      Date.UTC(2026, 2, 18, 10, 0, 0),
    );
  });

  it('parses absolute dates from snippets', () => {
    expect(parsePublishedAtFromSnippet('Mar 7, 2026 - policy update', Date.now())).toBe(
      Date.parse('Mar 7, 2026'),
    );
  });

  it('coerces nested timestamp objects and epoch seconds', () => {
    expect(coerceTimestampLoose({ publishedAt: { unix: 1_710_000_000 } })).toBe(1_710_000_000_000);
  });

  it('coerces relative strings using the current clock', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 2, 18, 12, 0, 0));

    expect(coerceTimestampLoose('3 days ago')).toBe(Date.UTC(2026, 2, 15, 12, 0, 0));
  });
});
