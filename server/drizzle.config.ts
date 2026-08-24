import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const DatabaseUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('postgresql://'), {
    message: 'DATABASE_URL must use the postgresql:// scheme',
  });

const databaseUrl = DatabaseUrlSchema.parse(process.env.DATABASE_URL);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
