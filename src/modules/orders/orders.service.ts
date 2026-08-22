import { createPaginatedResult, getPrismaPagination } from '../../common/dto/pagination.dto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import {
  CreateOrderDto,
  QueryOrderDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { Prisma } from '@prisma/client';

export const OrderStatus = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  SERVED: 'SERVED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventsGateway?: EventsGateway,
  ) {}

  /**
   * Generates readable sequential order number: ORD-YYYYMMDD-XXX
   */
  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `ORD-${dateStr}`;

    const countToday = await this.prisma.order.count({
      where: {
        orderNumber: {
          startsWith: prefix,
        },
      },
    });

    const sequence = String(countToday + 1).padStart(3, '0');
    return `${prefix}-${sequence}`;
  }

  /**
   * Public: Place new customer order with nested variants snapshot in atomic transaction
   */
  async create(dto: CreateOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    // 1. Verify Table exists
    const table = await this.prisma.table.findUnique({
      where: { id: dto.tableId },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID ${dto.tableId} not found`);
    }

    // 2. Verify all MenuItems exist and are available
    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        deletedAt: null,
      },
    });

    if (menuItems.length !== menuItemIds.length) {
      throw new BadRequestException(
        'One or more ordered menu items do not exist or have been deleted',
      );
    }

    const menuMap = new Map(menuItems.map((m) => [m.id, m]));

    for (const item of dto.items) {
      const menu = menuMap.get(item.menuItemId);
      if (!menu?.isAvailable) {
        throw new BadRequestException(
          `Menu item "${menu?.name}" is currently out of stock`,
        );
      }
    }

    const orderNumber = await this.generateOrderNumber();

    // Process order items in transaction
    const order = await this.prisma.$transaction(async (tx) => {
      let totalAmount = 0;

      const preparedItems = dto.items.map((item) => {
        const menu = menuMap.get(item.menuItemId)!;
        const basePrice = menu.promoPrice ? Number(menu.promoPrice) : Number(menu.price);
        
        const extraVariantsTotal = (item.selectedVariants || []).reduce(
          (sum, v) => sum + Number(v.extraPrice || 0),
          0,
        );

        const unitPrice = basePrice + extraVariantsTotal;
        const subtotal = unitPrice * item.quantity;
        totalAmount += subtotal;

        return {
          menuItemId: item.menuItemId,
          menuNameSnapshot: menu.name,
          priceSnapshot: basePrice,
          quantity: item.quantity,
          subtotal,
          notes: item.notes || null,
          selectedVariants: item.selectedVariants || [],
        };
      });

      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          tableId: dto.tableId,
          customerName: dto.customerName,
          status: OrderStatus.PENDING,
          totalAmount,
          orderItems: {
            create: preparedItems.map((item) => ({
              menuItemId: item.menuItemId,
              menuNameSnapshot: item.menuNameSnapshot,
              priceSnapshot: item.priceSnapshot,
              quantity: item.quantity,
              subtotal: item.subtotal,
              notes: item.notes,
              selectedVariants: {
                create: item.selectedVariants.map((v) => ({
                  groupNameSnapshot: v.groupName,
                  optionNameSnapshot: v.optionName,
                  extraPriceSnapshot: v.extraPrice,
                })),
              },
            })),
          },
        },
        include: { table: { include: { zone: true } },
          orderItems: {
            include: {
              selectedVariants: true,
            },
          },
        },
      });

      // Update table to OCCUPIED and set active customer name
      await tx.table.update({
        where: { id: dto.tableId },
        data: {
          status: 'OCCUPIED' as any,
          activeCustomerName: dto.customerName,
        },
      });

      return newOrder;
    });

    this.logger.log({
      step: 'ORDER_CREATE',
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      totalAmount: order.totalAmount,
      msg: `Order ${order.orderNumber} placed for table ${table.number}`,
    });

    return order;
  }

  /**
   * Public: Track order status by orderNumber
   */
  async findByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        table: {
          select: { id: true, number: true },
        },
        orderItems: {
          include: {
            selectedVariants: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${orderNumber}" not found`);
    }

    return order;
  }

  /**
   * Admin / Staff: List orders with filters (Live KDS Monitor)
   */
  async findAllAdmin(query: QueryOrderDto = {}) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit !== undefined ? query.limit : 20;
    const { skip, take } = getPrismaPagination(page, limit);

    const where: Prisma.OrderWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.tableId) {
      where.tableId = query.tableId;
    }

    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
        include: {
          table: {
            select: { id: true, number: true },
          },
          orderItems: {
            include: {
              selectedVariants: true,
            },
          },
        },
      }),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  /**
   * Admin / Staff: Update order status (PENDING -> PAID -> PREPARING -> SERVED / CANCELLED)
   */
  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const data: Prisma.OrderUpdateInput = {
      status: dto.status,
    };

    if (dto.status === OrderStatus.PAID) {
      data.paidAt = new Date();
      if (existing.tableId) {
        await this.prisma.table.update({
          where: { id: existing.tableId },
          data: { status: 'WAITING_CLEANUP' as any },
        });
      }
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
      include: { table: { include: { zone: true } },
        orderItems: {
          include: {
            selectedVariants: true,
          },
        },
      },
    });

    // Real-Time WebSocket Alerts
    if (this.eventsGateway) {
      if (dto.status === OrderStatus.PAID) {
        this.eventsGateway.emitNewPaidOrder(updated);
      }
      this.eventsGateway.emitOrderStatusChanged(updated, updated.table?.number);
    }

    this.logger.log({
      step: 'ORDER_STATUS_UPDATE',
      orderId: id,
      orderNumber: updated.orderNumber,
      status: updated.status,
      msg: `Order ${updated.orderNumber} status changed to ${updated.status}`,
    });

    return updated;
  }
}
