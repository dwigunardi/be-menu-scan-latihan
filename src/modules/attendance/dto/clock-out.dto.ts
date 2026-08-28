import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ClockOutSchema = z.object({
  staffId: z.string().min(1, 'Pilih staf yang akan presensi pulang'),
  pinCode: z.string().regex(/^\d{4}$/, 'PIN harus berupa 4 angka'),
  latitude: z.number({ message: 'Koordinat latitude GPS wajib tersedia' }),
  longitude: z.number({ message: 'Koordinat longitude GPS wajib tersedia' }),
  notes: z.string().optional(),
});

export class ClockOutDto extends createZodDto(ClockOutSchema) {}
