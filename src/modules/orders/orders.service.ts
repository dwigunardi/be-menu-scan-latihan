import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  QueryOrderDto,
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

export const TableStatus = {
  VACANT: 'VACANT',
  OCCUPIED: 'OCCUPIED',
  WAITING_PAYMENT: 'WAITING_PAYMENT',
} as const;
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus];

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dateStr}-${randomSuffix}`;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public: Place a new order with cart items and selected modifiers
   */
  async create(dto: CreateOrderDto) {
    const table = await this.prisma.table.findUnique({
      where: { id: dto.tableId },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID ${dto.tableId} not found`);
    }

    // Fetch all requested menu items to calculate accurate prices
    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        deletedAt: null,
      },
    });

    const menuMap = new Map(menuItems.map((m) => [m.id, m]));

    for (const item of dto.items) {
      const menu = menuMap.get(item.menuItemId);
      if (!menu) {
        throw new BadRequestException(
          `Menu item with ID ${item.menuItemId} is not available`,
        );
      }
      if (!menu.isAvailable) {
        throw new BadRequestException(`Menu item "${menu.name}" is currently sold out`);
      }
    }

    const orderNumber = generateOrderNumber();

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
        include: {
          table: true,
          orderItems: {
            include: {
              selectedVariants: true,
            },
          },
        },
      });

      // Update table status
      await tx.table.update({
        where: { id: dto.tableId },
        data: {
          status: TableStatus.OCCUPIED,
          activeCustomerName: dto.customerName,
        },
      });

      return newOrder;
    });

    this.logger.log({
      step: 'ORDER_CREATE',
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableNumber: order.table.number,
      customerName: order.customerName,
      totalAmount: order.totalAmount,
      msg: `Order ${order.orderNumber} placed successfully`,
    });

    return order;
  }

  /**
   * Public: Check order status by orderNumber
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
      throw new NotFoundException(`Order with number "${orderNumber}" not found`);
    }

    return order;
  }

  /**
   * Admin: List live orders with filters and pagination
   */
  async findAllAdmin(query: QueryOrderDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.tableId) {
      where.tableId = query.tableId;
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

    const [total, data] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin: Update order status (PENDING -> PREPARING -> SERVED -> PAID / CANCELLED)
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
      include: {
        table: true,
        orderItems: {
          include: {
            selectedVariants: true,
          },
        },
      },
    });

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
