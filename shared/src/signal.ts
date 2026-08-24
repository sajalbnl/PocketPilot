import { z } from 'zod';

import { AssetSchema, DataModeSchema, SignalStateSchema, TradeSideSchema } from './enums.js';
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

export const ProposedTradeSchema = z
  .object({
    side: TradeSideSchema,
    entryPrice: PriceSchema,
    notionalUsd: PositiveMoneySchema,
    leverage: z.number().finite().positive(),
    stopLossPrice: PriceSchema,
    expiresAt: UtcDateTimeSchema,
  })
  .strict();

export const LlmReasoningProposalSchema = z
  .object({
    schemaVersion: z.literal(1),
    decision: z.enum(['PROPOSE_LONG', 'PROPOSE_SHORT']),
    title: z.string().min(1).max(160),
    thesis: z.string().min(1),
    whyNow: z.array(z.string().min(1)).min(1),
    evidenceReferences: z.array(z.string().min(1)).min(1),
    uncertainty: z.array(z.string().min(1)).min(1),
    invalidation: z.array(z.string().min(1)).min(1),
    confidence: z.number().finite().min(0).max(1),
    proposedTrade: ProposedTradeSchema,
  })
  .strict();
export type LlmReasoningProposal = z.infer<typeof LlmReasoningProposalSchema>;

export const LlmNoTradeDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    decision: z.enum(['WATCH', 'NO_TRADE']),
    summary: z.string().min(1),
    evidenceReferences: z.array(z.string().min(1)),
    uncertainty: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const LlmDecisionOutputSchema = z.discriminatedUnion('decision', [
  LlmReasoningProposalSchema,
  LlmNoTradeDecisionSchema,
]);
export type LlmDecisionOutput = z.infer<typeof LlmDecisionOutputSchema>;

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

export const RiskPreviewSchema = z
  .object({
    allowed: z.boolean(),
    checkedAt: UtcDateTimeSchema,
    messages: z.array(z.string()),
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
  llmOutput: LlmDecisionOutputSchema.nullable(),
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
