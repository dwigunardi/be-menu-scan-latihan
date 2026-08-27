import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationQuerySchema } from '../../../common/dto/pagination.dto';

export const SelectedVariantInputSchema = z.object({
  groupName: z.string().min(1, 'groupName is required'),
  optionName: z.string().min(1, 'optionName is required'),
  extraPrice: z.coerce.number().min(0).default(0),
});

export const OrderItemInputSchema = z.object({
  menuItemId: z.uuid('Invalid menuItemId'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  notes: z.string().optional().nullable(),
  selectedVariants: z.array(SelectedVariantInputSchema).optional().default([]),
});

export const CreateOrderSchema = z.object({
  tableId: z.uuid('Invalid tableId'),
  customerName: z.string().min(2, 'Customer name must be at least 2 characters'),
  items: z
    .array(OrderItemInputSchema)
    .min(1, 'At least 1 item is required to place an order'),
});

export class CreateOrderDto extends createZodDto(CreateOrderSchema) {}

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'PREPARING', 'SERVED', 'PAID', 'CANCELLED']),
});

export class UpdateOrderStatusDto extends createZodDto(UpdateOrderStatusSchema) {}

export const QueryOrderSchema = PaginationQuerySchema.extend({
  status: z.enum(['PENDING', 'PREPARING', 'SERVED', 'PAID', 'CANCELLED']).optional(),
  tableId: z.uuid().optional(),
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
  sortBy: z.enum(['createdAt', 'totalAmount', 'status']).default('createdAt').optional(),
});

export class QueryOrderDto extends createZodDto(QueryOrderSchema) {}
