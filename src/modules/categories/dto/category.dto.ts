import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  sortOrder: z.coerce.number().int().default(0).optional(),
});

export class CreateCategoryDto extends createZodDto(CreateCategorySchema) {}

export const UpdateCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export class UpdateCategoryDto extends createZodDto(UpdateCategorySchema) {}

export const ReorderCategorySchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.coerce.number().int(),
    }),
  ).min(1, 'At least 1 item is required for reordering'),
});

export class ReorderCategoryDto extends createZodDto(ReorderCategorySchema) {}
