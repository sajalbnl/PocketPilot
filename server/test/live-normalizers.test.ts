import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { hyperliquidMessageToRawEvent, polymarketPollToRawEvent } from '../src/live/normalizers.js';
import { normalizeMarketEvent } from '../src/market/normalize.js';

async function fixture(name: string): Promise<unknown> {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

describe('captured live payload normalizers', () => {
  it('schema-checks and normalizes Hyperliquid activeAssetCtx', async () => {
    const raw = hyperliquidMessageToRawEvent({
      message: await fixture('hyperliquid-active-asset-ctx.json'),
      symbolMap: { BTC: 'BTC', ETH: 'ETH' },
      receivedAt: new Date('2026-08-25T08:30:00.000Z'),
      sequence: 7,
    });
    expect(raw?.source).toBe('hyperliquid');
    if (!raw) throw new Error('Expected captured Hyperliquid event');
    const normalized = normalizeMarketEvent(raw);
    expect(normalized).toMatchObject({
      source: 'hyperliquid',
      symbol: 'BTC',
      markPrice: 65788.5,
      volume24hUsd: 3135293564.842761,
      fundingRate: 0.0000125,
      sourceTimestamp: '2026-08-25T08:30:00.000Z',
    });
    if (normalized.source === 'hyperliquid') {
      expect(normalized.openInterestUsd).toBeCloseTo(24115.6923 * 65788.5, 2);
    }
  });

  it('schema-checks Gamma/CLOB payloads and preserves explicit market mapping', async () => {
    const raw = polymarketPollToRawEvent({
      market: await fixture('polymarket-gamma-market.json'),
      midpoint: await fixture('polymarket-midpoint.json'),
      mapping: {
        marketId: '123456',
        asset: 'BTC',
        outcome: 'Yes',
        meaning: 'BTC above $100k by the configured resolution date',
      },
      receivedAt: new Date('2026-08-25T08:30:01.000Z'),
      sequence: 8,
    });
    const normalized = normalizeMarketEvent(raw);
    expect(normalized).toMatchObject({
      source: 'polymarket',
      marketId: '123456',
      relevantAsset: 'BTC',
      outcome: 'Yes',
      outcomeTokenId: '1122334455',
      probability: 0.615,
      probabilityChange24h: 0.08,
      liquidityUsd: 244990.5,
    });
  });

  it('rejects malformed provider payloads before normalization', () => {
    expect(() =>
      hyperliquidMessageToRawEvent({
        message: { channel: 'activeAssetCtx', data: { coin: 'BTC', ctx: { markPx: 'bad' } } },
        symbolMap: { BTC: 'BTC' },
        receivedAt: new Date(),
        sequence: 0,
      }),
    ).toThrow();
  });
});
