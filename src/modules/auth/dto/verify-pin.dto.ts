import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const VerifyPinSchema = z.object({
  pinCode: z.string().regex(/^\d{4}$/, 'PIN harus berupa 4 digit angka'),
});

export class VerifyPinDto extends createZodDto(VerifyPinSchema) {}

// Response contract — mirrors FE `verifyStaffPin` (fe/src/lib/api/auth-api.ts)
export const VerifyPinResponseSchema = z.object({
  valid: z.boolean(),
});

export type VerifyPinResponse = z.infer<typeof VerifyPinResponseSchema>;
