import { z } from 'zod';

import type { Asset } from '@pocketpilot/shared';

import { RawMarketEventSchema, type RawMarketEvent } from '../market/raw-events.js';

const WireNumberSchema = z
  .union([z.string().min(1), z.number().finite()])
  .transform((value) => String(value));

export const HyperliquidActiveAssetCtxMessageSchema = z
  .object({
    channel: z.literal('activeAssetCtx'),
    data: z
      .object({
        coin: z.string().min(1),
        ctx: z
          .object({
            markPx: WireNumberSchema,
            dayNtlVlm: WireNumberSchema,
            funding: WireNumberSchema,
            openInterest: WireNumberSchema,
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export interface PolymarketMapping {
  marketId: string;
  asset: Asset;
  outcome: string;
  meaning: string;
}

export const PolymarketGammaMarketSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    question: z.string().min(1),
    conditionId: z.string().min(1),
    outcomes: z.string().min(1),
    clobTokenIds: z.string().min(1),
    oneDayPriceChange: z.union([z.string(), z.number()]).nullable().optional(),
    liquidityClob: z.union([z.string(), z.number()]).nullable().optional(),
    liquidityNum: z.union([z.string(), z.number()]).nullable().optional(),
    liquidity: z.union([z.string(), z.number()]).nullable().optional(),
    active: z.boolean().nullable().optional(),
    closed: z.boolean().nullable().optional(),
  })
  .passthrough();

export const PolymarketMidpointSchema = z
  .union([
    z.object({ mid_price: WireNumberSchema }).passthrough(),
    z.object({ mid: WireNumberSchema }).passthrough(),
  ])
  .transform((value) => ({ mid_price: 'mid_price' in value ? value.mid_price : value.mid }));

export function hyperliquidMessageToRawEvent(input: {
  message: unknown;
  symbolMap: Record<string, Asset>;
  receivedAt: Date;
  sequence: number;
}): RawMarketEvent | null {
  const channel = z.object({ channel: z.string() }).passthrough().safeParse(input.message);
  if (!channel.success || channel.data.channel !== 'activeAssetCtx') return null;
  const parsed = HyperliquidActiveAssetCtxMessageSchema.parse(input.message);
  const symbol = input.symbolMap[parsed.data.coin];
  if (!symbol) return null;
  const receivedAt = input.receivedAt.toISOString();
  return RawMarketEventSchema.parse({
    sequence: input.sequence,
    source: 'hyperliquid',
    channel: 'activeAssetCtx',
    // activeAssetCtx has no exchange timestamp; receipt time is explicitly retained as source time.
    sourceTimestamp: receivedAt,
    ingestedAt: receivedAt,
    payload: {
      coin: symbol,
      markPx: parsed.data.ctx.markPx,
      dayNtlVlm: parsed.data.ctx.dayNtlVlm,
      funding: parsed.data.ctx.funding,
      openInterest: parsed.data.ctx.openInterest,
      eventId: `hl:${parsed.data.coin}:${input.receivedAt.getTime()}:${input.sequence}`,
      sourceSymbol: parsed.data.coin,
      timestampSource: 'adapter_receipt',
    },
  });
}

export function polymarketPollToRawEvent(input: {
  market: unknown;
  midpoint: unknown;
  mapping: PolymarketMapping;
  receivedAt: Date;
  sequence: number;
}): RawMarketEvent {
  const market = PolymarketGammaMarketSchema.parse(input.market);
  const midpoint = PolymarketMidpointSchema.parse(input.midpoint);
  if (market.id !== input.mapping.marketId) {
    throw new Error(`Polymarket response ID ${market.id} did not match ${input.mapping.marketId}`);
  }
  if (market.closed || market.active === false) {
    throw new Error(`Polymarket market ${market.id} is not active`);
  }
  const outcomes = jsonStringArray(market.outcomes, 'outcomes');
  const tokenIds = jsonStringArray(market.clobTokenIds, 'clobTokenIds');
  if (outcomes.length !== tokenIds.length)
    throw new Error('Polymarket outcomes/token IDs mismatch');
  const outcomeIndex = outcomes.findIndex(
    (outcome) => outcome.toLowerCase() === input.mapping.outcome.toLowerCase(),
  );
  if (outcomeIndex < 0)
    throw new Error(`Configured outcome ${input.mapping.outcome} was not found`);
  const tokenId = tokenIds[outcomeIndex];
  if (!tokenId) throw new Error('Configured Polymarket outcome has no CLOB token ID');

  const movement = finiteWireNumber(market.oneDayPriceChange ?? 0, 'oneDayPriceChange');
  const selectedMovement = outcomeIndex === 0 ? movement : -movement;
  const liquidity =
    market.liquidityClob ??
    market.liquidityNum ??
    market.liquidity ??
    (() => {
      throw new Error('Polymarket response has no liquidity');
    })();
  const receivedAt = input.receivedAt.toISOString();
  return RawMarketEventSchema.parse({
    sequence: input.sequence,
    source: 'polymarket',
    channel: 'market',
    // Gamma/CLOB polling responses do not include a quote timestamp; request completion is explicit.
    sourceTimestamp: receivedAt,
    ingestedAt: receivedAt,
    payload: {
      event_id: market.conditionId,
      market: market.id,
      condition_id: market.conditionId,
      asset_id: tokenId,
      question: market.question,
      outcome: input.mapping.outcome,
      price: midpoint.mid_price,
      price_change_24h: String(selectedMovement),
      liquidity: String(liquidity),
      relevant_asset: input.mapping.asset,
      eventId: `pm:${market.id}:${tokenId}:${input.receivedAt.getTime()}:${input.sequence}`,
      mapping_meaning: input.mapping.meaning,
      timestamp_source: 'adapter_receipt',
    },
  });
}

export function polymarketOutcomeTokenId(marketInput: unknown, outcome: string): string {
  const market = PolymarketGammaMarketSchema.parse(marketInput);
  const outcomes = jsonStringArray(market.outcomes, 'outcomes');
  const tokenIds = jsonStringArray(market.clobTokenIds, 'clobTokenIds');
  const index = outcomes.findIndex((item) => item.toLowerCase() === outcome.toLowerCase());
  const tokenId = tokenIds[index];
  if (index < 0 || !tokenId) throw new Error(`Outcome ${outcome} has no CLOB token ID`);
  return tokenId;
}

function jsonStringArray(value: string, field: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Polymarket ${field} is not valid JSON`);
  }
  return z.array(z.string().min(1)).min(1).parse(parsed);
}

function finiteWireNumber(value: string | number, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be finite`);
  return parsed;
}
