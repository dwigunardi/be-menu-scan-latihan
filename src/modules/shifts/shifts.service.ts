import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  createPaginatedResult,
  getPrismaPagination,
  PaginatedResult,
} from '../../common/dto/pagination.dto';
import {
  OpenShiftDto,
  CloseShiftDto,
  QueryShiftHistoryDto,
  ShiftItemResponse,
} from './dto/shift.dto';
import { paidOrderWhere } from '../orders/order-payment';
import { parseBranchDateBoundary } from '../../common/utils/branch-time';

export const DEFAULT_BRANCH_ID = 'default-branch';

export interface ShiftActor {
  id: string;
  role: UserRole;
  name?: string;
}

interface ShiftTotals {
  totalCashOrders: number;
  totalQrisOrders: number;
  totalCashRevenue: Prisma.Decimal;
  totalQrisRevenue: Prisma.Decimal;
  totalRevenue: Prisma.Decimal;
}

const SHIFT_INCLUDE = {
  staff: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
} satisfies Prisma.CashierShiftInclude;

type ShiftWithRelations = Prisma.CashierShiftGetPayload<{
  include: typeof SHIFT_INCLUDE;
}>;

type PrismaClientLike = Pick<PrismaService, 'order'> | Prisma.TransactionClient;

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the branch's currently open shift with live totals, or null if the drawer is closed.
   */
  async getCurrentShift(
    branchId: string = DEFAULT_BRANCH_ID,
  ): Promise<ShiftItemResponse | null> {
    const shift = await this.prisma.cashierShift.findFirst({
      where: { branchId, status: 'OPEN' },
      include: SHIFT_INCLUDE,
    });

    if (!shift) return null;

    const totals = await this.computeTotals(this.prisma, shift.openedAt);
    return this.toResponse(shift, totals);
  }

  /**
   * Whether the branch cash drawer is currently open (used to gate cash payments).
   */
  async hasOpenShift(branchId: string = DEFAULT_BRANCH_ID): Promise<boolean> {
    const count = await this.prisma.cashierShift.count({
      where: { branchId, status: 'OPEN' },
    });
    return count > 0;
  }

  /**
   * Opens a new cashier shift. Only one shift may be open per branch at any time.
   */
  async openShift(
    dto: OpenShiftDto,
    actor: ShiftActor,
    branchId: string = DEFAULT_BRANCH_ID,
  ): Promise<ShiftItemResponse> {
    const existing = await this.prisma.cashierShift.findFirst({
      where: { branchId, status: 'OPEN' },
      include: SHIFT_INCLUDE,
    });

    if (existing) {
      throw new ConflictException(
        `Masih ada shift kasir yang terbuka (dibuka oleh ${existing.staff.name}). Tutup shift tersebut terlebih dahulu.`,
      );
    }

    let shift: ShiftWithRelations;
    try {
      shift = await this.prisma.cashierShift.create({
        data: {
          branchId,
          staffId: actor.id,
          status: 'OPEN',
          openLockKey: branchId,
          openingCash: new Prisma.Decimal(dto.openingCash),
          openingNotes: dto.notes || null,
        },
        include: SHIFT_INCLUDE,
      });
    } catch (error) {
      // Lost a race against a concurrent open request (unique open_lock_key)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Masih ada shift kasir yang terbuka. Tutup shift tersebut terlebih dahulu.',
        );
      }
      throw error;
    }

    this.logger.log({
      step: 'SHIFT_OPEN',
      shiftId: shift.id,
      branchId,
      staffId: actor.id,
      openingCash: dto.openingCash,
      msg: `Cashier shift opened by ${shift.staff.name}`,
    });

    return this.toResponse(shift, this.emptyTotals());
  }

  /**
   * Closes an open shift: snapshots totals (Z-Report), reconciles physical cash against expected cash.
   * Only the cashier who opened the shift, or an ADMIN, may close it.
   */
  async closeShift(
    id: string,
    dto: CloseShiftDto,
    actor: ShiftActor,
  ): Promise<ShiftItemResponse> {
    const closed = await this.prisma.$transaction(async (tx) => {
      const shift = await tx.cashierShift.findUnique({ where: { id } });

      if (!shift) {
        throw new NotFoundException(`Shift dengan ID ${id} tidak ditemukan`);
      }
      if (shift.status !== 'OPEN') {
        throw new ConflictException('Shift ini sudah ditutup sebelumnya');
      }
      if (actor.role !== UserRole.ADMIN && shift.staffId !== actor.id) {
        throw new ForbiddenException(
          'Hanya kasir yang membuka shift ini atau Admin yang dapat menutupnya',
        );
      }

      const closedAt = new Date();
      const totals = await this.computeTotals(tx, shift.openedAt, closedAt);
      const expectedCash = shift.openingCash.plus(totals.totalCashRevenue);
      const actualCash = new Prisma.Decimal(dto.actualCash);
      const cashVariance = actualCash.minus(expectedCash);

      // Conditional update guards against a concurrent close of the same shift
      const result = await tx.cashierShift.updateMany({
        where: { id, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          openLockKey: null,
          closedById: actor.id,
          closedAt,
          expectedCash,
          actualCash,
          cashVariance,
          closingNotes: dto.notes || null,
          ...totals,
        },
      });

      if (result.count === 0) {
        throw new ConflictException('Shift ini sudah ditutup sebelumnya');
      }

      return tx.cashierShift.findUniqueOrThrow({
        where: { id },
        include: SHIFT_INCLUDE,
      });
    });

    this.logger.log({
      step: 'SHIFT_CLOSE',
      shiftId: closed.id,
      closedById: actor.id,
      expectedCash: Number(closed.expectedCash),
      actualCash: Number(closed.actualCash),
      cashVariance: Number(closed.cashVariance),
      totalRevenue: Number(closed.totalRevenue),
      msg: `Cashier shift closed (Z-Report generated)`,
    });

    return this.toResponse(closed);
  }

  /**
   * Paginated shift history (newest first), filterable by opening date range and status.
   */
  async getShiftHistory(
    query: QueryShiftHistoryDto,
    branchId: string = DEFAULT_BRANCH_ID,
  ): Promise<PaginatedResult<ShiftItemResponse>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const where: Prisma.CashierShiftWhereInput = { branchId };
    if (query.status) where.status = query.status;
    if (query.startDate || query.endDate) {
      where.openedAt = {};
      if (query.startDate)
        where.openedAt.gte = parseBranchDateBoundary(query.startDate, 'start');
      if (query.endDate)
        where.openedAt.lte = parseBranchDateBoundary(query.endDate, 'end');
    }

    const [items, total] = await Promise.all([
      this.prisma.cashierShift.findMany({
        where,
        include: SHIFT_INCLUDE,
        orderBy: { openedAt: 'desc' },
        ...getPrismaPagination(page, limit),
      }),
      this.prisma.cashierShift.count({ where }),
    ]);

    const mapped = await Promise.all(
      items.map(async (shift) =>
        shift.status === 'OPEN'
          ? this.toResponse(
              shift,
              await this.computeTotals(this.prisma, shift.openedAt),
            )
          : this.toResponse(shift),
      ),
    );

    return createPaginatedResult(mapped, total, page, limit);
  }

  /**
   * Aggregates paid orders within the shift window, split by payment method.
   * "Paid" follows the shared definition in orders/order-payment.ts.
   */
  private async computeTotals(
    client: PrismaClientLike,
    from: Date,
    to?: Date,
  ): Promise<ShiftTotals> {
    const groups = await client.order.groupBy({
      by: ['paymentMethod'],
      where: {
        ...paidOrderWhere({ from, to }),
        paymentMethod: { not: null },
      },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });

    const totals = this.emptyTotals();
    for (const group of groups) {
      const amount = group._sum.totalAmount ?? new Prisma.Decimal(0);
      if (group.paymentMethod === 'CASH') {
        totals.totalCashOrders = group._count._all;
        totals.totalCashRevenue = amount;
      } else if (group.paymentMethod === 'QRIS') {
        totals.totalQrisOrders = group._count._all;
        totals.totalQrisRevenue = amount;
      }
    }
    totals.totalRevenue = totals.totalCashRevenue.plus(totals.totalQrisRevenue);
    return totals;
  }

  private emptyTotals(): ShiftTotals {
    return {
      totalCashOrders: 0,
      totalQrisOrders: 0,
      totalCashRevenue: new Prisma.Decimal(0),
      totalQrisRevenue: new Prisma.Decimal(0),
      totalRevenue: new Prisma.Decimal(0),
    };
  }

  /**
   * Maps a DB row to the FE contract. For OPEN shifts, pass live totals;
   * CLOSED shifts use the snapshot persisted at close time.
   */
  private toResponse(
    shift: ShiftWithRelations,
    liveTotals?: ShiftTotals,
  ): ShiftItemResponse {
    const totals: ShiftTotals = liveTotals ?? {
      totalCashOrders: shift.totalCashOrders,
      totalQrisOrders: shift.totalQrisOrders,
      totalCashRevenue: shift.totalCashRevenue,
      totalQrisRevenue: shift.totalQrisRevenue,
      totalRevenue: shift.totalRevenue,
    };

    const expectedCash =
      shift.expectedCash ?? shift.openingCash.plus(totals.totalCashRevenue);

    return {
      id: shift.id,
      branchId: shift.branchId,
      staffId: shift.staffId,
      staffName: shift.staff.name,
      closedById: shift.closedById,
      closedByName: shift.closedBy?.name ?? null,
      openingCash: shift.openingCash.toNumber(),
      expectedCash: expectedCash.toNumber(),
      actualCash: shift.actualCash?.toNumber() ?? null,
      cashVariance: shift.cashVariance?.toNumber() ?? null,
      totalCashOrders: totals.totalCashOrders,
      totalQrisOrders: totals.totalQrisOrders,
      totalCashRevenue: totals.totalCashRevenue.toNumber(),
      totalQrisRevenue: totals.totalQrisRevenue.toNumber(),
      totalRevenue: totals.totalRevenue.toNumber(),
      status: shift.status,
      notes: shift.closingNotes ?? shift.openingNotes ?? null,
      openingNotes: shift.openingNotes,
      closingNotes: shift.closingNotes,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      createdAt: shift.createdAt.toISOString(),
      updatedAt: shift.updatedAt.toISOString(),
    };
  }
}
