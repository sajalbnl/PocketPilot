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
  REPLAY_SPEED: z.coerce.number().finite().nonnegative().default(1_000),
  LLM_PROVIDER: z.enum(['fixture', 'openai']).default('fixture'),
  OPENAI_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  LLM_MODEL: z.string().min(1).default('gpt-4.1-mini'),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(20_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(1).default(1),
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
