import type {
  LlmReasoningProposal,
  RiskPreview,
  SignalEvidence,
  SignalState,
  SignalTimelineEntry,
} from '@pocketpilot/shared';

import { closeDatabase, db } from './client.js';
import { mandates, signals } from './schema.js';

export const DEMO_MANDATE_ID = '10000000-0000-4000-8000-000000000001';

const SIGNAL_IDS = {
  btcApproval: '20000000-0000-4000-8000-000000000001',
  ethApproval: '20000000-0000-4000-8000-000000000002',
  btcMonitoring: '20000000-0000-4000-8000-000000000003',
  ethExecuted: '20000000-0000-4000-8000-000000000004',
  btcExpired: '20000000-0000-4000-8000-000000000005',
} as const;

const demoMandate = {
  id: DEMO_MANDATE_ID,
  agentName: 'pocketpilot Demo Agent',
  skillSlug: 'cross-market-catalyst',
  allowedAssets: ['BTC', 'ETH'] as string[],
  allowedVenues: ['hyperliquid'] as string[],
  maxPositionUsd: 100,
  maxLeverage: 3,
  maxDailyLossUsd: 25,
  stopLossRequired: true,
  approvalRequired: true,
  signalExpiryMinutes: 10,
  killSwitchEnabled: false,
  version: 1,
};

const iso = (date: Date): string => date.toISOString();
const offset = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60_000);

function timeline(createdAt: Date, steps: Array<[SignalState, string]>): SignalTimelineEntry[] {
  return steps.map(([toState, reason], index) => ({
    fromState: index === 0 ? null : (steps[index - 1]?.[0] ?? null),
    toState,
    occurredAt: iso(offset(createdAt, index * 0.2)),
    reason,
    metadata: { source: 'phase-2-seed' },
  }));
}

function evidence(
  symbol: 'BTC' | 'ETH',
  at: Date,
  markPrice: number,
  probability: number,
  probabilityChange24h: number,
  question: string,
): SignalEvidence {
  const timestamp = iso(at);
  return {
    capturedAt: timestamp,
    hyperliquid: [
      {
        source: 'hyperliquid',
        sampleId: `hl-${symbol.toLowerCase()}-${at.getTime()}`,
        symbol,
        markPrice,
        volume24hUsd: symbol === 'BTC' ? 1_860_000_000 : 940_000_000,
        fundingRate: symbol === 'BTC' ? 0.000084 : -0.000021,
        openInterestUsd: symbol === 'BTC' ? 4_920_000_000 : 2_310_000_000,
        sourceTimestamp: timestamp,
        ingestedAt: timestamp,
        metadata: { mode: 'seeded-replay', venue: 'Hyperliquid' },
      },
    ],
    polymarket: [
      {
        source: 'polymarket',
        marketId: `pm-${symbol.toLowerCase()}-catalyst`,
        eventId: `pm-event-${symbol.toLowerCase()}`,
        question,
        relevantAsset: symbol,
        outcome: 'Yes',
        probability,
        probabilityChange24h,
        liquidityUsd: symbol === 'BTC' ? 684_000 : 292_000,
        sourceTimestamp: timestamp,
        ingestedAt: timestamp,
        metadata: { mode: 'seeded-replay', venue: 'Polymarket' },
      },
    ],
  };
}

function proposal(input: {
  side: 'LONG' | 'SHORT';
  title: string;
  thesis: string;
  confidence: number;
  entry: number;
  notional: number;
  leverage: number;
  stop: number;
  expiresAt: Date;
  evidenceIds: [string, string];
  whyNow: string[];
  invalidation: string[];
}): LlmReasoningProposal {
  return {
    schemaVersion: 1,
    decision: input.side === 'LONG' ? 'PROPOSE_LONG' : 'PROPOSE_SHORT',
    title: input.title,
    thesis: input.thesis,
    whyNow: input.whyNow,
    evidenceReferences: input.evidenceIds,
    uncertainty: [
      'Seeded evidence is a development snapshot, not a live price feed.',
      'Cross-market repricing can reverse before the proposal expires.',
    ],
    invalidation: input.invalidation,
    confidence: input.confidence,
    proposedTrade: {
      side: input.side,
      entryPrice: input.entry,
      notionalUsd: input.notional,
      leverage: input.leverage,
      stopLossPrice: input.stop,
      expiresAt: iso(input.expiresAt),
    },
  };
}

function riskPreview(at: Date): RiskPreview {
  return {
    allowed: true,
    checkedAt: iso(at),
    messages: [
      'Proposed notional is within the $100 mandate maximum.',
      'Leverage is at or below the 3x maximum.',
      'A stop-loss is present and explicit approval is required.',
    ],
  };
}

function evidenceReferences(value: SignalEvidence): [string, string] {
  const hyperliquid = value.hyperliquid[0];
  const polymarket = value.polymarket[0];
  if (!hyperliquid || !polymarket) throw new Error('Seed evidence must include both sources');
  return [hyperliquid.sampleId, polymarket.marketId];
}

function makeSignal(input: {
  id: string;
  symbol: 'BTC' | 'ETH';
  side: 'LONG' | 'SHORT';
  state: SignalState;
  createdAt: Date;
  expiresAt: Date;
  marketSnapshot: SignalEvidence;
  proposal: LlmReasoningProposal;
  triggeredRules: string[];
  notional: number;
  leverage: number;
  stop: number;
  steps: Array<[SignalState, string]>;
  preview?: boolean;
}): typeof signals.$inferInsert {
  return {
    id: input.id,
    mandateId: DEMO_MANDATE_ID,
    symbol: input.symbol,
    side: input.side,
    state: input.state,
    dataMode: 'replay',
    marketSnapshot: input.marketSnapshot,
    triggeredRules: input.triggeredRules,
    llmOutput: input.proposal,
    riskPreview: input.preview === false ? null : riskPreview(offset(input.createdAt, 0.7)),
    proposedNotionalUsd: input.notional,
    proposedLeverage: input.leverage,
    stopLossPrice: input.stop,
    expiresAt: input.expiresAt,
    timeline: timeline(input.createdAt, input.steps),
    createdAt: input.createdAt,
    updatedAt: offset(input.createdAt, Math.max(0.2, input.steps.length * 0.2)),
  };
}

function demoSignals(now: Date): Array<typeof signals.$inferInsert> {
  const btcCreated = offset(now, -3);
  const btcExpiry = offset(now, 7);
  const btcEvidence = evidence(
    'BTC',
    offset(btcCreated, 0.5),
    64_180,
    0.71,
    0.12,
    'Will Bitcoin trade above $68,000 before month-end?',
  );
  const btcProposal = proposal({
    side: 'LONG',
    title: 'BTC demand confirms a cross-market breakout',
    thesis:
      'Rising perpetual participation and a sharp repricing in Bitcoin prediction odds point to aligned near-term demand rather than an isolated price spike.',
    confidence: 0.78,
    entry: 64_180,
    notional: 100,
    leverage: 2,
    stop: 62_850,
    expiresAt: btcExpiry,
    evidenceIds: evidenceReferences(btcEvidence),
    whyNow: [
      'Hyperliquid volume and open interest expanded while funding stayed below crowded-long extremes.',
      'Polymarket odds for BTC above $68k rose 12 points in 24 hours with $684k of liquidity.',
      'Both venues repriced in the same direction inside the skill confirmation window.',
    ],
    invalidation: [
      'BTC trades at or below $62,850.',
      'Prediction odds fall below 60% before approval.',
      'The proposal reaches its expiry without explicit approval.',
    ],
  });

  const ethCreated = offset(now, -2);
  const ethExpiry = offset(now, 8);
  const ethEvidence = evidence(
    'ETH',
    ethCreated,
    3_420,
    0.42,
    -0.09,
    'Will ETH remain below $3,500 through Friday?',
  );
  const ethProposal = proposal({
    side: 'SHORT',
    title: 'ETH downside hedge as event odds soften',
    thesis:
      'Negative prediction-market repricing and subdued perpetual funding favor a small tactical short.',
    confidence: 0.66,
    entry: 3_420,
    notional: 75,
    leverage: 1.5,
    stop: 3_505,
    expiresAt: ethExpiry,
    evidenceIds: evidenceReferences(ethEvidence),
    whyNow: ['Odds moved nine points against the bullish outcome while perpetual demand softened.'],
    invalidation: ['ETH trades above $3,505.', 'Prediction odds reverse above 52%.'],
  });

  const monitoringCreated = offset(now, -14);
  const monitoringExpiry = offset(now, 20);
  const monitoringEvidence = evidence(
    'BTC',
    monitoringCreated,
    63_740,
    0.58,
    0.04,
    'Will Bitcoin trade above $68,000 before month-end?',
  );
  const monitoringProposal = proposal({
    side: 'LONG',
    title: 'BTC confirmation is still developing',
    thesis:
      'Price participation is constructive, but prediction-market movement has not crossed the approval threshold.',
    confidence: 0.54,
    entry: 63_740,
    notional: 60,
    leverage: 1,
    stop: 62_900,
    expiresAt: monitoringExpiry,
    evidenceIds: evidenceReferences(monitoringEvidence),
    whyNow: ['Open interest is rising, while the confirming probability move remains modest.'],
    invalidation: ['Open interest contracts by more than 4%.'],
  });

  const executedCreated = offset(now, -88);
  const executedExpiry = offset(executedCreated, 10);
  const executedEvidence = evidence(
    'ETH',
    executedCreated,
    3_365,
    0.64,
    0.1,
    'Will ETH trade above $3,400 this week?',
  );
  const executedProposal = proposal({
    side: 'LONG',
    title: 'ETH breakout confirmation filled',
    thesis: 'A liquid event-market repricing confirmed improving perpetual demand.',
    confidence: 0.73,
    entry: 3_365,
    notional: 80,
    leverage: 2,
    stop: 3_290,
    expiresAt: executedExpiry,
    evidenceIds: evidenceReferences(executedEvidence),
    whyNow: ['Volume expansion arrived with a ten-point probability increase.'],
    invalidation: ['ETH trades below $3,290.'],
  });

  const expiredCreated = offset(now, -42);
  const expiredAt = offset(expiredCreated, 10);
  const expiredEvidence = evidence(
    'BTC',
    expiredCreated,
    63_210,
    0.55,
    0.06,
    'Will Bitcoin trade above $66,000 this week?',
  );
  const expiredProposal = proposal({
    side: 'LONG',
    title: 'BTC momentum proposal expired',
    thesis: 'A prior momentum window aligned across venues but was not approved in time.',
    confidence: 0.61,
    entry: 63_210,
    notional: 90,
    leverage: 2,
    stop: 62_300,
    expiresAt: expiredAt,
    evidenceIds: evidenceReferences(expiredEvidence),
    whyNow: ['The original confirmation window lasted ten minutes.'],
    invalidation: ['Proposal expiry elapsed.'],
  });

  const proposedSteps: Array<[SignalState, string]> = [
    ['DETECTED', 'Seeded cross-market rules matched'],
    ['ANALYZING', 'Seeded evidence entered proposal analysis'],
    ['PROPOSED', 'Structured seeded proposal validated'],
  ];
  const pendingSteps: Array<[SignalState, string]> = [
    ...proposedSteps,
    ['PENDING_APPROVAL', 'Mandate preview passed; explicit approval required'],
  ];

  return [
    makeSignal({
      id: SIGNAL_IDS.btcApproval,
      symbol: 'BTC',
      side: 'LONG',
      state: 'PENDING_APPROVAL',
      createdAt: btcCreated,
      expiresAt: btcExpiry,
      marketSnapshot: btcEvidence,
      proposal: btcProposal,
      triggeredRules: [
        'Hyperliquid open interest expansion exceeds 5%',
        '24h volume is above the skill participation floor',
        'Polymarket probability increased at least 10 points',
        'Cross-market direction agrees inside 15 minutes',
      ],
      notional: 100,
      leverage: 2,
      stop: 62_850,
      steps: pendingSteps,
    }),
    makeSignal({
      id: SIGNAL_IDS.ethApproval,
      symbol: 'ETH',
      side: 'SHORT',
      state: 'PENDING_APPROVAL',
      createdAt: ethCreated,
      expiresAt: ethExpiry,
      marketSnapshot: ethEvidence,
      proposal: ethProposal,
      triggeredRules: ['Probability reversal exceeds 8 points', 'Perpetual demand is weakening'],
      notional: 75,
      leverage: 1.5,
      stop: 3_505,
      steps: pendingSteps,
    }),
    makeSignal({
      id: SIGNAL_IDS.btcMonitoring,
      symbol: 'BTC',
      side: 'LONG',
      state: 'PROPOSED',
      createdAt: monitoringCreated,
      expiresAt: monitoringExpiry,
      marketSnapshot: monitoringEvidence,
      proposal: monitoringProposal,
      triggeredRules: ['Open interest expansion detected', 'Awaiting probability confirmation'],
      notional: 60,
      leverage: 1,
      stop: 62_900,
      steps: proposedSteps,
      preview: false,
    }),
    makeSignal({
      id: SIGNAL_IDS.ethExecuted,
      symbol: 'ETH',
      side: 'LONG',
      state: 'FILLED',
      createdAt: executedCreated,
      expiresAt: executedExpiry,
      marketSnapshot: executedEvidence,
      proposal: executedProposal,
      triggeredRules: ['Volume expansion exceeds 1.4x', 'Prediction probability rose 10 points'],
      notional: 80,
      leverage: 2,
      stop: 3_290,
      steps: [
        ...pendingSteps,
        ['APPROVED', 'Historical demo approval recorded'],
        ['EXECUTING', 'Historical paper execution started'],
        ['FILLED', 'Historical paper fill recorded for inbox demonstration'],
      ],
    }),
    makeSignal({
      id: SIGNAL_IDS.btcExpired,
      symbol: 'BTC',
      side: 'LONG',
      state: 'EXPIRED',
      createdAt: expiredCreated,
      expiresAt: expiredAt,
      marketSnapshot: expiredEvidence,
      proposal: expiredProposal,
      triggeredRules: ['Short-term volume acceleration', 'Prediction probability confirmation'],
      notional: 90,
      leverage: 2,
      stop: 62_300,
      steps: [...pendingSteps, ['EXPIRED', 'No approval arrived before the ten-minute deadline']],
    }),
  ];
}

async function seed(): Promise<void> {
  await db
    .insert(mandates)
    .values(demoMandate)
    .onConflictDoUpdate({
      target: mandates.id,
      set: { ...demoMandate, updatedAt: new Date() },
    });

  for (const signal of demoSignals(new Date())) {
    await db
      .insert(signals)
      .values(signal)
      .onConflictDoUpdate({
        target: signals.id,
        set: { ...signal, updatedAt: signal.updatedAt ?? new Date() },
      });
  }

  console.log(
    `Seeded demo mandate ${DEMO_MANDATE_ID} and ${Object.keys(SIGNAL_IDS).length} signals`,
  );
}

seed()
  .catch((error: unknown) => {
    console.error('Failed to seed Phase 2 demo data', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
