import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load the repo-root .env too (server is started from /server by npm workspaces).
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

const schema = z.object({
  TG_API_ID: z.string().optional(),
  TG_API_HASH: z.string().optional(),
  SESSION_SECRET: z.string().min(1).default('dev-only-secret'),
  PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  MOCK_REALTIME_MS: z.coerce.number().int().min(0).default(12000),
  ACCESS_TOKEN: z.string().min(8).optional().or(z.literal('')),
  PREMIUM_UPLOAD_MB: z.coerce.number().int().min(1).max(2000).default(200),
  PREMIUM_PRICE: z.string().default('29 000 so‘m / oy'),
  PREMIUM_BUY_URL: z.string().url().optional().or(z.literal('')),
  PREMIUM_FILE: z.string().optional(),
  PREMIUM_TRIAL_MONTHS: z.coerce.number().int().min(1).max(12).default(2),
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(30),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(2000).default(50),
});

const env = schema.parse(process.env);

export const config = {
  apiId: env.TG_API_ID ? Number(env.TG_API_ID) : undefined,
  apiHash: env.TG_API_HASH || undefined,
  sessionSecret: env.SESSION_SECRET,
  port: env.PORT,
  webOrigin: env.WEB_ORIGIN,
  mockRealtimeMs: env.MOCK_REALTIME_MS,
  accessToken: env.ACCESS_TOKEN || undefined,
  secureCookie: env.WEB_ORIGIN.startsWith('https://'),
  premiumUploadBytes: env.PREMIUM_UPLOAD_MB * 1024 * 1024,
  premiumPrice: env.PREMIUM_PRICE,
  premiumBuyUrl: env.PREMIUM_BUY_URL || undefined,
  premiumTrialMonths: env.PREMIUM_TRIAL_MONTHS,
  premiumFile: env.PREMIUM_FILE ? path.resolve(env.PREMIUM_FILE) : undefined,
  authRateLimit: env.AUTH_RATE_LIMIT,
  maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
  /** Real mode only when both Telegram keys exist. */
  get mock(): boolean {
    return !this.apiId || !this.apiHash;
  },
};
