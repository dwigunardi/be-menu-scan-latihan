import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateTableZoneSchema = z.object({
  name: z.string().min(1, 'Zone name is required (e.g. Indoor AC, Outdoor Garden)'),
  description: z.string().optional(),
  color: z.string().default('amber').optional(),
  sortOrder: z.number().int().default(0).optional(),
});

export class CreateTableZoneDto extends createZodDto(CreateTableZoneSchema) {}

export const UpdateTableZoneSchema = z.object({
  name: z.string().min(1, 'Zone name is required').optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export class UpdateTableZoneDto extends createZodDto(UpdateTableZoneSchema) {}
