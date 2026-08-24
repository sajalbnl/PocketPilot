import { describe, expect, it } from 'vitest';

import {
  ApprovalRequestSchema,
  HyperliquidMarketSampleSchema,
  LlmReasoningProposalSchema,
  MandateSchema,
  PolymarketMarketSampleSchema,
  SignalListItemSchema,
} from '../src/index.js';

const now = '2026-08-24T08:30:00.000Z';

describe('shared contracts', () => {
  it('parses the demo mandate and rejects unsupported assets', () => {
    const mandate = {
      id: '10000000-0000-4000-8000-000000000001',
      agentName: 'pocketpilot Demo Agent',
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
      createdAt: now,
      updatedAt: now,
    };

    expect(MandateSchema.parse(mandate).allowedAssets).toEqual(['BTC', 'ETH']);
    expect(MandateSchema.safeParse({ ...mandate, allowedAssets: ['SOL'] }).success).toBe(false);
  });

  it('parses normalized samples and rejects invalid probabilities', () => {
    expect(
      HyperliquidMarketSampleSchema.safeParse({
        source: 'hyperliquid',
        sampleId: 'hl-btc-1',
        sourceEventId: 'hl-event-1',
        instrumentId: 'BTC',
        symbol: 'BTC',
        markPrice: 64100,
        volume24hUsd: 1_000_000,
        volumeWindowMinutes: 1_440,
        fundingRate: 0.0001,
        fundingIntervalHours: 8,
        openInterestUsd: 500_000,
        sourceTimestamp: now,
        ingestedAt: now,
        metadata: {},
      }).success,
    ).toBe(true);

    const polymarket = {
      source: 'polymarket',
      sourceEventId: 'pm-event-1',
      marketId: 'market-1',
      eventId: 'event-1',
      conditionId: 'condition-1',
      outcomeTokenId: 'token-yes',
      question: 'Will BTC exceed $70k?',
      relevantAsset: 'BTC',
      outcome: 'Yes',
      probability: 0.62,
      oddsDecimal: 1 / 0.62,
      probabilityChange24h: 0.08,
      probabilityChangeWindowMinutes: 1_440,
      liquidityUsd: 50_000,
      sourceTimestamp: now,
      ingestedAt: now,
      metadata: {},
    };

    expect(PolymarketMarketSampleSchema.safeParse(polymarket).success).toBe(true);
    expect(
      PolymarketMarketSampleSchema.safeParse({ ...polymarket, probability: 1.2 }).success,
    ).toBe(false);
  });

  it('requires a complete structured proposal and strict approval values', () => {
    const proposal = {
      schemaVersion: 1,
      decision: 'PROPOSE_LONG',
      title: 'BTC cross-market catalyst',
      thesis: 'Prediction-market repricing confirms spot momentum.',
      whyNow: ['Volume is accelerating.'],
      evidenceReferences: ['hl-btc-1', 'market-1'],
      uncertainty: ['The move can reverse.'],
      invalidation: ['BTC trades below the stop.'],
      confidence: 0.72,
      proposedTrade: {
        side: 'LONG',
        entryPrice: 64180,
        notionalUsd: 100,
        leverage: 2,
        stopLossPrice: 62500,
        expiresAt: '2026-08-24T08:40:00.000Z',
      },
    };

    expect(LlmReasoningProposalSchema.safeParse(proposal).success).toBe(true);
    expect(LlmReasoningProposalSchema.safeParse({ ...proposal, invalidation: [] }).success).toBe(
      false,
    );
    expect(
      ApprovalRequestSchema.safeParse({
        approvalRevision: 1,
        notionalUsd: -1,
        leverage: 2,
        stopLossPrice: 62500,
      }).success,
    ).toBe(false);
  });

  it('requires confidence and a concise thesis on inbox items', () => {
    expect(
      SignalListItemSchema.safeParse({
        id: '20000000-0000-4000-8000-000000000001',
        symbol: 'BTC',
        side: 'LONG',
        state: 'PENDING_APPROVAL',
        dataMode: 'replay',
        skillId: 'cross-market-catalyst',
        skillVersion: 1,
        category: 'approval-required',
        title: 'BTC catalyst',
        thesis: 'Perpetual demand and prediction odds are repricing together.',
        confidence: 0.78,
        proposedNotionalUsd: 100,
        proposedLeverage: 2,
        expiresAt: '2026-08-24T08:40:00.000Z',
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true);
  });
});
