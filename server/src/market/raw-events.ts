import { z } from 'zod';

const ReplayEnvelopeSchema = z.object({
  sequence: z.number().int().nonnegative(),
  sourceTimestamp: z.string().datetime({ offset: true }),
  ingestedAt: z.string().datetime({ offset: true }),
});

export const RawHyperliquidEventSchema = ReplayEnvelopeSchema.extend({
  source: z.literal('hyperliquid'),
  channel: z.literal('activeAssetCtx'),
  payload: z
    .object({
      coin: z.enum(['BTC', 'ETH']),
      markPx: z.string(),
      dayNtlVlm: z.string(),
      funding: z.string(),
      openInterest: z.string(),
      eventId: z.string().min(1),
      sourceSymbol: z.string().min(1).optional(),
      timestampSource: z.enum(['provider', 'adapter_receipt']).optional(),
    })
    .strict(),
}).strict();

export const RawPolymarketEventSchema = ReplayEnvelopeSchema.extend({
  source: z.literal('polymarket'),
  channel: z.literal('market'),
  payload: z
    .object({
      event_id: z.string().min(1),
      market: z.string().min(1),
      condition_id: z.string().min(1),
      asset_id: z.string().min(1),
      question: z.string().min(1),
      outcome: z.string().min(1),
      price: z.string(),
      price_change_24h: z.string(),
      liquidity: z.string(),
      relevant_asset: z.enum(['BTC', 'ETH']),
      eventId: z.string().min(1),
      mapping_meaning: z.string().min(1).optional(),
      timestamp_source: z.enum(['provider', 'adapter_receipt']).optional(),
    })
    .strict(),
}).strict();

export const RawMarketEventSchema = z.discriminatedUnion('source', [
  RawHyperliquidEventSchema,
  RawPolymarketEventSchema,
]);
export type RawMarketEvent = z.infer<typeof RawMarketEventSchema>;

export interface MarketEventSource {
  readonly id: string;
  load(): Promise<readonly RawMarketEvent[]>;
}
