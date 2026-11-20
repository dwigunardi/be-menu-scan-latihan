import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderPaymentService } from './order-payment.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { ShiftsService } from '../shifts/shifts.service';

describe('OrderPaymentService', () => {
  let service: OrderPaymentService;
  let prisma: any;
  let shiftsService: any;
  let eventsGateway: any;

  const unpaidOrder = {
    id: 'order-1',
    orderNumber: 'ORD-20261120-001',
    tableId: 'table-1',
    status: 'SERVED',
    paidAt: null,
    paymentMethod: null,
    totalAmount: 50000,
  };
  const paidAt = new Date('2026-11-20T03:00:00.000Z');

  beforeEach(async () => {
    prisma = {
      order: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      table: { update: jest.fn() },
    };
    shiftsService = { hasOpenShift: jest.fn().mockResolvedValue(true) };
    eventsGateway = {
      emitNewPaidOrder: jest.fn(),
      emitOrderStatusChanged: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderPaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: ShiftsService, useValue: shiftsService },
        { provide: EventsGateway, useValue: eventsGateway },
      ],
    }).compile();

    service = module.get(OrderPaymentService);
  });

  const withRelations = (overrides: Record<string, unknown> = {}) => ({
    ...unpaidOrder,
    status: 'PAID',
    paidAt,
    paymentMethod: 'CASH',
    table: { number: 'Meja 01' },
    orderItems: [],
    ...overrides,
  });

  it('marks an unpaid order paid once, frees the table and emits events', async () => {
    prisma.order.findUnique.mockResolvedValue(unpaidOrder);
    prisma.order.findUniqueOrThrow.mockResolvedValue(withRelations());

    const result = await service.markPaid('order-1', 'CASH', 'CASHIER');

    expect(result.alreadyPaid).toBe(false);
    const args = prisma.order.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({
      id: 'order-1',
      paidAt: null,
      status: { not: 'CANCELLED' },
    });
    expect(args.data).toMatchObject({ status: 'PAID', paymentMethod: 'CASH' });
    expect(args.data.paidAt).toBeInstanceOf(Date);
    expect(prisma.table.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: 'WAITING_CLEANUP' },
    });
    expect(eventsGateway.emitNewPaidOrder).toHaveBeenCalledTimes(1);
  });

  it('rejects cash with 409 when no cashier shift is open', async () => {
    prisma.order.findUnique.mockResolvedValue(unpaidOrder);
    shiftsService.hasOpenShift.mockResolvedValue(false);

    await expect(
      service.markPaid('order-1', 'CASH', 'CASHIER'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.table.update).not.toHaveBeenCalled();
  });

  it('accepts QRIS without an open shift', async () => {
    prisma.order.findUnique.mockResolvedValue(unpaidOrder);
    prisma.order.findUniqueOrThrow.mockResolvedValue(
      withRelations({ paymentMethod: 'QRIS' }),
    );
    shiftsService.hasOpenShift.mockResolvedValue(false);

    await service.markPaid('order-1', 'QRIS', 'GATEWAY');

    expect(shiftsService.hasOpenShift).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).toHaveBeenCalled();
  });

  it('is idempotent for a repeated payment with the same method (paidAt untouched)', async () => {
    prisma.order.findUnique.mockResolvedValue({
      ...unpaidOrder,
      status: 'PREPARING',
      paidAt,
      paymentMethod: 'CASH',
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue(withRelations());

    const result = await service.markPaid('order-1', 'CASH', 'CASHIER');

    expect(result.alreadyPaid).toBe(true);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.table.update).not.toHaveBeenCalled();
    expect(eventsGateway.emitNewPaidOrder).not.toHaveBeenCalled();
    // Idempotency does not depend on the drawer still being open
    expect(shiftsService.hasOpenShift).not.toHaveBeenCalled();
  });

  it('treats legacy paid orders without a method as already paid', async () => {
    prisma.order.findUnique.mockResolvedValue({ ...unpaidOrder, paidAt });
    prisma.order.findUniqueOrThrow.mockResolvedValue(withRelations());

    await expect(
      service.markPaid('order-1', 'QRIS', 'GATEWAY'),
    ).resolves.toMatchObject({
      alreadyPaid: true,
    });
  });

  it('rejects a different method on an already paid order with 409', async () => {
    prisma.order.findUnique.mockResolvedValue({
      ...unpaidOrder,
      paidAt,
      paymentMethod: 'CASH',
    });

    await expect(
      service.markPaid('order-1', 'QRIS', 'GATEWAY'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects paying a cancelled order with 409', async () => {
    prisma.order.findUnique.mockResolvedValue({
      ...unpaidOrder,
      status: 'CANCELLED',
    });

    await expect(
      service.markPaid('order-1', 'QRIS', 'GATEWAY'),
    ).rejects.toThrow(ConflictException);
  });

  it('throws 404 for an unknown order', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(service.markPaid('nope', 'CASH', 'CASHIER')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('concurrent payment (conditional update matched nothing)', () => {
    beforeEach(() => {
      prisma.order.findUnique.mockResolvedValue(unpaidOrder);
      prisma.order.updateMany.mockResolvedValue({ count: 0 });
    });

    it('returns alreadyPaid when the winner used the same method', async () => {
      prisma.order.findUniqueOrThrow
        .mockResolvedValueOnce({
          ...unpaidOrder,
          paidAt,
          paymentMethod: 'QRIS',
        })
        .mockResolvedValueOnce(withRelations({ paymentMethod: 'QRIS' }));

      const result = await service.markPaid('order-1', 'QRIS', 'GATEWAY');

      expect(result.alreadyPaid).toBe(true);
      expect(prisma.table.update).not.toHaveBeenCalled();
      expect(eventsGateway.emitNewPaidOrder).not.toHaveBeenCalled();
    });

    it('rejects with 409 when the winner used another method', async () => {
      prisma.order.findUniqueOrThrow.mockResolvedValueOnce({
        ...unpaidOrder,
        paidAt,
        paymentMethod: 'CASH',
      });

      await expect(
        service.markPaid('order-1', 'QRIS', 'GATEWAY'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects with 409 when the order was cancelled meanwhile', async () => {
      prisma.order.findUniqueOrThrow.mockResolvedValueOnce({
        ...unpaidOrder,
        status: 'CANCELLED',
      });

      await expect(
        service.markPaid('order-1', 'QRIS', 'GATEWAY'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
