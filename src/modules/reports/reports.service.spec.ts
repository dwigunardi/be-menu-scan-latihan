import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../common/prisma/prisma.service';

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
