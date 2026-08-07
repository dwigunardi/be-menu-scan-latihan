import { z } from 'zod';

export const envSchema = z.object({
  // Application & Server
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // PostgreSQL Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL environment variable is required'),

  // JWT Auth Secrets
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),

  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Payload Encryption & Handshake
  APP_SECRET: z.string().min(16, 'APP_SECRET must be at least 16 characters'),
  HANDSHAKE_SESSION_TTL: z.coerce.number().default(7200),

  // Logging Strategy
  LOG_TO_FILE: z.coerce.boolean().default(false),
  LOG_FILE_PATH: z.string().default('./logs'),
  LOG_RETENTION_DAYS: z.coerce.number().default(14),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates environment variables against Zod schema.
 * Throws a clean error message if validation fails.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`\n❌ Invalid Environment Variables Configuration:\n${formattedErrors}\n`);
  }

  return result.data;
}
