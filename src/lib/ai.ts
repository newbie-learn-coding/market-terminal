import OpenAI from 'openai';
import { z } from 'zod';

import { env } from '@/lib/env';
import { buildCacheKey, getOrComputeCached } from '@/lib/server-cache';
import { normalizeProviderError } from '@/lib/provider-error';

export type AIConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

type AIUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type AIChatResult = {
  content: string;
  usage?: AIUsage;
  finishReason?: string | null;
};

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          if (typeof p.text === 'string') return p.text;
          if (typeof p.content === 'string') return p.content;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.content === 'string') return obj.content;
  }
  return String(content || '');
}

function stripCodeFence(raw: string): string {
  const s = String(raw || '').trim();
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (m?.[1] || s).trim();
}

function normalizeJsonQuotes(raw: string): string {
  return String(raw || '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'");
}

function stripUnicodeNoise(raw: string): string {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function stripTrailingCommas(raw: string): string {
  return String(raw || '').replace(/,\s*([}\]])/g, '$1');
}

function autoCloseLikelyTruncatedJson(raw: string): string {
  const s = String(raw || '');
  if (!s.trim()) return s;

  let out = '';
  let inString = false;
  let escaped = false;
  const closers: string[] = [];

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    out += ch;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      closers.push('}');
      continue;
    }
    if (ch === '[') {
      closers.push(']');
      continue;
    }
    if (ch === '}' || ch === ']') {
      const expected = closers[closers.length - 1];
      if (expected === ch) closers.pop();
    }
  }

  if (inString) out += '"';
  if (closers.length) out += closers.reverse().join('');
  return out;
}

function stripJsonComments(raw: string): string {
  const s = String(raw || '');
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    const next = s[i + 1] || '';

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    // Strip // line comments.
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < s.length && s[i] !== '\n') i += 1;
      if (i < s.length) out += '\n';
      continue;
    }

    // Strip /* block comments */.
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < s.length - 1 && !(s[i] === '*' && s[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }

    out += ch;
  }

  return out;
}

function isLikelyJsonText(raw: string): boolean {
  const s = String(raw || '').trim();
  if (!s) return false;
  return (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'));
}

function extractBalancedJson(raw: string): string | null {
  const s = String(raw || '');
  let start = -1;
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;

    if (start === -1) {
      if (ch === '{' || ch === '[') {
        start = i;
        stack.push(ch === '{' ? '}' : ']');
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      stack.push('}');
      continue;
    }
    if (ch === '[') {
      stack.push(']');
      continue;
    }
    if (ch === '}' || ch === ']') {
      const expected = stack[stack.length - 1];
      if (!expected || ch !== expected) continue;
      stack.pop();
      if (stack.length === 0) {
        return s.slice(start, i + 1);
      }
    }
  }

  return null;
}

function extractBalancedObject(raw: string): string | null {
  const s = String(raw || '');
  let start = -1;
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;

    if (start === -1) {
      if (ch === '{') {
        start = i;
        stack.push('}');
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      stack.push('}');
      continue;
    }
    if (ch === '[') {
      stack.push(']');
      continue;
    }
    if (ch === '}' || ch === ']') {
      const expected = stack[stack.length - 1];
      if (!expected || ch !== expected) continue;
      stack.pop();
      if (stack.length === 0) return s.slice(start, i + 1);
    }
  }

  return null;
}

function buildValidationCandidates(parsed: unknown): unknown[] {
  const out: unknown[] = [parsed];

  const push = (v: unknown) => {
    if (v === undefined) return;
    out.push(v);
  };

  if (Array.isArray(parsed)) {
    if (parsed.length === 1) {
      push(parsed[0]);
    } else if (parsed.length > 1) {
      push(parsed[0]);
      push(parsed[parsed.length - 1]);

      const objectCandidates = parsed.filter((item) => item && typeof item === 'object');
      if (objectCandidates.length) {
        // Prefer richer objects that are more likely to be the actual payload.
        const best = objectCandidates
          .map((item) => ({
            item,
            score: Object.keys(item as Record<string, unknown>).length,
          }))
          .sort((a, b) => b.score - a.score)[0];
        if (best) push(best.item);
      }
    }
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['result', 'output', 'response', 'data', 'json']) {
      const value = obj[key];
      if (value === undefined) continue;
      push(value);
      if (Array.isArray(value) && value.length === 1) push(value[0]);
    }
  }

  return out;
}

export function getAIConfig({
  apiKeyOverride,
  modelOverride,
}: {
  apiKeyOverride?: string;
  modelOverride?: string;
} = {}): AIConfig | null {
  const base = {
    apiKey: env.ai.openrouter.apiKey,
    baseURL: env.ai.openrouter.baseURL,
    model: env.ai.openrouter.model,
  };

  const apiKey = apiKeyOverride || base.apiKey;
  if (!apiKey) return null;

  return {
    apiKey,
    baseURL: base.baseURL,
    model: modelOverride || base.model,
  };
}

export function createAIClient(config: AIConfig) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: {
      // Optional but recommended by OpenRouter for analytics.
      'X-Title': 'TrendAnalysis.ai',
    },
  });
}

export async function createChatCompletion({
  config,
  system,
  user,
  temperature = 0.2,
  maxTokens,
  cacheTtlMs = 5 * 60_000,
  jsonObject = false,
}: {
  config: AIConfig;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  cacheTtlMs?: number;
  jsonObject?: boolean;
}): Promise<AIChatResult> {
  const client = createAIClient(config);
  const cacheKey = buildCacheKey([
    'openrouter.chat',
    config.baseURL,
    config.model,
    temperature,
    maxTokens || '',
    jsonObject ? 'json' : 'text',
    system,
    user,
  ]);

  return getOrComputeCached({
    key: cacheKey,
    ttlMs: cacheTtlMs,
    loader: async () => {
      try {
        const res = await client.chat.completions.create({
          model: config.model,
          temperature,
          ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : null),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          ...(jsonObject ? { response_format: { type: 'json_object' } as any } : null),
        });

        return {
          content: normalizeMessageContent(res.choices?.[0]?.message?.content || ''),
          usage: {
            prompt_tokens: res.usage?.prompt_tokens,
            completion_tokens: res.usage?.completion_tokens,
            total_tokens: res.usage?.total_tokens,
          },
          finishReason: res.choices?.[0]?.finish_reason || null,
        };
      } catch (e) {
        throw normalizeProviderError('openrouter', e, 'AI request failed');
      }
    },
  });
}

export async function chatJson<TSchema extends z.ZodTypeAny>({
  config,
  schema,
  system,
  user,
  temperature = 0.2,
  telemetry,
}: {
  config: AIConfig;
  schema: TSchema;
  system: string;
  user: string;
  temperature?: number;
  telemetry?: {
    tag?: string;
    onUsage?: (u: {
      model: string;
      tag?: string;
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    }) => void;
  };
}): Promise<z.infer<TSchema>> {
  const result = await createChatCompletion({
    config,
    system,
    user,
    temperature,
    jsonObject: true,
  });

  telemetry?.onUsage?.({
    model: config.model,
    tag: telemetry.tag,
    prompt_tokens: result.usage?.prompt_tokens,
    completion_tokens: result.usage?.completion_tokens,
    total_tokens: result.usage?.total_tokens,
  });

  const finishReason = result.finishReason || 'unknown';
  const rawContent = result.content || '{}';
  const cleanedRaw = normalizeJsonQuotes(stripUnicodeNoise(rawContent));
  const unique = (arr: string[]) => arr.filter((v, idx) => v && arr.indexOf(v) === idx);
  const baseCandidates = unique([
    cleanedRaw,
    stripCodeFence(cleanedRaw),
    normalizeJsonQuotes(stripCodeFence(rawContent)),
  ]);
  const candidates = unique(
    baseCandidates.flatMap((candidate) => {
      const candidateNoComments = stripJsonComments(candidate);
      const balanced = extractBalancedJson(candidateNoComments) || extractBalancedJson(candidate);
      const balancedObject =
        extractBalancedObject(candidateNoComments) || extractBalancedObject(candidate);
      const autoClosed = autoCloseLikelyTruncatedJson(candidateNoComments);
      const cands = [candidate, candidateNoComments];
      cands.push(stripTrailingCommas(candidate));
      cands.push(stripTrailingCommas(candidateNoComments));
      cands.push(autoClosed);
      cands.push(stripTrailingCommas(autoClosed));
      if (balanced) {
        cands.push(balanced);
        cands.push(stripTrailingCommas(balanced));
      }
      if (balancedObject) {
        cands.push(balancedObject);
        cands.push(stripTrailingCommas(balancedObject));
      }
      return cands;
    }),
  );

  let parsed: unknown | undefined;
  let parseError: unknown = null;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);

      // Some models return JSON encoded as a string literal, occasionally twice.
      for (let depth = 0; depth < 2; depth += 1) {
        if (typeof parsed === 'string' && isLikelyJsonText(parsed)) {
          parsed = JSON.parse(parsed);
        } else {
          break;
        }
      }
      break;
    } catch (e) {
      parseError = e;
    }
  }

  if (parsed === undefined) {
    const preview = rawContent.slice(0, 220);
    const suffix = parseError instanceof Error ? ` parse_error=${parseError.message}` : '';
    throw new Error(
      `Model did not return valid JSON (model=${config.model}, finish_reason=${finishReason}). First 220 chars: ${preview}${suffix}`,
    );
  }

  const validationCandidates = buildValidationCandidates(parsed);
  for (const candidate of validationCandidates) {
    const validated = schema.safeParse(candidate);
    if (validated.success) return validated.data;
  }

  {
    const root =
      parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed;
    const firstFail = schema.safeParse(validationCandidates[0]);
    const issues = firstFail.success
      ? ''
      : firstFail.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '$'}:${issue.code}`)
      .join(',');
    const preview = rawContent.slice(0, 220);
    throw new Error(
      `Model JSON schema mismatch (model=${config.model}, finish_reason=${finishReason}, root=${root}, issues=${issues}). First 220 chars: ${preview}`,
    );
  }
}
