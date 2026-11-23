import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SEQUENTIAL_PINS = new Set([
  '0123',
  '1234',
  '2345',
  '3456',
  '4567',
  '5678',
  '6789',
  '9876',
  '8765',
  '7654',
  '6543',
  '5432',
  '4321',
  '3210',
]);

export const OnboardStaffSchema = z
  .object({
    currentPassword: z
      .string()
      .min(6, 'Password sementara saat ini minimal 6 karakter'),
    newPassword: z
      .string()
      .min(8, 'Password baru minimal 8 karakter')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password baru harus mengandung kombinasi huruf besar, huruf kecil, dan angka',
      ),
    pinCode: z
      .string()
      .regex(/^\d{4}$/, 'PIN presensi harus berupa 4 digit angka')
      .refine(
        (pin) => !/^(\d)\1{3}$/.test(pin),
        'PIN tidak boleh menggunakan 4 angka yang sama (contoh: 0000, 1111)',
      )
      .refine(
        (pin) => !SEQUENTIAL_PINS.has(pin),
        'PIN tidak boleh menggunakan angka berurutan (contoh: 1234, 4321)',
      ),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Password baru tidak boleh sama dengan password sementara',
    path: ['newPassword'],
  });

export class OnboardStaffDto extends createZodDto(OnboardStaffSchema) {}
