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
  sourceEventId: z.string().min(1).optional(),
  metadata: FlatMetadataSchema.default({}),
} as const;

export const HyperliquidMarketSampleSchema = z
  .object({
    ...sampleEnvelope,
    source: z.literal('hyperliquid'),
    sampleId: z.string().min(1),
    instrumentId: z.string().min(1).optional(),
    symbol: AssetSchema,
    markPrice: PriceSchema,
    volume24hUsd: NonNegativeMoneySchema,
    volumeWindowMinutes: z.literal(1_440).optional(),
    fundingRate: z.number().finite(),
    fundingIntervalHours: z.number().finite().positive().optional(),
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
    conditionId: z.string().min(1).optional(),
    outcomeTokenId: z.string().min(1).optional(),
    question: z.string().min(1),
    relevantAsset: AssetSchema,
    outcome: z.string().min(1),
    probability: z.number().finite().min(0).max(1),
    oddsDecimal: z.number().finite().min(1).optional(),
    probabilityChange24h: z.number().finite().min(-1).max(1),
    probabilityChangeWindowMinutes: z.literal(1_440).optional(),
    liquidityUsd: NonNegativeMoneySchema,
  })
  .strict();
export type PolymarketMarketSample = z.infer<typeof PolymarketMarketSampleSchema>;

export const NormalizedMarketSampleSchema = z.discriminatedUnion('source', [
  HyperliquidMarketSampleSchema,
  PolymarketMarketSampleSchema,
]);
export type NormalizedMarketSample = z.infer<typeof NormalizedMarketSampleSchema>;
