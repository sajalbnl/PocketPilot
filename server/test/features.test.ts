import type { HyperliquidMarketSample, PolymarketMarketSample } from '@pocketpilot/shared';
import { describe, expect, it } from 'vitest';

import { normalizeMarketEvent } from '../src/market/normalize.js';
import { ReplayFixtureSource } from '../src/replay/fixture-source.js';
import { loadInvestorSkill } from '../src/skill/loader.js';
import { evaluateSkill } from '../src/signal/evaluate.js';
import { calculateFeatureSnapshot } from '../src/signal/features.js';

async function triggerSnapshot() {
  const [skill, source] = await Promise.all([
    loadInvestorSkill(),
    ReplayFixtureSource.open('btc-trigger'),
  ]);
  const normalized = (await source.load()).map(normalizeMarketEvent);
  const hyperliquid = normalized.filter(
    (sample): sample is HyperliquidMarketSample => sample.source === 'hyperliquid',
  );
  const polymarket = normalized.filter(
    (sample): sample is PolymarketMarketSample => sample.source === 'polymarket',
  );
  const snapshot = calculateFeatureSnapshot({
    skill,
    asset: 'BTC',
    asOf: new Date('2025-05-23T10:05:00.000Z'),
    replayId: source.id,
    hyperliquid,
    polymarket,
  });
  return { skill, source, snapshot };
}

describe('deterministic feature calculation', () => {
  it('calculates documented values from fixed source-shaped fixtures', async () => {
    const { snapshot } = await triggerSnapshot();
    expect(snapshot.values).toEqual({
      price_return_pct: 1.5384615385,
      volume_ratio: 1.6,
      funding_rate: 0.00015,
      funding_change_bps: 0.5,
      open_interest_change_pct: 3.2307692308,
      polymarket_probability_change_points: 9,
      polymarket_liquidity_usd: 300000,
      source_recency_seconds: 0,
      evidence_completeness: 1,
    });
    expect(snapshot.missingFeatures).toEqual([]);
  });

  it('passes exact inclusive boundaries and fails immediately below one', async () => {
    const { skill, source, snapshot } = await triggerSnapshot();
    const boundary = {
      ...snapshot,
      values: {
        ...snapshot.values,
        price_return_pct: 1,
        volume_ratio: 1.5,
        funding_rate: 0.0005,
        open_interest_change_pct: 2,
        polymarket_probability_change_points: 8,
        polymarket_liquidity_usd: 100000,
        source_recency_seconds: 120,
      },
    };
    expect(evaluateSkill(skill, boundary, source.id).candidate).not.toBeNull();
    expect(
      evaluateSkill(
        skill,
        { ...boundary, values: { ...boundary.values, price_return_pct: 0.999999 } },
        source.id,
      ).candidate,
    ).toBeNull();
  });

  it('suppresses a cross-venue candidate when evidence is missing, stale, or misaligned', async () => {
    const { skill, source, snapshot } = await triggerSnapshot();
    const stalePolymarket = snapshot.polymarketEvidence.map((sample, index) => ({
      ...sample,
      sourceTimestamp: index === 0 ? '2025-05-23T10:00:00.000Z' : '2025-05-23T10:02:00.000Z',
    }));
    const stale = calculateFeatureSnapshot({
      skill,
      asset: 'BTC',
      asOf: new Date('2025-05-23T10:05:00.000Z'),
      replayId: source.id,
      hyperliquid: snapshot.hyperliquidEvidence,
      polymarket: stalePolymarket,
      freshnessSeconds: 120,
      alignmentSeconds: 120,
    });
    expect(stale.values.evidence_completeness).toBe(0);
    expect(stale.missingFeatures).toContain('evidence_completeness');
    expect(evaluateSkill(skill, stale, source.id).candidate).toBeNull();

    const missingVenue = calculateFeatureSnapshot({
      skill,
      asset: 'BTC',
      asOf: new Date('2025-05-23T10:05:00.000Z'),
      replayId: source.id,
      hyperliquid: snapshot.hyperliquidEvidence,
      polymarket: [],
    });
    expect(missingVenue.values.evidence_completeness).toBe(0);
    expect(evaluateSkill(skill, missingVenue, source.id).candidate).toBeNull();
  });
});
