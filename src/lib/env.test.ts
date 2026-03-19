import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function loadEnvModule(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return import('@/lib/env');
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('env helpers', () => {
  it('prefers the dedicated SERP zone when configured', async () => {
    const mod = await loadEnvModule({
      BRIGHTDATA_API_TOKEN: 'token-1',
      BRIGHTDATA_WEB_UNLOCKER_ZONE: 'unlocker-zone',
      BRIGHTDATA_SERP_ZONE: 'serp-zone',
    });

    expect(mod.hasBrightData()).toBe(true);
    expect(mod.brightDataSerpZone()).toBe('serp-zone');
  });

  it('falls back to the unlocker zone when no SERP zone exists', async () => {
    const mod = await loadEnvModule({
      BRIGHTDATA_API_TOKEN: 'token-1',
      BRIGHTDATA_WEB_UNLOCKER_ZONE: 'unlocker-zone',
      BRIGHTDATA_SERP_ZONE: undefined,
    });

    expect(mod.hasBrightData()).toBe(true);
    expect(mod.brightDataSerpZone()).toBe('unlocker-zone');
  });

  it('reports Bright Data as missing without both token and zone', async () => {
    const mod = await loadEnvModule({
      BRIGHTDATA_API_TOKEN: undefined,
      BRIGHTDATA_WEB_UNLOCKER_ZONE: undefined,
    });

    expect(mod.hasBrightData()).toBe(false);
  });
});
