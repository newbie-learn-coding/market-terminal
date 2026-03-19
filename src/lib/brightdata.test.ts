import { describe, expect, it } from 'vitest';

import { parseSerpJson, parseSerpMarkdown } from '@/lib/brightdata';

describe('Bright Data parsers', () => {
  it('extracts linked markdown search results', () => {
    const markdown = `
1. [Bitcoin sinks on Fed surprise](https://example.com/a) - Reuters says risk assets slipped
2. [Gold catches a bid](https://example.com/b)
   Haven demand picked up after CPI
`;

    expect(parseSerpMarkdown(markdown)).toEqual([
      {
        title: 'Bitcoin sinks on Fed surprise',
        url: 'https://example.com/a',
        snippet: 'Reuters says risk assets slipped',
      },
      {
        title: 'Gold catches a bid',
        url: 'https://example.com/b',
        snippet: 'Haven demand picked up after CPI',
      },
    ]);
  });

  it('parses structured organic results', () => {
    const parsed = parseSerpJson({
      organic_results: [
        { title: 'Headline', link: 'https://example.com/story', snippet: 'Summary' },
      ],
    });

    expect(parsed).toEqual([
      { title: 'Headline', url: 'https://example.com/story', snippet: 'Summary' },
    ]);
  });

  it('falls back to deep extraction for unusual provider shapes', () => {
    const parsed = parseSerpJson({
      blocks: [
        {
          nested: {
            href: 'https://example.com/deep',
            name: 'Deep result',
            summary: 'Recovered from nested structure',
          },
        },
      ],
    });

    expect(parsed).toEqual([
      {
        title: 'Deep result',
        url: 'https://example.com/deep',
        snippet: 'Recovered from nested structure',
      },
    ]);
  });
});
