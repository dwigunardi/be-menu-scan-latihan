import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const QueryRevenueSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export class QueryRevenueDto extends createZodDto(QueryRevenueSchema) {}

export const QueryTopSellingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export class QueryTopSellingDto extends createZodDto(QueryTopSellingSchema) {}
