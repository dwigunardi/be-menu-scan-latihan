import { Logger } from '@nestjs/common';
import { z } from 'zod';

/**
 * Applies a `@ZodResponse` schema to outgoing data: validates, strips fields the schema does not declare,
 * and applies transforms. On a mismatch it logs a warning and returns the raw data, so a contract drift
 * never turns a successful request into a 500.
 *
 * Shared by TransformInterceptor (plain responses) and EncryptPayloadInterceptor (encrypted responses,
 * which must be hardened before encryption because the transform step only sees the encrypted envelope).
 */
export function applyResponseSchema(
  schema: z.ZodTypeAny,
  data: unknown,
  logger: Logger,
  handlerName: string,
): unknown {
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return parsed.data;
  }

  logger.warn({
    step: 'RESPONSE_SCHEMA_VALIDATION_WARNING',
    handler: handlerName,
    errors: parsed.error.issues,
    msg: 'Outgoing response did not match its Zod schema. Passing raw data.',
  });
  return data;
}
