import { env } from '../config/env.js';
import { FixtureReasoningProvider } from './fixture-provider.js';
import { OpenAIReasoningProvider } from './openai-provider.js';
import type { ReasoningProvider } from './provider.js';

export function createReasoningProvider(): ReasoningProvider {
  if (env.LLM_PROVIDER === 'fixture') return new FixtureReasoningProvider();
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for LLM_PROVIDER=openai');
  return new OpenAIReasoningProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.LLM_MODEL,
    baseUrl: env.OPENAI_BASE_URL,
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
  });
}
