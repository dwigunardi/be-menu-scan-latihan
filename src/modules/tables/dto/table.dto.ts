import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateTableSchema = z.object({
  number: z.string().min(1, 'Table number is required (e.g. Meja 01)'),
});

export class CreateTableDto extends createZodDto(CreateTableSchema) {}

export const TableSessionSchema = z.object({
  customerName: z.string().min(2, 'Customer name must be at least 2 characters'),
});

export class TableSessionDto extends createZodDto(TableSessionSchema) {}

// Response Hardening Schemas
export const TableActiveOrderItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  subtotal: z.number(),
  selectedVariants: z.array(
    z.object({
      groupName: z.string(),
      optionName: z.string(),
    }),
  ),
});

export const TableActiveOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  totalAmount: z.number(),
  paidAt: z.date().nullable().optional(),
  createdAt: z.date(),
  items: z.array(TableActiveOrderItemSchema),
});

export const TableStatusResponseSchema = z.object({
  tableId: z.string(),
  number: z.string(),
  status: z.enum(['VACANT', 'OCCUPIED', 'WAITING_PAYMENT', 'WAITING_CLEANUP']),
  activeCustomerName: z.string().nullable(),
  activeOrderId: z.string().nullable(),
  activeOrderNumber: z.string().nullable(),
  activeOrders: z.array(TableActiveOrderSchema),
});
