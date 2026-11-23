import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BranchDateQuerySchema } from '../../../common/utils/branch-time';

export const QueryRevenueSchema = z.object({
  startDate: BranchDateQuerySchema.optional(),
  endDate: BranchDateQuerySchema.optional(),
});

export class QueryRevenueDto extends createZodDto(QueryRevenueSchema) {}

export const QueryTopSellingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5).optional(),
  startDate: BranchDateQuerySchema.optional(),
  endDate: BranchDateQuerySchema.optional(),
});

export class QueryTopSellingDto extends createZodDto(QueryTopSellingSchema) {}
