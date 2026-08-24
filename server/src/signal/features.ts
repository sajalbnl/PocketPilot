import type { Asset, HyperliquidMarketSample, PolymarketMarketSample } from '@pocketpilot/shared';

import { featureNames, type FeatureName, type InvestorSkill } from '../skill/schema.js';

export type FeatureValues = Record<FeatureName, number | null>;

export interface FeatureSnapshot {
  asset: Asset;
  asOf: string;
  windowStart: string;
  windowId: string;
  values: FeatureValues;
  missingFeatures: FeatureName[];
  hyperliquidEvidence: HyperliquidMarketSample[];
  polymarketEvidence: PolymarketMarketSample[];
}

function timestamp(sample: { sourceTimestamp: string }): number {
  return new Date(sample.sourceTimestamp).getTime();
}

function round(value: number): number {
  return Number(value.toFixed(10));
}

function percentChange(first: number, last: number): number | null {
  return first === 0 ? null : round(((last - first) / first) * 100);
}

export function calculateFeatureSnapshot(input: {
  skill: InvestorSkill;
  asset: Asset;
  asOf: Date;
  replayId: string;
  hyperliquid: readonly HyperliquidMarketSample[];
  polymarket: readonly PolymarketMarketSample[];
}): FeatureSnapshot {
  const windowMinutes = Math.max(
    ...Object.values(input.skill.features).map((definition) => definition.window_minutes),
  );
  const windowStartMs = input.asOf.getTime() - windowMinutes * 60_000;
  const asOfMs = input.asOf.getTime();
  const inWindow = (sample: { sourceTimestamp: string }): boolean => {
    const time = timestamp(sample);
    return time >= windowStartMs && time <= asOfMs;
  };
  const byTime = <T extends { sourceTimestamp: string; sourceEventId?: string | undefined }>(
    a: T,
    b: T,
  ) => timestamp(a) - timestamp(b) || (a.sourceEventId ?? '').localeCompare(b.sourceEventId ?? '');

  const hyperliquid = input.hyperliquid
    .filter((sample) => sample.symbol === input.asset && inWindow(sample))
    .sort(byTime);
  const relevantPolymarket = input.polymarket
    .filter((sample) => sample.relevantAsset === input.asset && inWindow(sample))
    .sort(byTime);
  const latestMarketId = relevantPolymarket.at(-1)?.marketId;
  const polymarket = relevantPolymarket.filter((sample) => sample.marketId === latestMarketId);
  const firstHl = hyperliquid[0];
  const lastHl = hyperliquid.at(-1);
  const firstPm = polymarket[0];
  const lastPm = polymarket.at(-1);

  const enoughEvidence =
    hyperliquid.length >= input.skill.evidence.minimum_hyperliquid_samples &&
    polymarket.length >= input.skill.evidence.minimum_polymarket_samples;
  const sourceRecencySeconds =
    lastHl && lastPm
      ? round(Math.max(asOfMs - timestamp(lastHl), asOfMs - timestamp(lastPm)) / 1_000)
      : null;

  const values: FeatureValues = {
    price_return_pct: firstHl && lastHl ? percentChange(firstHl.markPrice, lastHl.markPrice) : null,
    volume_ratio:
      firstHl && lastHl && firstHl.volume24hUsd !== 0
        ? round(lastHl.volume24hUsd / firstHl.volume24hUsd)
        : null,
    funding_rate: lastHl?.fundingRate ?? null,
    funding_change_bps:
      firstHl && lastHl ? round((lastHl.fundingRate - firstHl.fundingRate) * 10_000) : null,
    open_interest_change_pct:
      firstHl && lastHl ? percentChange(firstHl.openInterestUsd, lastHl.openInterestUsd) : null,
    polymarket_probability_change_points:
      firstPm && lastPm ? round((lastPm.probability - firstPm.probability) * 100) : null,
    polymarket_liquidity_usd: lastPm?.liquidityUsd ?? null,
    source_recency_seconds: sourceRecencySeconds,
    evidence_completeness: 0,
  };
  const missingBeforeCompleteness = featureNames.filter(
    (name) => name !== 'evidence_completeness' && values[name] === null,
  );
  values.evidence_completeness = enoughEvidence && missingBeforeCompleteness.length === 0 ? 1 : 0;
  const missingFeatures = featureNames.filter(
    (name) => values[name] === null || (name === 'evidence_completeness' && values[name] !== 1),
  );
  const asOf = input.asOf.toISOString();

  return {
    asset: input.asset,
    asOf,
    windowStart: new Date(windowStartMs).toISOString(),
    windowId: `${input.replayId}:${asOf}`,
    values,
    missingFeatures,
    hyperliquidEvidence: hyperliquid,
    polymarketEvidence: polymarket,
  };
}
