import type { Mandate, SignalEvidence } from '@pocketpilot/shared';

import type { InvestorSkill } from '../skill/schema.js';

export const REASONING_PROMPT_VERSION = 'pocketpilot-reasoning-v1';

export interface ReasoningEvidenceItem {
  id: string;
  source: 'hyperliquid' | 'polymarket';
  sourceTimestamp: string;
  facts: Record<string, string | number>;
}

export interface ReasoningContext {
  promptVersion: typeof REASONING_PROMPT_VERSION;
  skill: {
    id: string;
    version: number;
    description: string;
    relevantInstructions: {
      proposalDefaults: InvestorSkill['proposal']['defaults'];
      proposalBounds: InvestorSkill['proposal']['bounds'];
      expiryMinutes: number;
      invalidationGuidance: string[];
    };
  };
  candidate: {
    asset: string;
    direction: 'LONG' | 'SHORT';
    executionVenue: 'hyperliquid';
    normalizedFeatures: Record<string, number | null>;
    triggeredRules: NonNullable<SignalEvidence['featureSnapshot']>['ruleEvaluations'];
  };
  evidence: ReasoningEvidenceItem[];
  mandate: {
    version: number;
    allowedAssets: Mandate['allowedAssets'];
    allowedVenues: Mandate['allowedVenues'];
    maxPositionUsd: number;
    maxLeverage: number;
    stopLossRequired: boolean;
    approvalRequired: boolean;
    maxExpiryMinutes: number;
  };
}

export const REASONING_INSTRUCTIONS = `You are an evidence-bound trade analyst inside pocketpilot.
Analyze only the supplied structured candidate. State a concise thesis, why now, counter-evidence or uncertainty, invalidation conditions, and advisory trade parameters.
Every evidenceReferences entry must exactly match an ID supplied in evidence. Never invent evidence, market facts, assets, venues, timestamps, or IDs.
Return NO_TRADE when evidence is inadequate, contradictory, stale, or cannot support grounded parameters. For NO_TRADE, all advisory numeric parameters and expiryMinutes must be null.
You cannot approve, authorize, sign, submit, or execute a trade. Deterministic software independently validates every field and owns all policy and lifecycle decisions.`;

export const AGENT_DECISION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'decision',
    'asset',
    'direction',
    'venue',
    'thesis',
    'whyNow',
    'evidenceReferences',
    'counterEvidence',
    'confidence',
    'proposedNotionalUsd',
    'leverage',
    'entryReference',
    'stopLoss',
    'invalidationConditions',
    'expiryMinutes',
  ],
  properties: {
    schemaVersion: { type: 'integer', enum: [1] },
    decision: { type: 'string', enum: ['PROPOSE', 'NO_TRADE'] },
    asset: { type: 'string', enum: ['BTC', 'ETH'] },
    direction: { type: 'string', enum: ['LONG', 'SHORT'] },
    venue: { type: 'string', enum: ['hyperliquid'] },
    thesis: { type: 'string', minLength: 10, maxLength: 500 },
    whyNow: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: { type: 'string', minLength: 1, maxLength: 240 },
    },
    evidenceReferences: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    counterEvidence: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: { type: 'string', minLength: 1, maxLength: 240 },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    proposedNotionalUsd: { anyOf: [{ type: 'number', exclusiveMinimum: 0 }, { type: 'null' }] },
    leverage: { anyOf: [{ type: 'number', exclusiveMinimum: 0 }, { type: 'null' }] },
    entryReference: { anyOf: [{ type: 'number', exclusiveMinimum: 0 }, { type: 'null' }] },
    stopLoss: { anyOf: [{ type: 'number', exclusiveMinimum: 0 }, { type: 'null' }] },
    invalidationConditions: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: { type: 'string', minLength: 1, maxLength: 240 },
    },
    expiryMinutes: {
      anyOf: [{ type: 'integer', minimum: 1, maximum: 60 }, { type: 'null' }],
    },
  },
} as const;

export function buildReasoningContext(input: {
  skill: InvestorSkill;
  mandate: Mandate;
  asset: string;
  direction: 'LONG' | 'SHORT';
  evidence: SignalEvidence;
}): ReasoningContext {
  const featureSnapshot = input.evidence.featureSnapshot;
  if (!featureSnapshot) throw new Error('Candidate has no normalized feature snapshot');

  const evidence: ReasoningEvidenceItem[] = [
    ...input.evidence.hyperliquid.map((sample) => ({
      id: `hl:${sample.sampleId}`,
      source: 'hyperliquid' as const,
      sourceTimestamp: sample.sourceTimestamp,
      facts: {
        symbol: sample.symbol,
        markPrice: sample.markPrice,
        volume24hUsd: sample.volume24hUsd,
        fundingRate: sample.fundingRate,
        openInterestUsd: sample.openInterestUsd,
      },
    })),
    ...input.evidence.polymarket.map((sample) => ({
      id: `pm:${sample.marketId}:${sample.sourceEventId ?? sample.eventId}`,
      source: 'polymarket' as const,
      sourceTimestamp: sample.sourceTimestamp,
      facts: {
        relevantAsset: sample.relevantAsset,
        question: sample.question,
        outcome: sample.outcome,
        probability: sample.probability,
        probabilityChange24h: sample.probabilityChange24h,
        liquidityUsd: sample.liquidityUsd,
      },
    })),
  ];

  return {
    promptVersion: REASONING_PROMPT_VERSION,
    skill: {
      id: input.skill.id,
      version: input.skill.version,
      description: input.skill.description,
      relevantInstructions: {
        proposalDefaults: input.skill.proposal.defaults,
        proposalBounds: input.skill.proposal.bounds,
        expiryMinutes: input.skill.proposal.expiry_minutes,
        invalidationGuidance: input.skill.invalidation_guidance,
      },
    },
    candidate: {
      asset: input.asset,
      direction: input.direction,
      executionVenue: 'hyperliquid',
      normalizedFeatures: featureSnapshot.values,
      triggeredRules: featureSnapshot.ruleEvaluations,
    },
    evidence,
    mandate: {
      version: input.mandate.version,
      allowedAssets: input.mandate.allowedAssets,
      allowedVenues: input.mandate.allowedVenues,
      maxPositionUsd: input.mandate.riskLimits.maxPositionUsd,
      maxLeverage: input.mandate.riskLimits.maxLeverage,
      stopLossRequired: input.mandate.riskLimits.stopLossRequired,
      approvalRequired: input.mandate.riskLimits.approvalRequired,
      maxExpiryMinutes: Math.min(
        input.skill.proposal.expiry_minutes,
        input.mandate.riskLimits.signalExpiryMinutes,
      ),
    },
  };
}
