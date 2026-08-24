import { z } from 'zod';

import { AssetSchema, ExecutionVenueSchema } from './enums.js';
import { PositiveMoneySchema, UtcDateTimeSchema, UuidSchema } from './primitives.js';

export const RiskLimitsSchema = z
  .object({
    maxPositionUsd: PositiveMoneySchema,
    maxLeverage: z.number().finite().positive(),
    maxDailyLossUsd: PositiveMoneySchema,
    stopLossRequired: z.boolean(),
    approvalRequired: z.boolean(),
    signalExpiryMinutes: z.number().int().positive(),
  })
  .strict();
export type RiskLimits = z.infer<typeof RiskLimitsSchema>;

export const MandateSchema = z
  .object({
    id: UuidSchema,
    agentName: z.string().min(1),
    skillSlug: z.string().min(1),
    allowedAssets: z.array(AssetSchema).min(1),
    allowedVenues: z.array(ExecutionVenueSchema).min(1),
    riskLimits: RiskLimitsSchema,
    killSwitchEnabled: z.boolean(),
    version: z.number().int().positive(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .strict();
export type Mandate = z.infer<typeof MandateSchema>;
