import { z } from 'zod';

import { DataModeSchema, ExecutionModeSchema } from './enums.js';
import { UtcDateTimeSchema } from './primitives.js';

export const RuntimeConfigSchema = z
  .object({
    dataMode: DataModeSchema,
    executionMode: ExecutionModeSchema,
    serverTime: UtcDateTimeSchema,
  })
  .strict();
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
