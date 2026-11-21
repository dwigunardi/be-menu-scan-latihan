import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Mirrors FE `AttendanceCorrectionSchema`. The FE time input sends `HH:mm` (WIB wall clock on the
// attendance date); a full ISO datetime with offset is also accepted.
export const AttendanceCorrectionSchema = z.object({
  clockOutTime: z.union([
    z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam pulang harus berformat HH:mm'),
    z.iso.datetime({ offset: true }),
  ]),
  notes: z
    .string()
    .trim()
    .min(3, 'Alasan koreksi minimal 3 karakter')
    .max(500, 'Alasan koreksi maksimal 500 karakter'),
});

export class AttendanceCorrectionDto extends createZodDto(
  AttendanceCorrectionSchema,
) {}
