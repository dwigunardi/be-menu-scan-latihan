import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService, OrderStatus, TableStatus } from './orders.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('OrdersService', () => {
  let service: OrdersService;
  let prismaService: any;

  const mockTable = {
    id: 'table-123',
    number: 'Meja 01',
    status: TableStatus.VACANT,
    activeCustomerName: null,
  };

  const mockMenuItem = {
    id: 'menu-123',
    name: 'Espresso',
    price: 25000,
    promoPrice: 20000,
    isAvailable: true,
    deletedAt: null,
  };

  const mockOrder = {
    id: 'order-123',
    orderNumber: 'ORD-20260810-1234',
    tableId: 'table-123',
    customerName: 'Budi',
    status: OrderStatus.PENDING,
    totalAmount: 25000,
    table: mockTable,
    orderItems: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prismaService = {
      table: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      menuItem: {
        findMany: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb) =>
        cb({
          order: {
            create: jest.fn().mockResolvedValue(mockOrder),
          },
          table: {
            update: jest.fn().mockResolvedValue(mockTable),
          },
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an order successfully with item variants, notes, and promo price', async () => {
      prismaService.table.findUnique.mockResolvedValue(mockTable);
      prismaService.menuItem.findMany.mockResolvedValue([mockMenuItem]);

      const result = await service.create({
        tableId: 'table-123',
        customerName: 'Budi',
        items: [
          {
            menuItemId: 'menu-123',
            quantity: 1,
            notes: 'Less sugar please',
            selectedVariants: [
              {
                groupName: 'Ukuran',
                optionName: 'Large',
                extraPrice: 5000,
              },
            ],
          },
        ],
      });

      expect(result.orderNumber).toBeDefined();
      expect(prismaService.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if table does not exist', async () => {
      prismaService.table.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          tableId: 'invalid-table',
          customerName: 'Budi',
          items: [{ menuItemId: 'menu-123', quantity: 1, selectedVariants: [] }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if menu item is unavailable', async () => {
      prismaService.table.findUnique.mockResolvedValue(mockTable);
      prismaService.menuItem.findMany.mockResolvedValue([
        { ...mockMenuItem, isAvailable: false },
      ]);

      await expect(
        service.create({
          tableId: 'table-123',
          customerName: 'Budi',
          items: [{ menuItemId: 'menu-123', quantity: 1, selectedVariants: [] }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findByOrderNumber', () => {
    it('should return order when found', async () => {
      prismaService.order.findUnique.mockResolvedValue(mockOrder);

      const result = await service.findByOrderNumber('ORD-20260810-1234');
      expect(result.orderNumber).toBe('ORD-20260810-1234');
    });

    it('should throw NotFoundException when order not found', async () => {
      prismaService.order.findUnique.mockResolvedValue(null);

      await expect(
        service.findByOrderNumber('ORD-NONEXISTENT'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllAdmin', () => {
    it('should return paginated orders with filters for status, table, and date range', async () => {
      prismaService.order.count.mockResolvedValue(1);
      prismaService.order.findMany.mockResolvedValue([mockOrder]);

      const result = await service.findAllAdmin({
        page: 1,
        limit: 10,
        status: OrderStatus.PENDING,
        tableId: 'table-123',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('should update status and set paidAt if status is PAID', async () => {
      prismaService.order.findUnique.mockResolvedValue(mockOrder);
      prismaService.order.update.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PAID,
        paidAt: new Date(),
      });

      const result = await service.updateStatus('order-123', {
        status: OrderStatus.PAID,
      });

      expect(result.status).toBe(OrderStatus.PAID);
      expect(prismaService.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.PAID,
            paidAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw NotFoundException if order to update not found', async () => {
      prismaService.order.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('invalid-id', { status: OrderStatus.PREPARING }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
