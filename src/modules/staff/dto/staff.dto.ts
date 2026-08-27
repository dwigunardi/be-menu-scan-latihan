import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const CreateStaffSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.email('Format email tidak valid'),
  phone: z.string().min(10).max(15).regex(/^[0-9+]+$/, 'Nomor WhatsApp hanya boleh angka dan +').optional().or(z.literal('')),
  role: z.enum([UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER]),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  pinCode: z.string().regex(/^\d{4}$/, 'PIN harus berupa 4 angka').optional().or(z.literal('')),
  dailyShiftHours: z.coerce.number().min(1).max(24).optional().default(8),
});

export class CreateStaffDto extends createZodDto(CreateStaffSchema) {}

export const UpdateStaffSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter').optional(),
  email: z.email('Format email tidak valid').optional(),
  phone: z.string().min(10).max(15).regex(/^[0-9+]+$/, 'Nomor WhatsApp hanya boleh angka dan +').optional().or(z.literal('')),
  role: z.enum([UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER]).optional(),
  isActive: z.boolean().optional(),
  dailyShiftHours: z.coerce.number().min(1).max(24).optional().default(8),
});

export class UpdateStaffDto extends createZodDto(UpdateStaffSchema) {}

export const UpdateStaffPinSchema = z.object({
  pinCode: z.string().regex(/^\d{4}$/, 'PIN harus berupa 4 angka'),
});

export class UpdateStaffPinDto extends createZodDto(UpdateStaffPinSchema) {}

export const StaffQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10).optional(),
  search: z.string().optional(),
  role: z.enum([UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER]).optional(),
  isActive: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return undefined;
  }, z.boolean().optional()),
});

export class StaffQueryDto extends createZodDto(StaffQuerySchema) {}
