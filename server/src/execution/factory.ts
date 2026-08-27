import { env } from '../config/env.js';
import type { PriceProvider } from './paper-adapter.js';
import type { ExecutionAdapter } from './adapter.js';
import { HyperliquidTestnetExecutionAdapter } from './hyperliquid-testnet-adapter.js';
import { PaperExecutionAdapter } from './paper-adapter.js';

export async function createExecutionAdapter(prices: PriceProvider): Promise<ExecutionAdapter> {
  if (env.EXECUTION_MODE === 'paper') {
    return new PaperExecutionAdapter(prices, {
      feeBps: env.PAPER_FEE_BPS,
      slippageBps: env.PAPER_SLIPPAGE_BPS,
    });
  }

  if (
    env.HYPERLIQUID_NETWORK !== 'testnet' ||
    !env.HYPERLIQUID_TESTNET_ENABLED ||
    !env.HYPERLIQUID_API_PRIVATE_KEY ||
    !env.HYPERLIQUID_ACCOUNT_ADDRESS ||
    !env.HYPERLIQUID_SIGNER_KIND
  ) {
    throw new Error('Hyperliquid testnet execution configuration is incomplete; refusing startup');
  }

  console.warn(
    'TESTNET EXECUTION ENABLED: orders will be signed for Hyperliquid testnet only; no paper fallback will occur on failure.',
  );
  return HyperliquidTestnetExecutionAdapter.create({
    privateKey: env.HYPERLIQUID_API_PRIVATE_KEY as `0x${string}`,
    accountAddress: env.HYPERLIQUID_ACCOUNT_ADDRESS,
    signerKind: env.HYPERLIQUID_SIGNER_KIND,
    timeoutMs: env.HYPERLIQUID_EXECUTION_TIMEOUT_MS,
    statusPollIntervalMs: env.HYPERLIQUID_STATUS_POLL_INTERVAL_MS,
    statusPollAttempts: env.HYPERLIQUID_STATUS_POLL_ATTEMPTS,
    marketSlippageBps: env.HYPERLIQUID_MARKET_SLIPPAGE_BPS,
  });
}
