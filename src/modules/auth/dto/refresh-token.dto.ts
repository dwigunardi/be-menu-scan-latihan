import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export class RefreshTokenDto extends createZodDto(RefreshTokenSchema) {}
