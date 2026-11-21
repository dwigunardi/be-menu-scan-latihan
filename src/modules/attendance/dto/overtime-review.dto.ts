import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MAX_OVERTIME_MINUTES = 24 * 60;

// Mirrors FE `OvertimeReviewSchema` (fe/src/lib/validations/attendance.schema.ts)
export const OvertimeReviewSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED', 'OVERRIDDEN']),
    approvedMinutes: z.coerce
      .number()
      .int('Menit lembur harus bilangan bulat')
      .min(0, 'Menit lembur tidak boleh negatif')
      .max(MAX_OVERTIME_MINUTES, 'Menit lembur maksimal 24 jam')
      .optional(),
    notes: z
      .string()
      .trim()
      .max(500, 'Catatan maksimal 500 karakter')
      .optional(),
  })
  .refine(
    (data) =>
      data.status !== 'OVERRIDDEN' || data.approvedMinutes !== undefined,
    {
      message: 'Menit lembur wajib diisi saat mengubah jumlah lembur',
      path: ['approvedMinutes'],
    },
  );

export class OvertimeReviewDto extends createZodDto(OvertimeReviewSchema) {}
