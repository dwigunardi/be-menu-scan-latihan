import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const HandshakeSchema = z.object({
  clientPublicKey: z.string().min(64, 'clientPublicKey must be a valid hex string'),
  nonce: z.string().min(16, 'nonce must be at least 16 characters'),
});

export class HandshakeDto extends createZodDto(HandshakeSchema) {}
