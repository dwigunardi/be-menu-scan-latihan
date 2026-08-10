import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createQrisSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
});

export class CreateQrisDto extends createZodDto(createQrisSchema) {}

export const paymentWebhookSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  orderNumber: z.string().min(1, 'orderNumber is required'),
  transactionStatus: z.enum(['SETTLEMENT', 'PENDING', 'EXPIRED', 'CANCEL']),
  grossAmount: z.coerce.number().positive(),
  paymentType: z.enum(['QRIS', 'GOPAY', 'SHOPEEPAY', 'BCA_VA', 'CASH']).default('QRIS'),
  signatureKey: z.string().min(1, 'signatureKey is required'),
});

export class PaymentWebhookDto extends createZodDto(paymentWebhookSchema) {}

// Response Hardening Schemas
export const QrisResponseSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  tableNumber: z.string().nullable(),
  transactionId: z.string(),
  grossAmount: z.number(),
  qrisString: z.string(),
  expiresAt: z.string(),
});

export const WebhookResponseSchema = z.object({
  orderId: z.string().optional(),
  orderNumber: z.string().optional(),
  status: z.string(),
  paidAt: z.date().optional(),
});
