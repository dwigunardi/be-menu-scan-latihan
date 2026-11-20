import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { OrderPaymentService } from '../orders/order-payment.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaService: any;
  let configService: any;
  let eventsGateway: any;
  let orderPaymentService: any;

  const mockOrder = {
    id: 'order-123',
    orderNumber: 'ORD-20260810-001',
    status: 'PENDING',
    paidAt: null,
    paymentMethod: null,
    totalAmount: 86000,
    table: { number: 'Meja 01' },
    orderItems: [],
  };

  beforeEach(async () => {
    prismaService = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    configService = {
      get: jest.fn().mockReturnValue('test_payment_secret_12345'),
    };

    eventsGateway = {
      emitNewPaidOrder: jest.fn(),
      emitOrderStatusChanged: jest.fn(),
    };

    orderPaymentService = {
      markPaid: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: ConfigService, useValue: configService },
        { provide: EventsGateway, useValue: eventsGateway },
        { provide: OrderPaymentService, useValue: orderPaymentService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createQris', () => {
    it('should generate dynamic QRIS payload when order is found and pending', async () => {
      prismaService.order.findUnique.mockResolvedValue(mockOrder);

      const result = await service.createQris({ orderId: 'order-123' });

      expect(result.orderNumber).toBe('ORD-20260810-001');
      expect(result.grossAmount).toBe(86000);
      expect(result.qrisString).toContain('86000');
      expect(result.transactionId).toBeDefined();
    });

    it('should throw NotFoundException if order does not exist', async () => {
      prismaService.order.findUnique.mockResolvedValue(null);

      await expect(service.createQris({ orderId: 'invalid-id' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if order is already PAID', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'PAID',
      });

      await expect(service.createQris({ orderId: 'order-123' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if order was paid and moved on to PREPARING', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'PREPARING',
        paidAt: new Date(),
        paymentMethod: 'CASH',
      });

      await expect(service.createQris({ orderId: 'order-123' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if order is CANCELLED', async () => {
      prismaService.order.findUnique.mockResolvedValue({ ...mockOrder, status: 'CANCELLED' });

      await expect(service.createQris({ orderId: 'order-123' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('handleWebhook', () => {
    const webhook = (overrides: Record<string, unknown> = {}) => ({
      orderId: 'order-123',
      orderNumber: 'ORD-20260810-001',
      transactionStatus: 'SETTLEMENT' as const,
      grossAmount: 86000,
      paymentType: 'QRIS' as const,
      signatureKey: service.generateTestSignature('ORD-20260810-001', 86000),
      ...overrides,
    });

    it('should settle through the payment entry point as QRIS on valid SETTLEMENT', async () => {
      const paidAt = new Date();
      prismaService.order.findUnique.mockResolvedValue(mockOrder);
      orderPaymentService.markPaid.mockResolvedValue({
        order: { ...mockOrder, status: 'PAID', paidAt },
        alreadyPaid: false,
      });

      const result = await service.handleWebhook(
        webhook({ transactionId: 'TRX-1' }),
      );

      expect(orderPaymentService.markPaid).toHaveBeenCalledWith('order-123', 'QRIS', 'GATEWAY', {
        providerRef: 'TRX-1',
      });
      expect(result).toEqual({
        orderId: 'order-123',
        orderNumber: 'ORD-20260810-001',
        status: 'PAID',
        paidAt,
      });
      expect(prismaService.order.update).not.toHaveBeenCalled();
    });

    it('should count every gateway payment type as non-cash (QRIS bucket)', async () => {
      prismaService.order.findUnique.mockResolvedValue(mockOrder);
      orderPaymentService.markPaid.mockResolvedValue({
        order: { ...mockOrder, status: 'PAID', paidAt: new Date() },
        alreadyPaid: false,
      });

      await service.handleWebhook(webhook({ paymentType: 'CASH' }));

      expect(orderPaymentService.markPaid).toHaveBeenCalledWith('order-123', 'QRIS', 'GATEWAY', {
        providerRef: undefined,
      });
    });

    it('should acknowledge a duplicate SETTLEMENT without changes', async () => {
      const paidAt = new Date('2026-11-20T03:00:00.000Z');
      prismaService.order.findUnique.mockResolvedValue({ ...mockOrder, paidAt });
      orderPaymentService.markPaid.mockResolvedValue({
        order: { ...mockOrder, status: 'PREPARING', paidAt },
        alreadyPaid: true,
      });

      const result = await service.handleWebhook(webhook());

      expect(result).toMatchObject({ status: 'PREPARING', paidAt });
    });

    it('should acknowledge (not throw) when the order was already paid in cash', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'SERVED',
        paidAt: new Date(),
        paymentMethod: 'CASH',
      });
      orderPaymentService.markPaid.mockRejectedValue(
        new ConflictException('Order sudah dibayar dengan metode CASH'),
      );

      const result = await service.handleWebhook(webhook());

      expect(result).toEqual({
        orderId: 'order-123',
        orderNumber: 'ORD-20260810-001',
        status: 'SERVED',
      });
    });

    it('should ignore EXPIRED for an order already paid another way', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'PREPARING',
        paidAt: new Date(),
        paymentMethod: 'CASH',
      });

      const result = await service.handleWebhook(webhook({ transactionStatus: 'EXPIRED' }));

      expect(result.status).toBe('PREPARING');
      expect(prismaService.order.update).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on invalid signature key', async () => {
      await expect(
        service.handleWebhook({
          orderId: 'order-123',
          orderNumber: 'ORD-20260810-001',
          transactionStatus: 'SETTLEMENT',
          grossAmount: 86000,
          paymentType: 'QRIS',
          signatureKey: 'invalid_sha512_hash',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should cancel order on EXPIRED transactionStatus', async () => {
      const validSignature = service.generateTestSignature('ORD-20260810-001', 86000);

      prismaService.order.findUnique.mockResolvedValue(mockOrder);
      prismaService.order.update.mockResolvedValue({
        ...mockOrder,
        status: 'CANCELLED',
      });

      const result = await service.handleWebhook({
        orderId: 'order-123',
        orderNumber: 'ORD-20260810-001',
        transactionStatus: 'EXPIRED',
        grossAmount: 86000,
        paymentType: 'QRIS',
        signatureKey: validSignature,
      });

      expect(result.status).toBe('CANCELLED');
    });
  });
});
