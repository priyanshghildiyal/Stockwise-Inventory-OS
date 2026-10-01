import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).optional(),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(720).default(8),
  COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('stockwise_session'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const config = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  trustProxy: parsed.data.TRUST_PROXY === 'true',
};
