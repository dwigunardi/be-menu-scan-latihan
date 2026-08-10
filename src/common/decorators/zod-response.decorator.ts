import { SetMetadata } from '@nestjs/common';
import { z } from 'zod';

export const ZOD_RESPONSE_KEY = 'zod_response_schema';

/**
 * Decorator to enforce outgoing response contract hardening using a Zod schema.
 * Validates, strips internal fields, and transforms data before sending over the wire.
 */
export const ZodResponse = (schema: z.ZodTypeAny) =>
  SetMetadata(ZOD_RESPONSE_KEY, schema);
