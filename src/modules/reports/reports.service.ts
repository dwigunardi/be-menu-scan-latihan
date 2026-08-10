import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueryRevenueDto, QueryTopSellingDto } from './dto/report.dto';
import { Prisma } from '@prisma/client';
import { OrderStatus } from '../orders/orders.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin: Get Revenue and Order Summary
   */
  async getRevenueReport(query: QueryRevenueDto) {
    const where: Prisma.OrderWhereInput = {
      status: OrderStatus.PAID,
    };

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

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
    const orderWhere: Prisma.OrderWhereInput = {
      status: OrderStatus.PAID,
    };

    if (query.startDate || query.endDate) {
      orderWhere.createdAt = {};
      if (query.startDate) orderWhere.createdAt.gte = new Date(query.startDate);
      if (query.endDate) orderWhere.createdAt.lte = new Date(query.endDate);
    }

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
