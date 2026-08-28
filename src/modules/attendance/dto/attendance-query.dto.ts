import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AttendanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().optional().default(10),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z
    .enum(['ON_TIME', 'LATE', 'EARLY_LEAVE', 'COMPLETED', 'SICK', 'LEAVE', 'ABSENT'])
    .optional(),
  role: z.enum(['ADMIN', 'CASHIER', 'KASIR', 'KITCHEN', 'WAITER']).optional(),
  search: z.string().optional(),
});

export class AttendanceQueryDto extends createZodDto(AttendanceQuerySchema) {}
