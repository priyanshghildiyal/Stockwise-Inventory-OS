import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).optional(),
  USE_DATABASE: z.enum(['true', 'false']).default('false'),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(720).default(8),
  COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('stockwise_session'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

if (parsed.data.NODE_ENV === 'production' && !parsed.data.DATABASE_URL) {
  throw new Error('DATABASE_URL must be configured before starting production.');
}
if (parsed.data.NODE_ENV === 'production' && parsed.data.USE_DATABASE !== 'true') {
  throw new Error('Production requires USE_DATABASE=true with a valid DATABASE_URL.');
}

export const config = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  useDatabase: parsed.data.USE_DATABASE === 'true',
  trustProxy: parsed.data.TRUST_PROXY === 'true',
};
