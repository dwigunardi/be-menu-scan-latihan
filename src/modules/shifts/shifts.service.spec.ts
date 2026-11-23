import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { ShiftsService, DEFAULT_BRANCH_ID } from './shifts.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('ShiftsService', () => {
  let service: ShiftsService;

  const cashier = { id: 'cashier-1', role: UserRole.CASHIER, name: 'Dendi' };
  const otherCashier = {
    id: 'cashier-2',
    role: UserRole.CASHIER,
    name: 'Sari',
  };
  const admin = { id: 'admin-1', role: UserRole.ADMIN, name: 'Admin' };

  const openedAt = new Date('2026-11-20T01:00:00.000Z');

  const buildShift = (overrides: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    branchId: DEFAULT_BRANCH_ID,
    staffId: cashier.id,
    staff: { id: cashier.id, name: cashier.name },
    closedById: null,
    closedBy: null,
    status: 'OPEN',
    openLockKey: DEFAULT_BRANCH_ID,
    openingCash: D(200000),
    expectedCash: null,
    actualCash: null,
    cashVariance: null,
    totalCashOrders: 0,
    totalQrisOrders: 0,
    totalCashRevenue: D(0),
    totalQrisRevenue: D(0),
    totalRevenue: D(0),
    openingNotes: 'Modal pagi',
    closingNotes: null,
    openedAt,
    closedAt: null,
    createdAt: openedAt,
    updatedAt: openedAt,
    ...overrides,
  });

  const mockPrisma: any = {
    cashierShift: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    payment: {
      groupBy: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentShift', () => {
    it('returns null when no shift is open', async () => {
      mockPrisma.cashierShift.findFirst.mockResolvedValue(null);

      await expect(service.getCurrentShift()).resolves.toBeNull();
      expect(mockPrisma.payment.groupBy).not.toHaveBeenCalled();
    });

    it('returns the open shift with live totals split by payment method', async () => {
      mockPrisma.cashierShift.findFirst.mockResolvedValue(buildShift());
      mockPrisma.payment.groupBy.mockResolvedValue([
        {
          method: 'CASH',
          _count: { _all: 3 },
          _sum: { amount: D(150000) },
        },
        {
          method: 'QRIS',
          _count: { _all: 2 },
          _sum: { amount: D(80000) },
        },
      ]);

      const result = await service.getCurrentShift();

      expect(result).toMatchObject({
        staffName: 'Dendi',
        status: 'OPEN',
        openingCash: 200000,
        expectedCash: 350000,
        totalCashOrders: 3,
        totalQrisOrders: 2,
        totalCashRevenue: 150000,
        totalQrisRevenue: 80000,
        totalRevenue: 230000,
        actualCash: null,
        cashVariance: null,
        notes: 'Modal pagi',
        openedAt: openedAt.toISOString(),
        closedAt: null,
      });
      // Attribution by the shift recorded on each payment, excluding orders cancelled afterwards
      expect(mockPrisma.payment.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['method'],
          where: {
            shiftId: buildShift().id,
            order: { status: { not: 'CANCELLED' } },
          },
        }),
      );
    });
  });

  describe('lockOpenShift', () => {
    it('row-locks the open shift by its branch lock key and returns its id, or null', async () => {
      const tx: any = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'shift-1' }])
          .mockResolvedValueOnce([]),
      };

      await expect(service.lockOpenShift(tx)).resolves.toBe('shift-1');
      await expect(service.lockOpenShift(tx)).resolves.toBeNull();

      const [strings, branchId] = tx.$queryRaw.mock.calls[0];
      const sql = strings.join('$1');
      expect(sql).toContain('WHERE open_lock_key = $1 FOR UPDATE');
      expect(branchId).toBe(DEFAULT_BRANCH_ID);
    });
  });

  describe('openShift', () => {
    it('creates an open shift holding the branch lock key', async () => {
      mockPrisma.cashierShift.findFirst.mockResolvedValue(null);
      mockPrisma.cashierShift.create.mockResolvedValue(buildShift());

      const result = await service.openShift(
        { openingCash: 200000, notes: 'Modal pagi' },
        cashier,
      );

      expect(mockPrisma.cashierShift.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: DEFAULT_BRANCH_ID,
            staffId: cashier.id,
            status: 'OPEN',
            openLockKey: DEFAULT_BRANCH_ID,
            openingNotes: 'Modal pagi',
          }),
        }),
      );
      expect(result).toMatchObject({
        status: 'OPEN',
        openingCash: 200000,
        expectedCash: 200000,
      });
    });

    it('rejects with 409 when a shift is already open', async () => {
      mockPrisma.cashierShift.findFirst.mockResolvedValue(buildShift());

      await expect(
        service.openShift({ openingCash: 100000 }, otherCashier),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.cashierShift.create).not.toHaveBeenCalled();
    });

    it('maps a unique-constraint race (P2002) to 409', async () => {
      mockPrisma.cashierShift.findFirst.mockResolvedValue(null);
      mockPrisma.cashierShift.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.openShift({ openingCash: 100000 }, cashier),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('closeShift', () => {
    const closeDto = { actualCash: 340000, notes: 'Kurang 10rb' };

    it('snapshots totals, computes expected cash and variance, and releases the lock', async () => {
      mockPrisma.cashierShift.findUnique.mockResolvedValue(buildShift());
      mockPrisma.payment.groupBy.mockResolvedValue([
        {
          method: 'CASH',
          _count: { _all: 3 },
          _sum: { amount: D(150000) },
        },
      ]);
      mockPrisma.cashierShift.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.cashierShift.findUniqueOrThrow.mockResolvedValue(
        buildShift({
          status: 'CLOSED',
          openLockKey: null,
          closedById: cashier.id,
          closedBy: { id: cashier.id, name: cashier.name },
          expectedCash: D(350000),
          actualCash: D(340000),
          cashVariance: D(-10000),
          totalCashOrders: 3,
          totalCashRevenue: D(150000),
          totalRevenue: D(150000),
          closingNotes: 'Kurang 10rb',
          closedAt: new Date('2026-11-20T09:00:00.000Z'),
        }),
      );

      const result = await service.closeShift(
        buildShift().id,
        closeDto,
        cashier,
      );

      // Locks the shift row before reading totals, so in-flight payments are included
      const [lockSql, lockedId] = mockPrisma.$queryRaw.mock.calls[0];
      expect(lockSql.join('$1')).toContain('FOR UPDATE');
      expect(lockedId).toBe(buildShift().id);
      expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.payment.groupBy.mock.invocationCallOrder[0],
      );
      expect(mockPrisma.payment.groupBy.mock.calls[0][0].where.shiftId).toBe(
        buildShift().id,
      );

      const updateArgs = mockPrisma.cashierShift.updateMany.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: buildShift().id, status: 'OPEN' });
      expect(updateArgs.data).toMatchObject({
        status: 'CLOSED',
        openLockKey: null,
        closedById: cashier.id,
        closingNotes: 'Kurang 10rb',
        totalCashOrders: 3,
      });
      expect(updateArgs.data.expectedCash.toNumber()).toBe(350000);
      expect(updateArgs.data.actualCash.toNumber()).toBe(340000);
      expect(updateArgs.data.cashVariance.toNumber()).toBe(-10000);
      expect(updateArgs.data.totalRevenue.toNumber()).toBe(150000);

      expect(result).toMatchObject({
        status: 'CLOSED',
        expectedCash: 350000,
        actualCash: 340000,
        cashVariance: -10000,
        notes: 'Kurang 10rb',
        openingNotes: 'Modal pagi',
        closedByName: 'Dendi',
      });
    });

    it('allows an admin to close a shift opened by a cashier', async () => {
      mockPrisma.cashierShift.findUnique.mockResolvedValue(buildShift());
      mockPrisma.payment.groupBy.mockResolvedValue([]);
      mockPrisma.cashierShift.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.cashierShift.findUniqueOrThrow.mockResolvedValue(
        buildShift({
          status: 'CLOSED',
          expectedCash: D(200000),
          actualCash: D(200000),
          cashVariance: D(0),
        }),
      );

      await expect(
        service.closeShift(buildShift().id, { actualCash: 200000 }, admin),
      ).resolves.toMatchObject({
        status: 'CLOSED',
        cashVariance: 0,
      });
    });

    it('throws 404 when the shift does not exist', async () => {
      mockPrisma.cashierShift.findUnique.mockResolvedValue(null);

      await expect(
        service.closeShift('missing', closeDto, cashier),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 409 when the shift is already closed', async () => {
      mockPrisma.cashierShift.findUnique.mockResolvedValue(
        buildShift({ status: 'CLOSED' }),
      );

      await expect(
        service.closeShift(buildShift().id, closeDto, cashier),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 403 when another cashier tries to close the shift', async () => {
      mockPrisma.cashierShift.findUnique.mockResolvedValue(buildShift());

      await expect(
        service.closeShift(buildShift().id, closeDto, otherCashier),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.cashierShift.updateMany).not.toHaveBeenCalled();
    });

    it('throws 409 when a concurrent request closed the shift first', async () => {
      mockPrisma.cashierShift.findUnique.mockResolvedValue(buildShift());
      mockPrisma.payment.groupBy.mockResolvedValue([]);
      mockPrisma.cashierShift.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.closeShift(buildShift().id, closeDto, cashier),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getShiftHistory', () => {
    it('paginates, filters by WIB date range and status, and uses snapshots for closed shifts', async () => {
      const closed = buildShift({
        status: 'CLOSED',
        expectedCash: D(350000),
        actualCash: D(350000),
        cashVariance: D(0),
        totalCashOrders: 3,
        totalCashRevenue: D(150000),
        totalRevenue: D(150000),
        closedAt: new Date('2026-11-20T09:00:00.000Z'),
      });
      mockPrisma.cashierShift.findMany.mockResolvedValue([closed]);
      mockPrisma.cashierShift.count.mockResolvedValue(11);

      const result = await service.getShiftHistory({
        page: 2,
        limit: 5,
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        status: 'CLOSED',
      });

      expect(mockPrisma.cashierShift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            branchId: DEFAULT_BRANCH_ID,
            status: 'CLOSED',
            openedAt: {
              gte: new Date('2026-11-01T00:00:00.000+07:00'),
              lte: new Date('2026-11-30T23:59:59.999+07:00'),
            },
          },
          orderBy: { openedAt: 'desc' },
          skip: 5,
          take: 5,
        }),
      );
      expect(mockPrisma.payment.groupBy).not.toHaveBeenCalled();
      expect(result.items[0]).toMatchObject({
        status: 'CLOSED',
        totalRevenue: 150000,
        expectedCash: 350000,
      });
      expect(result.meta).toEqual({
        page: 2,
        limit: 5,
        totalItems: 11,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });

    it('computes live totals for open shifts in the list', async () => {
      mockPrisma.cashierShift.findMany.mockResolvedValue([buildShift()]);
      mockPrisma.cashierShift.count.mockResolvedValue(1);
      mockPrisma.payment.groupBy.mockResolvedValue([
        {
          method: 'QRIS',
          _count: { _all: 1 },
          _sum: { amount: D(45000) },
        },
      ]);

      const result = await service.getShiftHistory({});

      expect(result.items[0]).toMatchObject({
        status: 'OPEN',
        totalQrisOrders: 1,
        totalQrisRevenue: 45000,
        totalRevenue: 45000,
        expectedCash: 200000,
      });
    });
  });
});
