import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { DataModeSchema, ExecutionModeSchema } from '@pocketpilot/shared';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const SymbolMapSchema = z.record(z.string().min(1), z.enum(['BTC', 'ETH']));
const PolymarketMappingSchema = z
  .object({
    marketId: z.string().min(1),
    asset: z.enum(['BTC', 'ETH']),
    outcome: z.string().min(1),
    meaning: z.string().min(3).max(240),
  })
  .strict();

function jsonEnvironment<T>(schema: z.ZodType<T>, fallback: string) {
  return z
    .string()
    .default(fallback)
    .transform((value, context): unknown => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({ code: 'custom', message: 'must be valid JSON' });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

const EnvironmentSchema = z
  .object({
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
    PAPER_FEE_BPS: z.coerce.number().finite().min(0).max(100).default(5),
    PAPER_SLIPPAGE_BPS: z.coerce.number().finite().min(0).max(100).default(2),
    LLM_PROVIDER: z.enum(['fixture', 'openai']).default('fixture'),
    OPENAI_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    LLM_MODEL: z.string().min(1).default('gpt-4.1-mini'),
    OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(20_000),
    LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(1).default(1),
    EXPO_PUSH_URL: z.string().url().default('https://exp.host/--/api/v2/push/send'),
    EXPO_ACCESS_TOKEN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    EXPO_PUSH_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
    HYPERLIQUID_WS_URL: z.string().url().default('wss://api.hyperliquid.xyz/ws'),
    HYPERLIQUID_SYMBOL_MAP: jsonEnvironment(SymbolMapSchema, '{"BTC":"BTC","ETH":"ETH"}'),
    HYPERLIQUID_RECONNECT_BASE_MS: z.coerce.number().int().min(100).max(60_000).default(500),
    HYPERLIQUID_RECONNECT_MAX_MS: z.coerce.number().int().min(100).max(120_000).default(30_000),
    HYPERLIQUID_RECONNECT_LIMIT: z.coerce.number().int().min(0).max(100).default(10),
    HYPERLIQUID_RECONNECT_JITTER: z.coerce.number().finite().min(0).max(1).default(0.2),
    HYPERLIQUID_HEARTBEAT_MS: z.coerce.number().int().min(5_000).max(55_000).default(30_000),
    POLYMARKET_GAMMA_URL: z.string().url().default('https://gamma-api.polymarket.com'),
    POLYMARKET_CLOB_URL: z.string().url().default('https://clob.polymarket.com'),
    POLYMARKET_MARKETS_JSON: jsonEnvironment(z.array(PolymarketMappingSchema).max(3), '[]'),
    POLYMARKET_POLL_INTERVAL_MS: z.coerce.number().int().min(5_000).max(300_000).default(15_000),
    MARKET_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
    MARKET_FRESHNESS_SECONDS: z.coerce.number().int().min(1).max(3_600).default(120),
    MARKET_ALIGNMENT_SECONDS: z.coerce.number().int().min(1).max(3_600).default(120),
  })
  .superRefine((value, context) => {
    if (value.HYPERLIQUID_RECONNECT_MAX_MS < value.HYPERLIQUID_RECONNECT_BASE_MS) {
      context.addIssue({
        code: 'custom',
        path: ['HYPERLIQUID_RECONNECT_MAX_MS'],
        message: 'must be greater than or equal to HYPERLIQUID_RECONNECT_BASE_MS',
      });
    }
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
