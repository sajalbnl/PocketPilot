import { z } from 'zod';

export const UuidSchema = z.string().uuid();
export const UtcDateTimeSchema = z.string().datetime({ offset: true });
export const PositiveMoneySchema = z.number().finite().positive();
export const NonNegativeMoneySchema = z.number().finite().nonnegative();
export const PriceSchema = z.number().finite().positive();

export const JsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const FlatMetadataSchema = z.record(z.string(), JsonPrimitiveSchema);
