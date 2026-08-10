import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const VariantOptionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Option name is required'),
  extraPrice: z.coerce.number().min(0).default(0),
  isAvailable: z.boolean().default(true).optional(),
});

export const VariantGroupSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Group name is required (e.g. Ukuran, Temperature, Extra)'),
  isRequired: z.boolean().default(false),
  minSelect: z.coerce.number().int().min(0).default(0),
  maxSelect: z.coerce.number().int().min(1).default(1),
  options: z.array(VariantOptionSchema).min(1, 'At least 1 variant option is required in group'),
});

export const CreateMenuSchema = z.object({
  name: z.string().min(2, 'Menu name must be at least 2 characters'),
  description: z.string().optional(),
  price: z.coerce.number().positive('Price must be greater than 0'),
  promoPrice: z.coerce.number().positive().optional().nullable(),
  categoryId: z.string().uuid('Invalid category ID'),
  imageUrl: z.string().optional().nullable(),
  isBestSeller: z.boolean().default(false).optional(),
  isRecommended: z.boolean().default(false).optional(),
  isAvailable: z.boolean().default(true).optional(),
  variantGroups: z.array(VariantGroupSchema).optional(),
});

export class CreateMenuDto extends createZodDto(CreateMenuSchema) {}

export const UpdateMenuSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  price: z.coerce.number().positive().optional(),
  promoPrice: z.coerce.number().positive().optional().nullable(),
  categoryId: z.string().uuid().optional(),
  imageUrl: z.string().optional().nullable(),
  isBestSeller: z.boolean().optional(),
  isRecommended: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  variantGroups: z.array(VariantGroupSchema).optional(),
});

export class UpdateMenuDto extends createZodDto(UpdateMenuSchema) {}

export const ToggleMenuStatusSchema = z.object({
  isAvailable: z.boolean(),
});

export class ToggleMenuStatusDto extends createZodDto(ToggleMenuStatusSchema) {}

export const QueryMenuSchema = z.object({
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  isAvailable: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  isBestSeller: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  isRecommended: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

export class QueryMenuDto extends createZodDto(QueryMenuSchema) {}
