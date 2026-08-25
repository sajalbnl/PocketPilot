import {
  HyperliquidMarketSampleSchema,
  PolymarketMarketSampleSchema,
  type NormalizedMarketSample,
} from '@pocketpilot/shared';

import type { RawMarketEvent } from './raw-events.js';

function finiteNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a finite numeric string`);
  return parsed;
}

export function normalizeMarketEvent(event: RawMarketEvent): NormalizedMarketSample {
  if (event.source === 'hyperliquid') {
    const openInterestCoins = finiteNumber(event.payload.openInterest, 'openInterest');
    const markPrice = finiteNumber(event.payload.markPx, 'markPx');
    return HyperliquidMarketSampleSchema.parse({
      source: 'hyperliquid',
      sourceEventId: event.payload.eventId,
      sampleId: event.payload.eventId,
      instrumentId: event.payload.coin,
      symbol: event.payload.coin,
      markPrice,
      volume24hUsd: finiteNumber(event.payload.dayNtlVlm, 'dayNtlVlm'),
      volumeWindowMinutes: 1_440,
      fundingRate: finiteNumber(event.payload.funding, 'funding'),
      fundingIntervalHours: 8,
      openInterestUsd: openInterestCoins * markPrice,
      sourceTimestamp: event.sourceTimestamp,
      ingestedAt: event.ingestedAt,
      metadata: {
        channel: event.channel,
        normalizedContractVersion: 1,
        ...(event.payload.sourceSymbol ? { sourceSymbol: event.payload.sourceSymbol } : {}),
        ...(event.payload.timestampSource
          ? { timestampSource: event.payload.timestampSource }
          : {}),
      },
    });
  }

  const probability = finiteNumber(event.payload.price, 'price');
  return PolymarketMarketSampleSchema.parse({
    source: 'polymarket',
    sourceEventId: event.payload.eventId,
    marketId: event.payload.market,
    eventId: event.payload.event_id,
    conditionId: event.payload.condition_id,
    outcomeTokenId: event.payload.asset_id,
    question: event.payload.question,
    relevantAsset: event.payload.relevant_asset,
    outcome: event.payload.outcome,
    probability,
    oddsDecimal: 1 / probability,
    probabilityChange24h: finiteNumber(event.payload.price_change_24h, 'price_change_24h'),
    probabilityChangeWindowMinutes: 1_440,
    liquidityUsd: finiteNumber(event.payload.liquidity, 'liquidity'),
    sourceTimestamp: event.sourceTimestamp,
    ingestedAt: event.ingestedAt,
    metadata: {
      channel: event.channel,
      normalizedContractVersion: 1,
      ...(event.payload.mapping_meaning ? { mappingMeaning: event.payload.mapping_meaning } : {}),
      ...(event.payload.timestamp_source
        ? { timestampSource: event.payload.timestamp_source }
        : {}),
    },
  });
}
