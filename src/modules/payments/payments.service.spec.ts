import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaService: any;
  let configService: any;
  let eventsGateway: any;

  const mockOrder = {
    id: 'order-123',
    orderNumber: 'ORD-20260810-001',
    status: 'PENDING',
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: ConfigService, useValue: configService },
        { provide: EventsGateway, useValue: eventsGateway },
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
  });

  describe('handleWebhook', () => {
    it('should confirm payment, mark order PAID, and emit events on valid SETTLEMENT', async () => {
      const validSignature = service.generateTestSignature('ORD-20260810-001', 86000);

      prismaService.order.findUnique.mockResolvedValue(mockOrder);
      prismaService.order.update.mockResolvedValue({
        ...mockOrder,
        status: 'PAID',
        paidAt: new Date(),
      });

      const result = await service.handleWebhook({
        orderId: 'order-123',
        orderNumber: 'ORD-20260810-001',
        transactionStatus: 'SETTLEMENT',
        grossAmount: 86000,
        paymentType: 'QRIS',
        signatureKey: validSignature,
      });

      expect(result.status).toBe('PAID');
      expect(eventsGateway.emitNewPaidOrder).toHaveBeenCalled();
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
