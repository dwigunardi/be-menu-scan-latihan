import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueryRevenueDto, QueryTopSellingDto } from './dto/report.dto';
import { Prisma } from '@prisma/client';
import { OrderStatus } from '../orders/orders.service';
import { paidOrderWhere } from '../orders/order-payment';
import {
  startOfBranchDay,
  toBranchDateRange,
} from '../../common/utils/branch-time';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin: Get Realtime Consolidated Dashboard Overview
   */
  async getDashboardOverview() {
    // Business day in WIB, independent of server timezone
    const paidToday = paidOrderWhere({ from: startOfBranchDay() });

    const [
      todayRevenueAggregate,
      todayPaidOrdersCount,
      activeOrdersCount,
      totalTables,
      occupiedTables,
      recentOrders,
      topSellingToday,
    ] = await Promise.all([
      // 1. Today's Revenue
      this.prisma.order.aggregate({
        where: paidToday,
        _sum: { totalAmount: true },
      }),
      // 2. Today's Paid Orders Count
      this.prisma.order.count({
        where: paidToday,
      }),
      // 3. Active Orders Count (Pending + Preparing)
      this.prisma.order.count({
        where: {
          status: { in: [OrderStatus.PENDING, OrderStatus.PREPARING] },
        },
      }),
      // 4. Total Tables
      this.prisma.table.count(),
      // 5. Occupied Tables
      this.prisma.table.count({
        where: {
          status: { in: ['OCCUPIED', 'WAITING_PAYMENT'] as any },
        },
      }),
      // 6. Recent Orders (Last 5)
      this.prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          table: { select: { number: true } },
          orderItems: { select: { id: true, menuNameSnapshot: true, quantity: true } },
        },
      }),
      // 7. Top 5 Selling Items Today
      this.prisma.orderItem.groupBy({
        by: ['menuItemId', 'menuNameSnapshot'],
        where: {
          order: paidToday,
        },
        _sum: {
          quantity: true,
          subtotal: true,
        },
        orderBy: {
          _sum: { quantity: 'desc' },
        },
        take: 5,
      }),
    ]);

    const todayRevenue = Number(todayRevenueAggregate._sum.totalAmount || 0);
    const occupancyRate = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;

    this.logger.log({
      step: 'DASHBOARD_OVERVIEW_FETCH',
      todayRevenue,
      activeOrdersCount,
      occupancyRate,
      msg: 'Dashboard overview fetched successfully',
    });

    return {
      kpi: {
        todayRevenue,
        todayOrdersCount: todayPaidOrdersCount,
        activeOrdersCount,
        tableOccupancy: {
          totalTables,
          occupiedTables,
          occupancyPercentage: occupancyRate,
        },
      },
      recentOrders: recentOrders.map((ord) => ({
        id: ord.id,
        orderNumber: ord.orderNumber,
        tableNumber: ord.table?.number || '-',
        customerName: ord.customerName,
        status: ord.status,
        totalAmount: Number(ord.totalAmount),
        itemCount: ord.orderItems.reduce((acc, item) => acc + item.quantity, 0),
        createdAt: ord.createdAt,
      })),
      topSellingToday: topSellingToday.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.menuNameSnapshot,
        quantitySold: item._sum.quantity || 0,
        revenue: Number(item._sum.subtotal || 0),
      })),
    };
  }

  /**
   * Admin: Get Revenue and Order Summary
   */
  async getRevenueReport(query: QueryRevenueDto) {
    const range = toBranchDateRange(query.startDate, query.endDate);
    // Revenue is recognised when paid (paidAt); the status breakdown covers orders created in range
    const where = paidOrderWhere(range);
    const createdInRange: Prisma.OrderWhereInput =
      range.from || range.to
        ? {
            createdAt: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : {};

    const [aggregate, totalOrders, ordersByStatus] = await Promise.all([
      this.prisma.order.aggregate({
        where,
        _sum: {
          totalAmount: true,
        },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: createdInRange,
        _count: {
          id: true,
        },
      }),
    ]);

    const totalRevenue = Number(aggregate._sum.totalAmount || 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      ordersByStatus: ordersByStatus.map((s: any) => ({
        status: s.status,
        count: s._count.id,
      })),
    };
  }

  /**
   * Admin: Get Top Selling Menu Items
   */
  async getTopSelling(query: QueryTopSellingDto) {
    const limit = query.limit ?? 5;
    const orderWhere = paidOrderWhere(
      toBranchDateRange(query.startDate, query.endDate),
    );

    const items = await this.prisma.orderItem.groupBy({
      by: ['menuItemId', 'menuNameSnapshot'],
      where: {
        order: orderWhere,
      },
      _sum: {
        quantity: true,
        subtotal: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: limit,
    });

    return items.map((item: any) => ({
      menuItemId: item.menuItemId,
      name: item.menuNameSnapshot,
      totalQuantitySold: item._sum.quantity || 0,
      totalRevenue: Number(item._sum.subtotal || 0),
    }));
  }
}
