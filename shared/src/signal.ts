import { z } from 'zod';

import {
  AssetSchema,
  DataModeSchema,
  ExecutionVenueSchema,
  RiskCodeSchema,
  SignalStateSchema,
  TradeSideSchema,
} from './enums.js';
import { CompactErrorSchema } from './execution.js';
import { HyperliquidMarketSampleSchema, PolymarketMarketSampleSchema } from './market.js';
import {
  FlatMetadataSchema,
  PositiveMoneySchema,
  PriceSchema,
  UtcDateTimeSchema,
  UuidSchema,
} from './primitives.js';

export const SignalEvidenceSchema = z
  .object({
    capturedAt: UtcDateTimeSchema,
    hyperliquid: z.array(HyperliquidMarketSampleSchema).min(1),
    polymarket: z.array(PolymarketMarketSampleSchema).min(1),
    featureSnapshot: z
      .object({
        asOf: UtcDateTimeSchema,
        windowStart: UtcDateTimeSchema,
        windowId: z.string().min(1),
        values: z.record(z.string(), z.number().finite().nullable()),
        missingFeatures: z.array(z.string().min(1)),
        ruleEvaluations: z.array(
          z
            .object({
              ruleId: z.string().min(1),
              feature: z.string().min(1),
              operator: z.enum(['gte', 'lte', 'eq']),
              threshold: z.number().finite(),
              actual: z.number().finite().nullable(),
              passed: z.boolean(),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SignalEvidence = z.infer<typeof SignalEvidenceSchema>;

export const AgentDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    decision: z.enum(['PROPOSE', 'NO_TRADE']),
    asset: AssetSchema,
    direction: TradeSideSchema,
    venue: ExecutionVenueSchema,
    thesis: z.string().min(10).max(500),
    whyNow: z.array(z.string().min(1).max(240)).min(1).max(5),
    evidenceReferences: z.array(z.string().min(1)).min(1),
    counterEvidence: z.array(z.string().min(1).max(240)).min(1).max(5),
    confidence: z.number().finite().min(0).max(1),
    proposedNotionalUsd: PositiveMoneySchema.nullable(),
    leverage: z.number().finite().positive().nullable(),
    entryReference: PriceSchema.nullable(),
    stopLoss: PriceSchema.nullable(),
    invalidationConditions: z.array(z.string().min(1).max(240)).min(1).max(5),
    expiryMinutes: z.number().int().min(1).max(60).nullable(),
  })
  .strict()
  .superRefine((decision, context) => {
    const parameterNames = [
      'proposedNotionalUsd',
      'leverage',
      'entryReference',
      'stopLoss',
      'expiryMinutes',
    ] as const;
    const shouldBePresent = decision.decision === 'PROPOSE';
    for (const name of parameterNames) {
      if ((decision[name] !== null) !== shouldBePresent) {
        context.addIssue({
          code: 'custom',
          path: [name],
          message: shouldBePresent
            ? 'is required for a PROPOSE decision'
            : 'must be null for a NO_TRADE decision',
        });
      }
    }
  });
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

/** @deprecated Use AgentDecisionSchema. */
export const LlmDecisionOutputSchema = AgentDecisionSchema;
/** @deprecated Use AgentDecision. */
export type LlmDecisionOutput = AgentDecision;

export const ReasoningMetadataSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    attempts: z.number().int().min(1).max(2),
    generatedAt: UtcDateTimeSchema,
    providerResponseId: z.string().min(1).nullable(),
  })
  .strict();
export type ReasoningMetadata = z.infer<typeof ReasoningMetadataSchema>;

export const SignalTimelineEntrySchema = z
  .object({
    fromState: SignalStateSchema.nullable(),
    toState: SignalStateSchema,
    occurredAt: UtcDateTimeSchema,
    reason: z.string().min(1),
    metadata: FlatMetadataSchema.default({}),
  })
  .strict();
export type SignalTimelineEntry = z.infer<typeof SignalTimelineEntrySchema>;

const JsonRiskValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

export const RiskRuleResultSchema = z
  .object({
    ruleId: z.string().min(1),
    code: RiskCodeSchema,
    passed: z.boolean(),
    actual: JsonRiskValueSchema,
    limit: JsonRiskValueSchema,
    explanation: z.string().min(1),
  })
  .strict();
export type RiskRuleResult = z.infer<typeof RiskRuleResultSchema>;

export const RiskPreviewSchema = z
  .object({
    allowed: z.boolean(),
    phase: z.enum(['PRELIMINARY', 'APPROVAL']),
    checkedAt: UtcDateTimeSchema,
    rules: z.array(RiskRuleResultSchema).min(1),
  })
  .strict();
export type RiskPreview = z.infer<typeof RiskPreviewSchema>;

export const signalCategories = ['approval-required', 'monitoring', 'executed', 'expired'] as const;
export const SignalCategorySchema = z.enum(signalCategories);
export type SignalCategory = z.infer<typeof SignalCategorySchema>;

export const SignalListItemSchema = z
  .object({
    id: UuidSchema,
    symbol: AssetSchema,
    side: TradeSideSchema.nullable(),
    state: SignalStateSchema,
    dataMode: DataModeSchema,
    skillId: z.string().min(1),
    skillVersion: z.number().int().positive(),
    category: SignalCategorySchema,
    title: z.string().min(1).nullable(),
    thesis: z.string().min(1).nullable(),
    confidence: z.number().finite().min(0).max(1).nullable(),
    proposedNotionalUsd: PositiveMoneySchema.nullable(),
    proposedLeverage: z.number().finite().positive().nullable(),
    expiresAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .strict();
export type SignalListItem = z.infer<typeof SignalListItemSchema>;

export const SignalDetailSchema = SignalListItemSchema.extend({
  mandateId: UuidSchema,
  evidence: SignalEvidenceSchema.nullable(),
  triggeredRules: z.array(z.string().min(1)),
  llmOutput: AgentDecisionSchema.nullable(),
  llmMetadata: ReasoningMetadataSchema.nullable(),
  reasoningError: CompactErrorSchema.nullable(),
  riskPreview: RiskPreviewSchema.nullable(),
  stopLossPrice: PriceSchema.nullable(),
  timeline: z.array(SignalTimelineEntrySchema),
}).strict();
export type SignalDetail = z.infer<typeof SignalDetailSchema>;

export const SignalListQuerySchema = z
  .object({
    state: SignalStateSchema.optional(),
    category: SignalCategorySchema.optional(),
  })
  .strict();
export type SignalListQuery = z.infer<typeof SignalListQuerySchema>;

export const SignalListResponseSchema = z
  .object({
    signals: z.array(SignalListItemSchema),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type SignalListResponse = z.infer<typeof SignalListResponseSchema>;

export const SignalActionResultSchema = z
  .object({
    signal: SignalDetailSchema,
    executionDeferred: z.literal(true),
    message: z.string().min(1),
  })
  .strict();
export type SignalActionResult = z.infer<typeof SignalActionResultSchema>;

export const RejectSignalResultSchema = z
  .object({
    signal: SignalDetailSchema,
    message: z.string().min(1),
  })
  .strict();
export type RejectSignalResult = z.infer<typeof RejectSignalResultSchema>;
