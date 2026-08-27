import { describe, expect, it, vi } from 'vitest';

import {
  deriveHyperliquidCloid,
  formatHyperliquidPrice,
  formatHyperliquidSize,
  HyperliquidTestnetExecutionAdapter,
  type HyperliquidTestnetClients,
} from '../src/execution/hyperliquid-testnet-adapter.js';
import { ExecutionAdapterError } from '../src/execution/adapter.js';

const account = '0x1111111111111111111111111111111111111111' as const;
const signer = '0x2222222222222222222222222222222222222222' as const;
const filledResponse = {
  response: {
    data: {
      statuses: [
        {
          filled: {
            totalSz: '0.0015',
            avgPx: '66010',
            oid: 42,
          },
        },
      ],
    },
  },
} as const;

function clients(overrides: Partial<HyperliquidTestnetClients> = {}): HyperliquidTestnetClients {
  return {
    allMids: vi.fn().mockResolvedValue({ BTC: '66000', ETH: '3500' }),
    meta: vi.fn().mockResolvedValue({
      universe: [
        { name: 'BTC', szDecimals: 5, maxLeverage: 40 },
        { name: 'ETH', szDecimals: 4, maxLeverage: 25 },
      ],
    }),
    orderStatus: vi.fn().mockResolvedValue({ status: 'unknownOid' }),
    userFillsByTime: vi.fn().mockResolvedValue([
      {
        coin: 'BTC',
        px: '66010',
        sz: '0.0015',
        time: Date.parse('2026-08-25T10:00:01.000Z'),
        oid: 42,
        fee: '0.0495',
        feeToken: 'USDC',
      },
    ]),
    clearinghouseState: vi.fn().mockResolvedValue({
      assetPositions: [{ position: { coin: 'BTC', szi: '0.0015' } }],
    }),
    userRole: vi.fn().mockResolvedValue({ role: 'agent', data: { user: account } }),
    updateLeverage: vi.fn().mockResolvedValue({ status: 'ok' }),
    order: vi.fn().mockResolvedValue(filledResponse),
    ...overrides,
  };
}

function adapter(client: HyperliquidTestnetClients) {
  return new HyperliquidTestnetExecutionAdapter(client, {
    accountAddress: account,
    signerAddress: signer,
    signerKind: 'api-wallet',
    timeoutMs: 100,
    statusPollIntervalMs: 0,
    statusPollAttempts: 2,
    marketSlippageBps: 100,
    now: () => new Date('2026-08-25T10:00:00.000Z'),
    sleep: () => Promise.resolve(),
  });
}

const quote = {
  symbol: 'BTC' as const,
  price: 66_000,
  asOf: '2026-08-25T10:00:00.000Z',
  source: 'hyperliquid-testnet',
};

describe('HyperliquidTestnetExecutionAdapter', () => {
  it('derives a stable 128-bit cloid and applies documented size/price precision', () => {
    expect(deriveHyperliquidCloid('signal:approval-r1')).toMatch(/^0x[0-9a-f]{32}$/u);
    expect(deriveHyperliquidCloid('signal:approval-r1')).toBe(
      deriveHyperliquidCloid('signal:approval-r1'),
    );
    expect(formatHyperliquidSize(0.001519, 5)).toBe('0.00151');
    expect(formatHyperliquidPrice(66_655.4, 5, 'up')).toBe('66656');
    expect(formatHyperliquidPrice(65_340.6, 5, 'down')).toBe('65340');
  });

  it('validates an API wallet against the configured account and required BTC/ETH meta', async () => {
    const client = clients();
    await adapter(client).initialize();
    expect(client.userRole).toHaveBeenCalledWith({ user: signer }, expect.any(AbortSignal));
  });

  it('fails closed when an API wallet belongs to a different account', async () => {
    const subject = adapter(
      clients({
        userRole: vi.fn().mockResolvedValue({
          role: 'agent',
          data: { user: '0x3333333333333333333333333333333333333333' },
        }),
      }),
    );
    await expect(subject.initialize()).rejects.toMatchObject({
      code: 'ADAPTER_UNAVAILABLE',
      retryable: false,
    });
  });

  it('submits one IOC testnet order with leverage and returns normalized actual fill data', async () => {
    const client = clients();
    const subject = adapter(client);
    await subject.initialize();
    const result = await subject.submitMarketOrder({
      clientOrderId: 'signal:approval-r1',
      symbol: 'BTC',
      side: 'LONG',
      notionalUsd: 100,
      leverage: 2,
      stopLossPrice: 64_000,
      quote,
      evidence: null,
      fallbackPrice: 66_000,
    });

    expect(client.updateLeverage).toHaveBeenCalledWith(
      { asset: 0, isCross: true, leverage: 2 },
      expect.any(AbortSignal),
    );
    expect(client.order).toHaveBeenCalledWith(
      {
        orders: [
          expect.objectContaining({
            a: 0,
            b: true,
            c: deriveHyperliquidCloid('signal:approval-r1'),
            r: false,
            t: { limit: { tif: 'Ioc' } },
          }),
        ],
        grouping: 'na',
      },
      expect.any(AbortSignal),
    );
    expect(result).toMatchObject({
      clientOrderId: 'signal:approval-r1',
      venueOrderId: '42',
      fillPrice: 66_010,
      quantity: 0.0015,
      feeUsd: 0.0495,
    });
  });

  it('reconciles a filled cloid before submission and does not send a duplicate', async () => {
    const order = vi.fn().mockResolvedValue(filledResponse);
    const subject = adapter(
      clients({
        order,
        orderStatus: vi.fn().mockResolvedValue({
          status: 'order',
          order: {
            order: { coin: 'BTC', oid: 42, origSz: '0.0015', sz: '0' },
            status: 'filled',
            statusTimestamp: Date.parse('2026-08-25T10:00:01.000Z'),
          },
        }),
      }),
    );
    const result = await subject.submitMarketOrder({
      clientOrderId: 'signal:approval-r1',
      symbol: 'BTC',
      side: 'LONG',
      notionalUsd: 100,
      leverage: 2,
      stopLossPrice: 64_000,
      quote,
      evidence: null,
      fallbackPrice: 66_000,
    });
    expect(result.venueOrderId).toBe('42');
    expect(order).not.toHaveBeenCalled();
  });

  it('surfaces a venue rejection and never invokes another adapter', async () => {
    const subject = adapter(
      clients({
        order: vi.fn().mockResolvedValue({
          response: { data: { statuses: [{ error: 'Insufficient margin' }] } },
        }),
      }),
    );
    await expect(
      subject.submitMarketOrder({
        clientOrderId: 'signal:approval-r1',
        symbol: 'BTC',
        side: 'LONG',
        notionalUsd: 100,
        leverage: 2,
        stopLossPrice: 64_000,
        quote,
        evidence: null,
        fallbackPrice: 66_000,
      }),
    ).rejects.toMatchObject({ code: 'ORDER_REJECTED', retryable: false });
  });

  it('bounds a testnet price timeout with a retryable structured error', async () => {
    const client = clients({
      allMids: vi.fn(
        (signal?: AbortSignal) =>
          new Promise<Record<string, string>>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          }),
      ),
    });
    const subject = new HyperliquidTestnetExecutionAdapter(client, {
      accountAddress: account,
      signerAddress: signer,
      signerKind: 'api-wallet',
      timeoutMs: 5,
      statusPollIntervalMs: 0,
      statusPollAttempts: 1,
      marketSlippageBps: 100,
    });
    await expect(
      subject.getCurrentPrice({ symbol: 'BTC', evidence: null, fallbackPrice: 66_000 }),
    ).rejects.toMatchObject({ code: 'PRICE_UNAVAILABLE', retryable: true });
  });

  it('uses a reduce-only IOC close and refuses a mismatched venue position', async () => {
    const client = clients();
    const subject = adapter(client);
    await subject.initialize();
    const closed = await subject.closePosition({
      clientOrderId: 'close:position-id',
      symbol: 'BTC',
      side: 'LONG',
      entryPrice: 65_000,
      quantity: 0.0015,
      entryFeeUsd: 0.04,
      quote,
      evidence: null,
      fallbackPrice: 66_000,
    });
    expect(client.order).toHaveBeenCalledWith(
      expect.objectContaining({
        orders: [expect.objectContaining({ b: false, r: true })],
      }),
      expect.any(AbortSignal),
    );
    expect(closed.realizedPnl).toBeCloseTo(1.4255, 6);

    const mismatched = adapter(
      clients({ clearinghouseState: vi.fn().mockResolvedValue({ assetPositions: [] }) }),
    );
    await expect(
      mismatched.closePosition({
        clientOrderId: 'close:missing',
        symbol: 'BTC',
        side: 'LONG',
        entryPrice: 65_000,
        quantity: 0.0015,
        entryFeeUsd: 0.04,
        quote,
        evidence: null,
        fallbackPrice: 66_000,
      }),
    ).rejects.toBeInstanceOf(ExecutionAdapterError);
  });
});
