import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationQuerySchema } from '../../../common/dto/pagination.dto';

export const CreateTableSchema = z.object({
  number: z.string().min(1, 'Table number is required (e.g. Meja 01)'),
  tableNumber: z.string().optional(),
  capacity: z.number().int().min(1).default(4).optional(),
  zoneId: z.string().nullable().optional(),
  seatingType: z.enum(['DINING', 'SOFA', 'BAR', 'BOOTH', 'FAMILY']).default('DINING').optional(),
  tags: z.array(z.string()).default([]).optional(),
});

export class CreateTableDto extends createZodDto(CreateTableSchema) {}

export const UpdateTableSchema = z.object({
  number: z.string().min(1, 'Table number is required').optional(),
  tableNumber: z.string().optional(),
  status: z.enum(['VACANT', 'OCCUPIED', 'WAITING_PAYMENT', 'WAITING_CLEANUP']).optional(),
  capacity: z.number().int().min(1).optional(),
  zoneId: z.string().nullable().optional(),
  seatingType: z.enum(['DINING', 'SOFA', 'BAR', 'BOOTH', 'FAMILY']).optional(),
  tags: z.array(z.string()).optional(),
});

export class UpdateTableDto extends createZodDto(UpdateTableSchema) {}

export const TableSessionSchema = z.object({
  customerName: z.string().min(2, 'Customer name must be at least 2 characters'),
});

export class TableSessionDto extends createZodDto(TableSessionSchema) {}

export const QueryTableSchema = PaginationQuerySchema.extend({
  status: z.enum(['VACANT', 'OCCUPIED', 'WAITING_PAYMENT', 'WAITING_CLEANUP']).optional(),
  zoneId: z.string().optional(),
  seatingType: z.string().optional(),
  sortBy: z.enum(['number', 'status', 'createdAt']).default('number').optional(),
});

export class QueryTableDto extends createZodDto(QueryTableSchema) {}

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
