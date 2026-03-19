import { z } from 'zod';

import { chatJson, getAIConfig } from '@/lib/ai';
import { env } from '@/lib/env';
import { truncateText } from '@/lib/run-pipeline/utils';
import { buildSignalTerminalPlanPrompt } from '@/prompts/signalTerminalPlan';

const PlanSchema = z.object({
  queries: z.array(z.string().min(2)).min(3).max(10),
  angles: z.array(z.string()).max(12).optional(),
});

export async function planQueries({
  topic,
  question,
  model,
  apiKey,
  onAiUsage,
}: {
  topic: string;
  question?: string;
  model?: string;
  apiKey?: string;
  onAiUsage?: (u: {
    model: string;
    tag?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }) => void;
}): Promise<{ queries: string[]; angles?: string[]; usedAI: boolean; reason?: string }> {
  const fallbackPlan = (reason: string) => {
    const base = question?.trim() || `What is moving ${topic} today? Is it related to gold?`;
    const queries = [
      `${topic} news today`,
      `${topic} price move today catalyst`,
      `${topic} related to gold`,
      `bitcoin gold correlation today`,
      `${topic} ETF flow headline`,
      `${topic} regulation policy headline`,
    ];
    return { queries: [base, ...queries].slice(0, 6), usedAI: false as const, reason };
  };

  const canUseClientKey = env.ai.allowClientApiKeys;
  const keyOverride = canUseClientKey ? apiKey : undefined;
  const stageModel = env.ai.openrouter.modelPlan;
  const config = getAIConfig({ apiKeyOverride: keyOverride, modelOverride: model || stageModel || undefined });
  if (!config) return fallbackPlan('no_ai_config');

  const planPrompt = buildSignalTerminalPlanPrompt({ topic, question });
  try {
    const plan = await chatJson({
      config,
      schema: PlanSchema,
      system: planPrompt.system,
      user: planPrompt.user,
      temperature: 0.2,
      telemetry: { tag: 'plan', onUsage: onAiUsage },
    });
    return { ...plan, usedAI: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e || 'plan_failed');
    return fallbackPlan(`plan_json_parse_failed: ${truncateText(message, 180)}`);
  }
}
