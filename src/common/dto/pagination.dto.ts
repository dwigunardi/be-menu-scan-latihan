import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10).optional(),
});

export class PaginationQueryDto extends createZodDto(PaginationQuerySchema) {}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export function createPaginationMeta(
  totalItems: number,
  page: number = 1,
  limit: number = 10,
): PaginationMeta {
  const safeLimit = Math.max(1, limit);
  const totalPages = Math.ceil(totalItems / safeLimit) || 1;
  const safePage = Math.max(1, page);

  return {
    page: safePage,
    limit: safeLimit,
    totalItems,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
  };
}

export function createPaginatedResult<T>(
  items: T[],
  totalItems: number,
  page: number = 1,
  limit: number = 10,
): PaginatedResult<T> {
  return {
    items,
    meta: createPaginationMeta(totalItems, page, limit),
  };
}
