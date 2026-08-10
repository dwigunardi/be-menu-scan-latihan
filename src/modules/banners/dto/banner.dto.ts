import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateBannerSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  imageUrl: z.string().min(1, 'imageUrl is required'),
  targetUrl: z.string().optional(),
  sortOrder: z.coerce.number().int().default(0).optional(),
  isActive: z.boolean().default(true).optional(),
});

export class CreateBannerDto extends createZodDto(CreateBannerSchema) {}

export const UpdateBannerSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  targetUrl: z.string().optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export class UpdateBannerDto extends createZodDto(UpdateBannerSchema) {}
