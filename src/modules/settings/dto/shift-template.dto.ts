import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateShiftTemplateSchema = z.object({
  name: z.string().min(2, 'Nama template shift minimal 2 karakter'),
  code: z.string().min(2, 'Kode shift minimal 2 karakter'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format jam mulai harus HH:mm (contoh: 08:00)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format jam selesai harus HH:mm (contoh: 16:00)'),
  breakMinutes: z.coerce.number().min(0).max(240).default(60).optional(),
  colorBadge: z.string().default('emerald').optional(),
  isActive: z.boolean().default(true).optional(),
});

export class CreateShiftTemplateDto extends createZodDto(CreateShiftTemplateSchema) {}

export const UpdateShiftTemplateSchema = CreateShiftTemplateSchema.partial();

export class UpdateShiftTemplateDto extends createZodDto(UpdateShiftTemplateSchema) {}

export const SeedDefaultShiftTemplatesSchema = z.object({
  openTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format jam harus HH:mm (contoh: 08:00)').optional(),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format jam harus HH:mm (contoh: 22:00)').optional(),
});

export class SeedDefaultShiftTemplatesDto extends createZodDto(SeedDefaultShiftTemplatesSchema) {}
