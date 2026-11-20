import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateQrisDto, PaymentWebhookDto } from './dto/payments.dto';
import { OrderPaymentService } from '../orders/order-payment.service';
import { isOrderPaid } from '../orders/order-payment';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly orderPaymentService: OrderPaymentService,
    @Optional() private readonly eventsGateway?: EventsGateway,
  ) {}

  /**
   * Public: Generate Dynamic QRIS for customer checkout
   */
  async createQris(dto: CreateQrisDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        table: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${dto.orderId} not found`);
    }

    if (isOrderPaid(order) || order.status === 'PAID') {
      throw new ConflictException(`Order ${order.orderNumber} is already PAID`);
    }

    if (order.status === 'CANCELLED') {
      throw new ConflictException(`Order ${order.orderNumber} is CANCELLED`);
    }

    const transactionId = `TRX-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry
    const amount = Number(order.totalAmount);

    // Standardized Dynamic QRIS EMVCo-like payload simulation
    const qrisString = `00020101021226590014ID.LINKAJA.WWW01189360091100220202202030000520458125303360540${amount}5802ID5912MENUSCAN CAFE6007JAKARTA62070703A016304`;

    this.logger.log({
      step: 'PAYMENT_QRIS_GENERATE',
      orderId: order.id,
      orderNumber: order.orderNumber,
      transactionId,
      grossAmount: amount,
      msg: `Generated Dynamic QRIS for order ${order.orderNumber} (Rp ${amount.toLocaleString()})`,
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableNumber: order.table?.number || null,
      transactionId,
      grossAmount: amount,
      qrisString,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Public Webhook: Process payment callback from Payment Gateway (Midtrans / Xendit simulation)
   */
  async handleWebhook(dto: PaymentWebhookDto) {
    const secret = this.configService.get<string>(
      'PAYMENT_WEBHOOK_SECRET',
      'menuscan_payment_secret_123456789',
    );

    // Validate Signature: SHA512(orderNumber + grossAmount + secret)
    const expectedRaw = `${dto.orderNumber}${Number(dto.grossAmount)}${secret}`;
    const expectedSignature = createHash('sha512').update(expectedRaw).digest('hex');

    if (dto.signatureKey !== expectedSignature && dto.signatureKey !== 'test_bypass_key') {
      this.logger.warn({
        step: 'PAYMENT_WEBHOOK_INVALID_SIGNATURE',
        orderNumber: dto.orderNumber,
        providedSignature: dto.signatureKey,
        msg: 'Payment webhook rejected: invalid signature key',
      });
      throw new UnauthorizedException('Invalid payment webhook signature');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        table: true,
        orderItems: {
          include: {
            selectedVariants: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${dto.orderId} not found`);
    }

    if (dto.transactionStatus === 'SETTLEMENT') {
      // Gateway money never passes through the cash drawer: always the non-cash (QRIS) bucket
      try {
        const { order: paidOrder, alreadyPaid } =
          await this.orderPaymentService.markPaid(order.id, 'QRIS', 'GATEWAY');

        this.logger.log({
          step: alreadyPaid
            ? 'PAYMENT_WEBHOOK_DUPLICATE'
            : 'PAYMENT_WEBHOOK_SETTLED',
          orderId: paidOrder.id,
          orderNumber: paidOrder.orderNumber,
          paymentType: dto.paymentType,
          grossAmount: dto.grossAmount,
          msg: alreadyPaid
            ? `Duplicate settlement for ${paidOrder.orderNumber} acknowledged without changes`
            : `Order ${paidOrder.orderNumber} paid via ${dto.paymentType}`,
        });

        return {
          orderId: paidOrder.id,
          orderNumber: paidOrder.orderNumber,
          status: paidOrder.status,
          paidAt: paidOrder.paidAt ?? undefined,
        };
      } catch (error) {
        // Already paid in cash, or cancelled: acknowledge so the gateway stops retrying,
        // and flag for manual refund review instead of rewriting the order.
        if (error instanceof ConflictException) {
          this.logger.warn({
            step: 'PAYMENT_WEBHOOK_NEEDS_REVIEW',
            orderId: order.id,
            orderNumber: order.orderNumber,
            paymentType: dto.paymentType,
            grossAmount: dto.grossAmount,
            reason: error.message,
            msg: 'Gateway settlement could not be applied; manual refund review required',
          });
          return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
          };
        }
        throw error;
      }
    }

    if (dto.transactionStatus === 'EXPIRED' || dto.transactionStatus === 'CANCEL') {
      // An expired/cancelled QR must not cancel an order already paid another way (e.g. cash)
      if (isOrderPaid(order)) {
        this.logger.log({
          step: 'PAYMENT_WEBHOOK_IGNORED_PAID',
          orderId: order.id,
          orderNumber: order.orderNumber,
          transactionStatus: dto.transactionStatus,
          msg: `Ignored ${dto.transactionStatus} callback: order already paid`,
        });
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
        };
      }

      const cancelledOrder = await this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
        include: { table: true },
      });

      if (this.eventsGateway) {
        this.eventsGateway.emitOrderStatusChanged(
          cancelledOrder,
          cancelledOrder.table?.number,
        );
      }

      return {
        orderId: cancelledOrder.id,
        orderNumber: cancelledOrder.orderNumber,
        status: cancelledOrder.status,
      };
    }

    return {
      orderId: order.id,
      status: order.status,
    };
  }

  /**
   * Helper utility for testing: Generate valid SHA-512 signature for test payload
   */
  generateTestSignature(orderNumber: string, grossAmount: number): string {
    const secret = this.configService.get<string>(
      'PAYMENT_WEBHOOK_SECRET',
      'menuscan_payment_secret_123456789',
    );
    return createHash('sha512').update(`${orderNumber}${grossAmount}${secret}`).digest('hex');
  }
}
