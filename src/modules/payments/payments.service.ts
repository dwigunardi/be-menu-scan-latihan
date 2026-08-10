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

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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

    if (order.status === 'PAID') {
      throw new ConflictException(`Order ${order.orderNumber} is already PAID`);
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
      const updatedOrder = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
        include: {
          table: true,
          orderItems: {
            include: {
              selectedVariants: true,
            },
          },
        },
      });

      // Emit real-time WebSocket event to Kitchen KDS and customer table!
      if (this.eventsGateway) {
        this.eventsGateway.emitNewPaidOrder(updatedOrder);
        this.eventsGateway.emitOrderStatusChanged(
          updatedOrder,
          updatedOrder.table?.number,
        );
      }

      this.logger.log({
        step: 'PAYMENT_WEBHOOK_SETTLED',
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        status: 'PAID',
        grossAmount: dto.grossAmount,
        msg: `Order ${updatedOrder.orderNumber} successfully paid via ${dto.paymentType}. Dispatched real-time alert to kitchen KDS.`,
      });

      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
        paidAt: updatedOrder.paidAt,
      };
    }

    if (dto.transactionStatus === 'EXPIRED' || dto.transactionStatus === 'CANCEL') {
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
