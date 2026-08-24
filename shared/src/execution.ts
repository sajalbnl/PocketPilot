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
  PositiveMoneySchema,
  PriceSchema,
  UtcDateTimeSchema,
  UuidSchema,
} from './primitives.js';

export const ApprovalRequestSchema = z
  .object({
    approvalRevision: z.number().int().positive(),
    notionalUsd: PositiveMoneySchema,
    leverage: z.number().finite().positive(),
    stopLossPrice: PriceSchema,
  })
  .strict();
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

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
    executionMode: ExecutionModeSchema,
    venueOrderId: z.string().min(1).nullable(),
    side: TradeSideSchema,
    notionalUsd: PositiveMoneySchema,
    leverage: z.number().finite().positive(),
    requestedPrice: PriceSchema.nullable(),
    fillPrice: PriceSchema.nullable(),
    status: OrderStatusSchema,
    error: CompactErrorSchema.nullable(),
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
    stopLossPrice: PriceSchema,
    unrealizedPnl: z.number().finite(),
    realizedPnl: z.number().finite().nullable(),
    status: PositionStatusSchema,
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
    closedAt: UtcDateTimeSchema.nullable(),
  })
  .strict();
export type Position = z.infer<typeof PositionSchema>;

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
