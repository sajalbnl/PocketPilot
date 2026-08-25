import { describe, expect, it } from 'vitest';

import { PaperExecutionAdapter, calculateUnrealizedPnl } from '../src/execution/paper-adapter.js';

const quote = {
  symbol: 'BTC' as const,
  price: 100,
  asOf: '2026-08-24T12:00:00.000Z',
  source: 'test-mark',
};
const prices = { getCurrentPrice: () => Promise.resolve(quote) };

describe('paper execution math', () => {
  it('uses adverse deterministic slippage and charges a deterministic entry fee', async () => {
    const adapter = new PaperExecutionAdapter(prices, { feeBps: 5, slippageBps: 10 });
    const fill = await adapter.submitMarketOrder({
      clientOrderId: 'signal:approval-r1',
      symbol: 'BTC',
      side: 'LONG',
      notionalUsd: 100,
      leverage: 2,
      stopLossPrice: 95,
      quote,
      evidence: null,
      fallbackPrice: 100,
    });
    expect(fill.fillPrice).toBe(100.1);
    expect(fill.quantity).toBeCloseTo(100 / 100.1, 12);
    expect(fill.feeUsd).toBe(0.05);
    expect(fill.venueOrderId).toBe('paper-c2efa8011ef1e8dcd8512fa4');
    expect(
      (
        await adapter.submitMarketOrder({
          clientOrderId: 'signal:approval-r1',
          symbol: 'BTC',
          side: 'LONG',
          notionalUsd: 100,
          leverage: 2,
          stopLossPrice: 95,
          quote,
          evidence: null,
          fallbackPrice: 100,
        })
      ).venueOrderId,
    ).toBe(fill.venueOrderId);
  });

  it('computes long and short unrealized PnL with opposite signs and entry fees included', () => {
    expect(
      calculateUnrealizedPnl({
        side: 'LONG',
        entryPrice: 100,
        currentPrice: 110,
        quantity: 1,
        entryFeeUsd: 0.1,
      }),
    ).toBe(9.9);
    expect(
      calculateUnrealizedPnl({
        side: 'SHORT',
        entryPrice: 100,
        currentPrice: 110,
        quantity: 1,
        entryFeeUsd: 0.1,
      }),
    ).toBe(-10.1);
  });

  it('closes in the adverse direction and subtracts both entry and exit fees', async () => {
    const adapter = new PaperExecutionAdapter(prices, { feeBps: 5, slippageBps: 10 });
    const closed = await adapter.closePosition({
      clientOrderId: 'close:position-1',
      symbol: 'BTC',
      side: 'LONG',
      entryPrice: 90,
      quantity: 1,
      entryFeeUsd: 0.05,
      quote,
      evidence: null,
      fallbackPrice: 100,
    });
    expect(closed.fillPrice).toBe(99.9);
    expect(closed.feeUsd).toBe(0.04995);
    expect(closed.realizedPnl).toBe(9.80005);
  });
});
