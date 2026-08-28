import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService, OrderStatus } from './orders.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('OrdersService', () => {
  let service: OrdersService;
  let prismaService: any;
  let eventsGateway: any;

  const mockTable = {
    id: 'table-123',
    number: 'Meja 01',
    status: 'VACANT',
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
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    eventsGateway = {
      emitNewPaidOrder: jest.fn(),
      emitOrderStatusChanged: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prismaService },
        { provide: EventsGateway, useValue: eventsGateway },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw BadRequestException if items array is empty', async () => {
      await expect(
        service.create({
          tableId: 'table-123',
          customerName: 'Budi',
          items: [],
        }),
      ).rejects.toThrow(BadRequestException);
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

    it('should throw BadRequestException if menu item is out of stock', async () => {
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

    it('should create order in transaction and calculate variant subtotal', async () => {
      prismaService.table.findUnique.mockResolvedValue(mockTable);
      prismaService.menuItem.findMany.mockResolvedValue([mockMenuItem]);
      prismaService.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          order: {
            create: jest.fn().mockResolvedValue({
              ...mockOrder,
              totalAmount: 25000,
            }),
          },
          table: {
            update: jest.fn().mockResolvedValue({
              ...mockTable,
              status: 'OCCUPIED',
              activeCustomerName: 'Budi',
            }),
          },
        };
        return cb(tx);
      });

      const result = await service.create({
        tableId: 'table-123',
        customerName: 'Budi',
        items: [
          {
            menuItemId: 'menu-123',
            quantity: 1,
            selectedVariants: [
              { groupName: 'Size', optionName: 'Large', extraPrice: 5000 },
            ],
          },
        ],
      });

      expect(result.orderNumber).toBe(mockOrder.orderNumber);
      expect(prismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('findByOrderNumber', () => {
    it('should return order when found', async () => {
      prismaService.order.findUnique.mockResolvedValue(mockOrder);

      const result = await service.findByOrderNumber('ORD-20260810-1234');
      expect(result.id).toBe('order-123');
    });

    it('should throw NotFoundException when order not found', async () => {
      prismaService.order.findUnique.mockResolvedValue(null);

      await expect(
        service.findByOrderNumber('ORD-INVALID'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllAdmin', () => {
    it('should return paginated orders list', async () => {
      prismaService.order.count.mockResolvedValue(1);
      prismaService.order.findMany.mockResolvedValue([mockOrder]);

      const result = await service.findAllAdmin({});
      expect(result.items).toHaveLength(1);
      expect(result.meta.totalItems).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('should update status to PREPARING and emit event', async () => {
      prismaService.order.findUnique.mockResolvedValue(mockOrder);
      prismaService.order.update.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PREPARING,
      });

      const result = await service.updateStatus('order-123', {
        status: OrderStatus.PREPARING,
      });

      expect(result.status).toBe(OrderStatus.PREPARING);
      expect(eventsGateway.emitOrderStatusChanged).toHaveBeenCalled();
    });

    it('should set paidAt and emit paid event when status becomes PAID', async () => {
      prismaService.order.findUnique.mockResolvedValue(mockOrder);
      prismaService.table.update.mockResolvedValue(mockTable);
      prismaService.order.update.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PAID,
        paidAt: new Date(),
      });

      const result = await service.updateStatus('order-123', {
        status: OrderStatus.PAID,
      });

      expect(result.status).toBe(OrderStatus.PAID);
      expect(eventsGateway.emitNewPaidOrder).toHaveBeenCalled();
    });

    it('should throw NotFoundException if order to update not found', async () => {
      prismaService.order.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('invalid-order', { status: OrderStatus.SERVED }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
