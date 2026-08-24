import { z } from 'zod';

import { AssetSchema } from './enums.js';
import {
  FlatMetadataSchema,
  NonNegativeMoneySchema,
  PriceSchema,
  UtcDateTimeSchema,
} from './primitives.js';

const sampleEnvelope = {
  sourceTimestamp: UtcDateTimeSchema,
  ingestedAt: UtcDateTimeSchema,
  metadata: FlatMetadataSchema.default({}),
} as const;

export const HyperliquidMarketSampleSchema = z
  .object({
    ...sampleEnvelope,
    source: z.literal('hyperliquid'),
    sampleId: z.string().min(1),
    symbol: AssetSchema,
    markPrice: PriceSchema,
    volume24hUsd: NonNegativeMoneySchema,
    fundingRate: z.number().finite(),
    openInterestUsd: NonNegativeMoneySchema,
  })
  .strict();
export type HyperliquidMarketSample = z.infer<typeof HyperliquidMarketSampleSchema>;

export const PolymarketMarketSampleSchema = z
  .object({
    ...sampleEnvelope,
    source: z.literal('polymarket'),
    marketId: z.string().min(1),
    eventId: z.string().min(1),
    question: z.string().min(1),
    relevantAsset: AssetSchema,
    outcome: z.string().min(1),
    probability: z.number().finite().min(0).max(1),
    probabilityChange24h: z.number().finite().min(-1).max(1),
    liquidityUsd: NonNegativeMoneySchema,
  })
  .strict();
export type PolymarketMarketSample = z.infer<typeof PolymarketMarketSampleSchema>;

export const NormalizedMarketSampleSchema = z.discriminatedUnion('source', [
  HyperliquidMarketSampleSchema,
  PolymarketMarketSampleSchema,
]);
export type NormalizedMarketSample = z.infer<typeof NormalizedMarketSampleSchema>;
