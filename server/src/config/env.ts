import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { DataModeSchema, ExecutionModeSchema } from '@pocketpilot/shared';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('postgresql://'), {
      message: 'DATABASE_URL must use the postgresql:// scheme',
    }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  DATA_MODE: DataModeSchema.default('replay'),
  EXECUTION_MODE: ExecutionModeSchema.default('paper'),
});

const parsedEnvironment = EnvironmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const issues = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsedEnvironment.data;
export type Environment = z.infer<typeof EnvironmentSchema>;
