import { Prisma } from '@prisma/client';

/**
 * Single definition of a "paid" order, shared by reports, dashboard and cashier shifts.
 *
 * An order is paid when `paidAt` is set (written once by OrderPaymentService.markPaid) and it was not
 * cancelled afterwards. `status === 'PAID'` is NOT used: paid orders move on to PREPARING / SERVED.
 * Revenue is dated by `paidAt` (when money was received), not `createdAt`.
 */
export function paidOrderWhere(
  range: { from?: Date; to?: Date } = {},
): Prisma.OrderWhereInput {
  return {
    paidAt: {
      not: null,
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {}),
    },
    status: { not: 'CANCELLED' },
  };
}

export function isOrderPaid(order: { paidAt: Date | null }): boolean {
  return order.paidAt !== null;
}
