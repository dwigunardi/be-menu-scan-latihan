import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsController', () => {
  let controller: ReportsController;
  let reportsService: jest.Mocked<ReportsService>;

  beforeEach(async () => {
    const mockReportsService = {
      getDashboardOverview: jest.fn(),
      getRevenueReport: jest.fn(),
      getTopSelling: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    reportsService = module.get(ReportsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboardOverview', () => {
    it('should return aggregated overview metrics for admin dashboard', async () => {
      const overviewData = {
        kpi: {
          todayRevenue: 2500000,
          todayOrdersCount: 65,
          activeOrdersCount: 4,
          tableOccupancy: {
            totalTables: 10,
            occupiedTables: 6,
            occupancyPercentage: 60,
          },
        },
        recentOrders: [],
        topSellingToday: [],
      };

      reportsService.getDashboardOverview.mockResolvedValue(overviewData as any);

      const result = await controller.getDashboardOverview();
      expect(result).toEqual(overviewData);
      expect(reportsService.getDashboardOverview).toHaveBeenCalled();
    });
  });

  describe('getRevenueReport', () => {
    it('should return revenue report metrics', async () => {
      const query = { startDate: '2026-08-01', endDate: '2026-08-10' };
      const reportData = {
        totalRevenue: 1500000,
        totalOrders: 50,
        averageOrderValue: 30000,
        period: { startDate: '2026-08-01', endDate: '2026-08-10' },
      };

      reportsService.getRevenueReport.mockResolvedValue(reportData as any);

      const result = await controller.getRevenueReport(query);
      expect(result).toEqual(reportData);
      expect(reportsService.getRevenueReport).toHaveBeenCalledWith(query);
    });
  });

  describe('getTopSelling', () => {
    it('should return top selling menu items', async () => {
      const query = { limit: 5 };
      const topSellingData = [
        { menuItemId: 'm1', name: 'Es Kopi Susu', totalQuantity: 120, totalRevenue: 2400000 },
      ];

      reportsService.getTopSelling.mockResolvedValue(topSellingData as any);

      const result = await controller.getTopSelling(query);
      expect(result).toEqual(topSellingData);
      expect(reportsService.getTopSelling).toHaveBeenCalledWith(query);
    });
  });
});
