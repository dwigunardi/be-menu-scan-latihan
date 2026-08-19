import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SortOrderSchema = z
  .enum(['asc', 'desc', 'ASC', 'DESC'])
  .transform((val) => val.toLowerCase() as 'asc' | 'desc')
  .default('desc');

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(-1).max(100).default(10).optional(),
  search: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortOrder: SortOrderSchema.optional(),
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

/**
 * Calculates pagination metadata.
 * When limit === -1, it represents a getAll query (all items on single page).
 */
export function createPaginationMeta(
  totalItems: number,
  page: number = 1,
  limit: number = 10,
): PaginationMeta {
  const isGetAll = limit === -1;
  const safeLimit = isGetAll ? (totalItems > 0 ? totalItems : 1) : Math.max(1, limit);
  const totalPages = isGetAll ? 1 : Math.ceil(totalItems / safeLimit) || 1;
  const safePage = isGetAll ? 1 : Math.max(1, page);

  return {
    page: safePage,
    limit: isGetAll ? -1 : safeLimit,
    totalItems,
    totalPages,
    hasNextPage: isGetAll ? false : safePage < totalPages,
    hasPrevPage: isGetAll ? false : safePage > 1,
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

/**
 * Helper to compute Prisma `skip` and `take` based on page and limit.
 */
export function getPrismaPagination(
  page: number = 1,
  limit: number = 10,
): { skip?: number; take?: number } {
  if (limit === -1) {
    return {};
  }
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  return {
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  };
}
