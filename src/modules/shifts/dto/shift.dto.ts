import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationQuerySchema } from '../../../common/dto/pagination.dto';
import { BranchDateQuerySchema } from '../../../common/utils/branch-time';

const MAX_CASH_AMOUNT = 9_999_999_999; // Fits Decimal(12, 2)

export const OpenShiftSchema = z.object({
  openingCash: z.coerce
    .number()
    .min(0, 'Kas modal awal minimal Rp 0')
    .max(MAX_CASH_AMOUNT, 'Kas modal awal terlalu besar'),
  notes: z.string().trim().max(500, 'Catatan maksimal 500 karakter').optional(),
});

export class OpenShiftDto extends createZodDto(OpenShiftSchema) {}

export const CloseShiftSchema = z.object({
  actualCash: z.coerce
    .number()
    .min(0, 'Kas fisik minimal Rp 0')
    .max(MAX_CASH_AMOUNT, 'Kas fisik terlalu besar'),
  notes: z.string().trim().max(500, 'Catatan maksimal 500 karakter').optional(),
});

export class CloseShiftDto extends createZodDto(CloseShiftSchema) {}

export const QueryShiftHistorySchema = PaginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10).optional(),
  startDate: BranchDateQuerySchema.optional(),
  endDate: BranchDateQuerySchema.optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
});

export class QueryShiftHistoryDto extends createZodDto(
  QueryShiftHistorySchema,
) {}

// Response contract — mirrors FE `ShiftItemSchema` (fe/src/lib/validations/shift.schema.ts)
export const ShiftItemResponseSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  staffId: z.string(),
  staffName: z.string(),
  closedById: z.string().nullable(),
  closedByName: z.string().nullable(),
  openingCash: z.number(),
  expectedCash: z.number(),
  actualCash: z.number().nullable(),
  cashVariance: z.number().nullable(),
  totalCashOrders: z.number().int(),
  totalQrisOrders: z.number().int(),
  totalCashRevenue: z.number(),
  totalQrisRevenue: z.number(),
  totalRevenue: z.number(),
  status: z.enum(['OPEN', 'CLOSED']),
  notes: z.string().nullable(),
  openingNotes: z.string().nullable(),
  closingNotes: z.string().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ShiftItemResponse = z.infer<typeof ShiftItemResponseSchema>;

export const ShiftHistoryResponseSchema = z.object({
  items: z.array(ShiftItemResponseSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  }),
});
