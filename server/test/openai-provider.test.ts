import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAIReasoningProvider } from '../src/reasoning/openai-provider.js';
import type { ReasoningContext } from '../src/reasoning/prompt-v1.js';

const context = {
  promptVersion: 'pocketpilot-reasoning-v1',
  skill: {
    id: 'cross-market-catalyst',
    version: 1,
    description: 'A sufficiently long test skill description for provider serialization.',
    relevantInstructions: {
      proposalDefaults: { notional_usd: 100, leverage: 2, stop_loss_pct: 2 },
      proposalBounds: {
        notional_usd: { min: 25, max: 100 },
        leverage: { min: 1, max: 3 },
        stop_loss_pct: { min: 0.5, max: 5 },
      },
      expiryMinutes: 10,
      invalidationGuidance: ['Invalidate when bounded evidence reverses.'],
    },
  },
  candidate: {
    asset: 'BTC',
    direction: 'LONG',
    executionVenue: 'hyperliquid',
    normalizedFeatures: { price_return_pct: 1.5 },
    triggeredRules: [],
  },
  evidence: [],
  mandate: {
    version: 1,
    allowedAssets: ['BTC'],
    allowedVenues: ['hyperliquid'],
    maxPositionUsd: 100,
    maxLeverage: 3,
    stopLossRequired: true,
    approvalRequired: true,
    maxExpiryMinutes: 10,
  },
} satisfies ReasoningContext;

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI reasoning provider', () => {
  it('uses the Responses API strict schema without putting the key in the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_test',
          output: [
            { type: 'message', content: [{ type: 'output_text', text: '{"decision":"ok"}' }] },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAIReasoningProvider({
      apiKey: 'test-secret-never-log',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      timeoutMs: 2_000,
      maxRetries: 1,
    });
    const generated = await provider.generate({ instructions: 'bounded', context });
    expect(generated).toMatchObject({ rawText: '{"decision":"ok"}', responseId: 'resp_test' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('apiKey');
    expect(body).toMatchObject({
      model: 'gpt-4.1-mini',
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
  });

  it('retries one rate-limit response and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'limited' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '{}' }] }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAIReasoningProvider({
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      timeoutMs: 2_000,
      maxRetries: 1,
    });
    await expect(provider.generate({ instructions: 'bounded', context })).resolves.toMatchObject({
      rawText: '{}',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds a provider timeout and returns a typed failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          }),
      ),
    );
    const provider = new OpenAIReasoningProvider({
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      timeoutMs: 5,
      maxRetries: 0,
    });
    await expect(provider.generate({ instructions: 'bounded', context })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
  });
});
