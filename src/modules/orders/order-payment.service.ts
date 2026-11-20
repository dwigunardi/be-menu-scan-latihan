import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { ShiftsService } from '../shifts/shifts.service';

export type PaymentSource = 'CASHIER' | 'GATEWAY';

const ORDER_PAYMENT_INCLUDE = {
  table: { include: { zone: true } },
  orderItems: { include: { selectedVariants: true } },
} satisfies Prisma.OrderInclude;

export type PaidOrder = Prisma.OrderGetPayload<{
  include: typeof ORDER_PAYMENT_INCLUDE;
}>;

export interface MarkPaidResult {
  order: PaidOrder;
  /** True when the order had already been paid with the same method (idempotent no-op). */
  alreadyPaid: boolean;
}

/**
 * The only place an order becomes paid. Used by the cashier status endpoint and the payment webhook.
 *
 * Guarantees:
 * - `paidAt` is written exactly once, so a paid order can never move to another cashier shift.
 * - Repeating a payment with the same method is a no-op (safe for double taps and webhook retries).
 * - A different method on an already-paid order, or paying a cancelled order, is rejected (409).
 * - Cash requires an open cashier shift, so it always lands in a Z-Report.
 */
@Injectable()
export class OrderPaymentService {
  private readonly logger = new Logger(OrderPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftsService: ShiftsService,
    @Optional() private readonly eventsGateway?: EventsGateway,
  ) {}

  async markPaid(
    orderId: string,
    method: PaymentMethod,
    source: PaymentSource,
  ): Promise<MarkPaidResult> {
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!existing) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (existing.paidAt) {
      return this.resolveAlreadyPaid(existing, method, source);
    }

    if (existing.status === 'CANCELLED') {
      throw new ConflictException(
        `Order ${existing.orderNumber} sudah dibatalkan dan tidak dapat dibayar`,
      );
    }

    if (method === 'CASH' && !(await this.shiftsService.hasOpenShift())) {
      throw new ConflictException(
        'Belum ada shift kasir yang dibuka. Buka shift terlebih dahulu sebelum menerima pembayaran tunai.',
      );
    }

    // Conditional write: only the first payment wins, even under concurrent cashier + webhook calls
    const result = await this.prisma.order.updateMany({
      where: { id: orderId, paidAt: null, status: { not: 'CANCELLED' } },
      data: { status: 'PAID', paidAt: new Date(), paymentMethod: method },
    });

    if (result.count === 0) {
      const current = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      if (current.paidAt) {
        return this.resolveAlreadyPaid(current, method, source);
      }
      throw new ConflictException(
        `Order ${current.orderNumber} sudah dibatalkan dan tidak dapat dibayar`,
      );
    }

    if (existing.tableId) {
      await this.prisma.table.update({
        where: { id: existing.tableId },
        data: { status: 'WAITING_CLEANUP' },
      });
    }

    const order = await this.findWithRelations(orderId);

    if (this.eventsGateway) {
      this.eventsGateway.emitNewPaidOrder(order);
      this.eventsGateway.emitOrderStatusChanged(order, order.table?.number);
    }

    this.logger.log({
      step: 'ORDER_PAID',
      orderId,
      orderNumber: order.orderNumber,
      paymentMethod: method,
      source,
      amount: Number(order.totalAmount),
      msg: `Order ${order.orderNumber} paid via ${method} (${source})`,
    });

    return { order, alreadyPaid: false };
  }

  private async resolveAlreadyPaid(
    order: {
      id: string;
      orderNumber: string;
      paymentMethod: PaymentMethod | null;
    },
    method: PaymentMethod,
    source: PaymentSource,
  ): Promise<MarkPaidResult> {
    // Legacy rows (paid before paymentMethod existed) have no method: treat as the same payment
    if (order.paymentMethod && order.paymentMethod !== method) {
      this.logger.warn({
        step: 'ORDER_PAYMENT_METHOD_MISMATCH',
        orderId: order.id,
        orderNumber: order.orderNumber,
        paidWith: order.paymentMethod,
        attemptedWith: method,
        source,
        msg: 'Payment attempted on an order already paid with a different method',
      });
      throw new ConflictException(
        `Order ${order.orderNumber} sudah dibayar dengan metode ${order.paymentMethod}`,
      );
    }

    this.logger.log({
      step: 'ORDER_PAYMENT_IDEMPOTENT',
      orderId: order.id,
      orderNumber: order.orderNumber,
      source,
      msg: 'Order already paid with the same method; no changes applied',
    });

    return { order: await this.findWithRelations(order.id), alreadyPaid: true };
  }

  private findWithRelations(orderId: string): Promise<PaidOrder> {
    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_PAYMENT_INCLUDE,
    });
  }
}
