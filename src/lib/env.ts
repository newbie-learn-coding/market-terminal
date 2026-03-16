function envString(name: string, fallback = ''): string {
  const v = process.env[name];
  return typeof v === 'string' ? v : fallback;
}

// Round-robin key rotation for comma-separated key lists
let _keyIndex = 0;
function rotateKey(envName: string): string {
  const raw = envString(envName);
  if (!raw) return '';
  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
  if (keys.length <= 1) return raw;
  const key = keys[_keyIndex % keys.length];
  _keyIndex++;
  return key;
}

function envBool(name: string, fallback = false): boolean {
  const v = envString(name);
  if (!v) return fallback;
  return v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'yes';
}

export const env = {
  brightdata: {
    token: envString('BRIGHTDATA_API_TOKEN') || envString('API_TOKEN'),
    zone:
      envString('BRIGHTDATA_WEB_UNLOCKER_ZONE') ||
      envString('BRIGHTDATA_UNLOCKER_ZONE') ||
      envString('WEB_UNLOCKER_ZONE') ||
      'mcp_unlocker',
    serpZone:
      envString('BRIGHTDATA_SERP_ZONE') ||
      envString('BRIGHTDATA_SERP_ZONE_NAME') ||
      '',
    browserAuth: envString('BRIGHTDATA_BROWSER_AUTH') || envString('BROWSER_AUTH'),
  },
  ai: {
    allowClientApiKeys: envBool('ALLOW_CLIENT_API_KEYS', false),
    openrouter: {
      get apiKey() { return rotateKey('OPENROUTER_API_KEY'); },
      baseURL: envString('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
      model: envString('OPENROUTER_MODEL', 'google/gemini-3-flash-preview'),
      modelFast: envString('OPENROUTER_MODEL_FAST', ''),
      modelDeep: envString('OPENROUTER_MODEL_DEEP', ''),
      modelPlan: envString('OPENROUTER_MODEL_PLAN', ''),
      modelPlanFast: envString('OPENROUTER_MODEL_PLAN_FAST', ''),
      modelPlanDeep: envString('OPENROUTER_MODEL_PLAN_DEEP', ''),
      modelArtifacts: envString('OPENROUTER_MODEL_ARTIFACTS', ''),
      modelArtifactsFast: envString('OPENROUTER_MODEL_ARTIFACTS_FAST', ''),
      modelArtifactsDeep: envString('OPENROUTER_MODEL_ARTIFACTS_DEEP', ''),
      modelChat: envString('OPENROUTER_MODEL_CHAT', ''),
      modelChatFast: envString('OPENROUTER_MODEL_CHAT_FAST', ''),
      modelChatDeep: envString('OPENROUTER_MODEL_CHAT_DEEP', ''),
      modelSummaries: envString('OPENROUTER_MODEL_SUMMARIES', ''),
      modelSummariesFast: envString('OPENROUTER_MODEL_SUMMARIES_FAST', ''),
      modelSummariesDeep: envString('OPENROUTER_MODEL_SUMMARIES_DEEP', ''),
    },
  },
};

export function hasDb() {
  return Boolean(process.env.DATABASE_URL);
}

export function hasBrightData() {
  return Boolean(env.brightdata.token && env.brightdata.zone);
}

export function brightDataSerpZone() {
  return env.brightdata.serpZone || env.brightdata.zone;
}
