import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const HandoverSchema = z.object({
  incomingStaffId: z.uuid('Pilih staf pengganti'),
  pinCode: z.string().regex(/^\d{4}$/, 'PIN harus berupa 4 digit angka'),
  notes: z
    .string()
    .trim()
    .max(500, 'Catatan serah terima maksimal 500 karakter')
    .optional(),
});

export class HandoverDto extends createZodDto(HandoverSchema) {}

export const HandoverCandidateSchema = z.object({
  id: z.string(),
  employeeId: z.string().nullable(),
  name: z.string(),
  role: z.enum(['CASHIER', 'KITCHEN', 'WAITER']),
  avatarUrl: z.string().nullable(),
});

export const HandoverCandidatesResponseSchema = z.array(
  HandoverCandidateSchema,
);

export type HandoverCandidate = z.infer<typeof HandoverCandidateSchema>;
