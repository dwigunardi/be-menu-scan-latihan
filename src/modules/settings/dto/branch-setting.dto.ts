import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const DayScheduleSchema = z.object({
  day: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  isOpen: z.boolean().default(true),
  openTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format jam harus HH:mm (contoh: 08:00)'),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format jam harus HH:mm (contoh: 22:00)'),
});

export const UpdateBranchSettingSchema = z.object({
  name: z.string().min(2, 'Nama cabang minimal 2 karakter').optional(),
  address: z.string().min(5, 'Alamat cabang minimal 5 karakter').optional(),
  latitude: z.coerce.number().min(-90).max(90, 'Latitude tidak valid'),
  longitude: z.coerce.number().min(-180).max(180, 'Longitude tidak valid'),
  geofenceRadius: z.coerce.number().min(50, 'Radius minimal 50 meter').max(500, 'Radius maksimal 500 meter').default(100),
  openTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format jam harus HH:mm (contoh: 08:00)').optional(),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format jam harus HH:mm (contoh: 22:00)').optional(),
  lateGracePeriod: z.coerce.number().min(0, 'Toleransi minimal 0 menit').max(120, 'Toleransi maksimal 120 menit').default(15),
  storeMode: z.enum(['SHIFT_DRIVEN', 'CLOCK_DRIVEN', 'QRIS_ONLY', 'EMERGENCY_CLOSED']).optional(),
  timezone: z.string().default('Asia/Jakarta').optional(),
  phone: z.string().optional().nullable(),
  email: z.email('Format email tidak valid').optional().nullable(),
  schedules: z.array(DayScheduleSchema).optional().nullable(),
});

export class UpdateBranchSettingDto extends createZodDto(UpdateBranchSettingSchema) {}

export const UpdateStoreStatusSchema = z.object({
  isStoreOpen: z.boolean(),
  storeMode: z.enum(['SHIFT_DRIVEN', 'CLOCK_DRIVEN', 'QRIS_ONLY', 'EMERGENCY_CLOSED']).optional(),
  emergencyReason: z.string().optional().nullable(),
});

export class UpdateStoreStatusDto extends createZodDto(UpdateStoreStatusSchema) {}
