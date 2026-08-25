import { z } from 'zod';

import {
  AssetSchema,
  ExecutionModeSchema,
  OrderStatusSchema,
  PositionStatusSchema,
  RiskCodeSchema,
  TradeSideSchema,
} from './enums.js';
import {
  FlatMetadataSchema,
  NonNegativeMoneySchema,
  PositiveMoneySchema,
  PriceSchema,
  UtcDateTimeSchema,
  UuidSchema,
} from './primitives.js';

export const ApprovalRequestSchema = z
  .object({
    approvalRevision: z.number().int().positive(),
    requestKey: z.string().trim().min(1).max(120).optional(),
    notionalUsd: PositiveMoneySchema,
    leverage: z.number().finite().positive(),
    stopLossPrice: PriceSchema.nullable(),
  })
  .strict();
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const AdapterErrorCodeSchema = z.enum([
  'PRICE_UNAVAILABLE',
  'ORDER_REJECTED',
  'POSITION_NOT_FOUND',
  'POSITION_ALREADY_CLOSED',
  'ADAPTER_UNAVAILABLE',
  'ADAPTER_FAILURE',
]);
export type AdapterErrorCode = z.infer<typeof AdapterErrorCodeSchema>;

export const PriceQuoteSchema = z
  .object({
    symbol: AssetSchema,
    price: PriceSchema,
    asOf: UtcDateTimeSchema,
    source: z.string().min(1),
  })
  .strict();
export type PriceQuote = z.infer<typeof PriceQuoteSchema>;

export const CompactErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    occurredAt: UtcDateTimeSchema,
    retryable: z.boolean(),
    metadata: FlatMetadataSchema.default({}),
  })
  .strict();
export type CompactError = z.infer<typeof CompactErrorSchema>;

export const OrderSchema = z
  .object({
    id: UuidSchema,
    signalId: UuidSchema,
    approvalKey: z.string().min(1),
    clientOrderId: z.string().min(1),
    executionMode: ExecutionModeSchema,
    venueOrderId: z.string().min(1).nullable(),
    side: TradeSideSchema,
    notionalUsd: PositiveMoneySchema,
    leverage: z.number().finite().positive(),
    requestedPrice: PriceSchema.nullable(),
    fillPrice: PriceSchema.nullable(),
    quantity: z.number().finite().positive().nullable(),
    feeUsd: NonNegativeMoneySchema,
    slippageBps: z.number().finite().nonnegative(),
    status: OrderStatusSchema,
    error: CompactErrorSchema.nullable(),
    filledAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .strict();
export type Order = z.infer<typeof OrderSchema>;

export const PositionSchema = z
  .object({
    id: UuidSchema,
    orderId: UuidSchema,
    symbol: AssetSchema,
    side: TradeSideSchema,
    entryPrice: PriceSchema,
    currentPrice: PriceSchema,
    notionalUsd: PositiveMoneySchema,
    leverage: z.number().finite().positive(),
    quantity: z.number().finite().positive(),
    stopLossPrice: PriceSchema,
    entryFeeUsd: NonNegativeMoneySchema,
    exitFeeUsd: NonNegativeMoneySchema.nullable(),
    closeClientOrderId: z.string().min(1).nullable(),
    closeVenueOrderId: z.string().min(1).nullable(),
    closePrice: PriceSchema.nullable(),
    unrealizedPnl: z.number().finite(),
    realizedPnl: z.number().finite().nullable(),
    status: PositionStatusSchema,
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
    closedAt: UtcDateTimeSchema.nullable(),
  })
  .strict();
export type Position = z.infer<typeof PositionSchema>;

export const PositionDetailSchema = PositionSchema.extend({
  executionMode: ExecutionModeSchema,
  signalId: UuidSchema,
  thesisHealth: z.string().min(1),
  invalidationSummary: z.array(z.string().min(1)),
}).strict();
export type PositionDetail = z.infer<typeof PositionDetailSchema>;

export const PositionListResponseSchema = z
  .object({ positions: z.array(PositionDetailSchema), total: z.number().int().nonnegative() })
  .strict();
export type PositionListResponse = z.infer<typeof PositionListResponseSchema>;

export const ApprovalAcceptedSchema = z
  .object({
    allowed: z.literal(true),
    approvalKey: z.string().min(1),
    order: OrderSchema,
    position: PositionSchema.nullable(),
  })
  .strict();

export const ApprovalBlockedSchema = z
  .object({
    allowed: z.literal(false),
    code: RiskCodeSchema,
    message: z.string().min(1),
    field: z.string().min(1).optional(),
  })
  .strict();

export const ApprovalResultSchema = z.discriminatedUnion('allowed', [
  ApprovalAcceptedSchema,
  ApprovalBlockedSchema,
]);
export type ApprovalResult = z.infer<typeof ApprovalResultSchema>;

export const ApprovalExecutionResultSchema = z
  .object({
    allowed: z.literal(true),
    approvalKey: z.string().min(1),
    duplicate: z.boolean(),
    order: OrderSchema,
    position: PositionDetailSchema,
    message: z.string().min(1),
  })
  .strict();
export type ApprovalExecutionResult = z.infer<typeof ApprovalExecutionResultSchema>;

export const ClosePositionResultSchema = z
  .object({
    position: PositionDetailSchema,
    duplicate: z.boolean(),
    message: z.string().min(1),
  })
  .strict();
export type ClosePositionResult = z.infer<typeof ClosePositionResultSchema>;

export const RejectSignalRequestSchema = z
  .object({ reason: z.string().trim().min(1).max(240).optional() })
  .strict();
export type RejectSignalRequest = z.infer<typeof RejectSignalRequestSchema>;

export const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        requestId: z.string().min(1).optional(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();
export type ApiError = z.infer<typeof ApiErrorSchema>;
