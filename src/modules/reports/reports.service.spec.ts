import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderStatus } from '../orders/orders.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prismaService: any;

  beforeEach(async () => {
    prismaService = {
      order: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalAmount: 500000 },
        }),
        count: jest.fn().mockResolvedValue(10),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'PAID', _count: { id: 10 } },
        ]),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ord-1',
            orderNumber: 'ORD-001',
            customerName: 'Budi',
            status: OrderStatus.PENDING,
            totalAmount: 50000,
            table: { number: 'Meja 01' },
            orderItems: [{ id: 'item-1', menuNameSnapshot: 'Latte', quantity: 2 }],
            createdAt: new Date(),
          },
        ]),
      },
      table: {
        count: jest.fn().mockResolvedValue(10),
      },
      orderItem: {
        groupBy: jest.fn().mockResolvedValue([
          {
            menuItemId: 'menu-1',
            menuNameSnapshot: 'Caramel Macchiato',
            _sum: { quantity: 25, subtotal: 875000 },
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardOverview', () => {
    it('should aggregate all KPI cards, table occupancy, recent orders, and top products', async () => {
      // Mock occupied tables count specifically
      prismaService.table.count
        .mockResolvedValueOnce(10) // total tables
        .mockResolvedValueOnce(4); // occupied tables

      const result = await service.getDashboardOverview();

      expect(result.kpi.todayRevenue).toBe(500000);
      expect(result.kpi.todayOrdersCount).toBe(10);
      expect(result.kpi.activeOrdersCount).toBe(10);
      expect(result.kpi.tableOccupancy.totalTables).toBe(10);
      expect(result.kpi.tableOccupancy.occupiedTables).toBe(4);
      expect(result.kpi.tableOccupancy.occupancyPercentage).toBe(40);
      expect(result.recentOrders).toHaveLength(1);
      expect(result.recentOrders[0].tableNumber).toBe('Meja 01');
      expect(result.recentOrders[0].itemCount).toBe(2);
      expect(result.topSellingToday).toHaveLength(1);
      expect(result.topSellingToday[0].name).toBe('Caramel Macchiato');
    });

    it('should handle zero tables gracefully', async () => {
      prismaService.table.count.mockResolvedValue(0);
      prismaService.order.findMany.mockResolvedValue([
        {
          id: 'ord-2',
          orderNumber: 'ORD-002',
          customerName: 'Siti',
          status: OrderStatus.PAID,
          totalAmount: 25000,
          table: null,
          orderItems: [],
          createdAt: new Date(),
        },
      ]);

      const result = await service.getDashboardOverview();
      expect(result.kpi.tableOccupancy.occupancyPercentage).toBe(0);
      expect(result.recentOrders[0].tableNumber).toBe('-');
    });
  });

  describe('getRevenueReport', () => {
    it('should aggregate revenue and calculate average order value', async () => {
      const result = await service.getRevenueReport({});
      expect(result.totalRevenue).toBe(500000);
      expect(result.totalOrders).toBe(10);
      expect(result.averageOrderValue).toBe(50000);
      expect(result.ordersByStatus).toHaveLength(1);
    });

    it('should apply startDate and endDate filters and handle zero orders', async () => {
      prismaService.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
      });
      prismaService.order.count.mockResolvedValue(0);
      prismaService.order.groupBy.mockResolvedValue([]);

      const result = await service.getRevenueReport({
        startDate: '2026-08-01',
        endDate: '2026-08-10',
      });

      expect(result.totalRevenue).toBe(0);
      expect(result.totalOrders).toBe(0);
      expect(result.averageOrderValue).toBe(0);
      expect(result.ordersByStatus).toEqual([]);
    });
  });

  describe('getTopSelling', () => {
    it('should return top selling menu items with default limit', async () => {
      const result = await service.getTopSelling({});
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Caramel Macchiato');
      expect(result[0].totalQuantitySold).toBe(25);
    });

    it('should apply custom limit, startDate, and endDate', async () => {
      const result = await service.getTopSelling({
        limit: 10,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
      });
      expect(result).toHaveLength(1);
      expect(prismaService.orderItem.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });
  });
});
