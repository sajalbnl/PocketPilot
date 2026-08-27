import { describe, expect, it } from 'vitest';

import { EnvironmentSchema } from '../src/config/env.js';

const base = { DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/pocketpilot' };

describe('execution environment safety', () => {
  it('keeps paper mode usable without any Hyperliquid signing configuration', () => {
    const parsed = EnvironmentSchema.safeParse({ ...base, EXECUTION_MODE: 'paper' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.HYPERLIQUID_TESTNET_ENABLED).toBe(false);
  });

  it('fails closed when testnet execution is not explicitly enabled and complete', () => {
    const parsed = EnvironmentSchema.safeParse({
      ...base,
      EXECUTION_MODE: 'hyperliquid-testnet',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining([
          'HYPERLIQUID_NETWORK',
          'HYPERLIQUID_TESTNET_ENABLED',
          'HYPERLIQUID_API_PRIVATE_KEY',
          'HYPERLIQUID_ACCOUNT_ADDRESS',
          'HYPERLIQUID_SIGNER_KIND',
        ]),
      );
    }
  });

  it('accepts only the explicit testnet network and activation gate', () => {
    const parsed = EnvironmentSchema.safeParse({
      ...base,
      EXECUTION_MODE: 'hyperliquid-testnet',
      HYPERLIQUID_NETWORK: 'testnet',
      HYPERLIQUID_TESTNET_ENABLED: 'true',
      HYPERLIQUID_API_PRIVATE_KEY: `0x${'ab'.repeat(32)}`,
      HYPERLIQUID_ACCOUNT_ADDRESS: `0x${'12'.repeat(20)}`,
      HYPERLIQUID_SIGNER_KIND: 'api-wallet',
    });
    expect(parsed.success).toBe(true);
  });
});
