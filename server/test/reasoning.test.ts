import type { Mandate } from '@pocketpilot/shared';
import { describe, expect, it } from 'vitest';

import { normalizeMarketEvent } from '../src/market/normalize.js';
import { ReplayFixtureSource } from '../src/replay/fixture-source.js';
import { FixtureReasoningProvider } from '../src/reasoning/fixture-provider.js';
import { buildReasoningContext } from '../src/reasoning/prompt-v1.js';
import { generateValidatedDecision } from '../src/reasoning/service.js';
import { parseAndValidateDecision, ReasoningValidationError } from '../src/reasoning/validate.js';
import { evaluateSkill } from '../src/signal/evaluate.js';
import { calculateFeatureSnapshot } from '../src/signal/features.js';
import { loadInvestorSkill } from '../src/skill/loader.js';

const mandate: Mandate = {
  id: '10000000-0000-4000-8000-000000000001',
  agentName: 'Test Agent',
  skillSlug: 'cross-market-catalyst',
  allowedAssets: ['BTC', 'ETH'],
  allowedVenues: ['hyperliquid'],
  riskLimits: {
    maxPositionUsd: 100,
    maxLeverage: 3,
    maxDailyLossUsd: 25,
    stopLossRequired: true,
    approvalRequired: true,
    signalExpiryMinutes: 10,
  },
  killSwitchEnabled: false,
  version: 1,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

async function contextFixture() {
  const [skill, source] = await Promise.all([
    loadInvestorSkill(),
    ReplayFixtureSource.open('btc-trigger'),
  ]);
  const normalized = (await source.load()).map(normalizeMarketEvent);
  const snapshot = calculateFeatureSnapshot({
    skill,
    asset: 'BTC',
    asOf: new Date('2025-05-23T10:05:00.000Z'),
    replayId: source.id,
    hyperliquid: normalized.filter((sample) => sample.source === 'hyperliquid'),
    polymarket: normalized.filter((sample) => sample.source === 'polymarket'),
  });
  const candidate = evaluateSkill(skill, snapshot, source.id).candidate;
  if (!candidate) throw new Error('Trigger fixture did not produce a candidate');
  return buildReasoningContext({
    skill,
    mandate,
    asset: candidate.symbol,
    direction: candidate.side,
    evidence: candidate.evidence,
  });
}

function noTrade(context: Awaited<ReturnType<typeof contextFixture>>) {
  return JSON.stringify({
    schemaVersion: 1,
    decision: 'NO_TRADE',
    asset: 'BTC',
    direction: 'LONG',
    venue: 'hyperliquid',
    thesis: 'The bounded evidence is not sufficient to justify a trade proposal.',
    whyNow: ['The candidate deserves analysis but not authorization.'],
    evidenceReferences: [context.evidence[0]?.id],
    counterEvidence: ['The confirmation window may be too short.'],
    confidence: 0.35,
    proposedNotionalUsd: null,
    leverage: null,
    entryReference: null,
    stopLoss: null,
    invalidationConditions: ['Wait for a new complete confirmation window.'],
    expiryMinutes: null,
  });
}

describe('reasoning boundary', () => {
  it('accepts deterministic fixture PROPOSE and valid NO_TRADE outputs', async () => {
    const context = await contextFixture();
    const proposed = await generateValidatedDecision(new FixtureReasoningProvider(), context);
    expect(proposed.decision.decision).toBe('PROPOSE');
    expect(proposed.decision.evidenceReferences).toEqual(context.evidence.map((item) => item.id));
    expect(parseAndValidateDecision(noTrade(context), context).decision).toBe('NO_TRADE');
  });

  it('rejects malformed JSON, schema failures, and nonexistent evidence references', async () => {
    const context = await contextFixture();
    expect(() => parseAndValidateDecision('{broken', context)).toThrowError(
      new ReasoningValidationError('MALFORMED_JSON', 'Model output was not valid JSON'),
    );
    expect(() =>
      parseAndValidateDecision(JSON.stringify({ decision: 'PROPOSE' }), context),
    ).toThrow(/failed schema/u);

    const valid = await new FixtureReasoningProvider().generate({ instructions: '', context });
    const invented = JSON.stringify({
      ...(JSON.parse(valid.rawText) as Record<string, unknown>),
      evidenceReferences: ['invented-evidence-id'],
    });
    expect(() => parseAndValidateDecision(invented, context)).toThrow(/unknown evidence ID/u);

    const nonFinite = valid.rawText.replace(
      '"proposedNotionalUsd":100',
      '"proposedNotionalUsd":1e999',
    );
    expect(() => parseAndValidateDecision(nonFinite, context)).toThrow(/failed schema/u);
  });

  it('enforces mandate allowlists and the candidate-specific expiry bound', async () => {
    const context = await contextFixture();
    const valid = await new FixtureReasoningProvider().generate({ instructions: '', context });
    expect(() =>
      parseAndValidateDecision(valid.rawText, {
        ...context,
        mandate: { ...context.mandate, allowedAssets: ['ETH'] },
      }),
    ).toThrow(/outside the mandate/u);
    const tooLong = JSON.stringify({
      ...(JSON.parse(valid.rawText) as Record<string, unknown>),
      expiryMinutes: 11,
    });
    expect(() => parseAndValidateDecision(tooLong, context)).toThrow(/expiry exceeds/u);
  });

  it('allows exactly one controlled repair and rejects a second invalid result', async () => {
    const context = await contextFixture();
    const repaired = await generateValidatedDecision(
      new FixtureReasoningProvider(['not json', noTrade(context)]),
      context,
    );
    expect(repaired.metadata.attempts).toBe(2);
    await expect(
      generateValidatedDecision(new FixtureReasoningProvider(['bad one', 'bad two']), context),
    ).rejects.toMatchObject({ code: 'MALFORMED_JSON' });
  });
});
