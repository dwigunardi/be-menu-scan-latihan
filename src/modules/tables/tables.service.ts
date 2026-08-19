import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateTableDto, TableSessionDto, QueryTableDto } from './dto/table.dto';
import {
  createPaginatedResult,
  getPrismaPagination,
} from '../../common/dto/pagination.dto';

export const TableStatus = {
  VACANT: 'VACANT',
  OCCUPIED: 'OCCUPIED',
  WAITING_PAYMENT: 'WAITING_PAYMENT',
  WAITING_CLEANUP: 'WAITING_CLEANUP',
} as const;
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus];

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventsGateway?: EventsGateway,
  ) {}

  async getTableStatus(tableNumber: string) {
    const table = await this.prisma.table.findUnique({
      where: { number: tableNumber },
      include: {
        orders: {
          where: {
            status: { in: ['PENDING', 'PREPARING', 'SERVED', 'PAID'] },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            orderItems: {
              include: {
                selectedVariants: true,
              },
            },
          },
          take: 10,
        },
      },
    });

    if (!table) {
      throw new NotFoundException(`Table "${tableNumber}" not found`);
    }

    const latestActiveOrder = table.orders[0] || null;

    return {
      tableId: table.id,
      number: table.number,
      status: table.status,
      activeCustomerName: table.activeCustomerName,
      activeOrderId: latestActiveOrder?.id || null,
      activeOrderNumber: latestActiveOrder?.orderNumber || null,
      activeOrders: table.orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: Number(o.totalAmount),
        paidAt: o.paidAt,
        createdAt: o.createdAt,
        items: o.orderItems.map((item) => ({
          name: item.menuNameSnapshot,
          quantity: item.quantity,
          subtotal: Number(item.subtotal),
          selectedVariants: item.selectedVariants.map((v) => ({
            groupName: v.groupNameSnapshot,
            optionName: v.optionNameSnapshot,
          })),
        })),
      })),
    };
  }

  async initSession(tableNumber: string, dto: TableSessionDto) {
    const table = await this.prisma.table.findUnique({
      where: { number: tableNumber },
    });

    if (!table) {
      throw new NotFoundException(`Table "${tableNumber}" not found`);
    }

    const updated = await this.prisma.table.update({
      where: { id: table.id },
      data: {
        activeCustomerName: dto.customerName,
        status: TableStatus.OCCUPIED,
      },
    });

    if (this.eventsGateway) {
      this.eventsGateway.emitTableStatusChanged(updated);
    }

    this.logger.log({
      step: 'TABLE_SESSION_INIT',
      tableNumber,
      customerName: dto.customerName,
      msg: `Session created for table ${tableNumber} by ${dto.customerName}`,
    });

    return {
      tableId: updated.id,
      number: updated.number,
      status: updated.status,
      activeCustomerName: updated.activeCustomerName,
    };
  }

  async findAllAdmin(query: QueryTableDto = {}) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit !== undefined ? query.limit : -1;
    const { skip, take } = getPrismaPagination(page, limit);

    const where: Prisma.TableWhereInput = {};

    if (query.status) {
      where.status = query.status as any;
    }

    if (query.search) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        { activeCustomerName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.table.count({ where }),
      this.prisma.table.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy || 'number']: query.sortOrder || 'asc' },
        include: {
          orders: {
            where: {
              status: { in: ['PENDING', 'PREPARING', 'SERVED'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  async create(dto: CreateTableDto) {
    const existing = await this.prisma.table.findUnique({
      where: { number: dto.number },
    });

    if (existing) {
      throw new ConflictException(`Table "${dto.number}" already exists`);
    }

    const table = await this.prisma.table.create({
      data: {
        number: dto.number,
        status: TableStatus.VACANT,
      },
    });

    if (this.eventsGateway) {
      this.eventsGateway.emitTableStatusChanged(table);
    }

    this.logger.log({
      step: 'TABLE_CREATE',
      tableId: table.id,
      number: table.number,
      msg: `Table ${table.number} created`,
    });

    return table;
  }

  async resetTable(id: string) {
    const table = await this.prisma.table.findUnique({
      where: { id },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    const updated = await this.prisma.table.update({
      where: { id },
      data: {
        activeCustomerName: null,
        status: TableStatus.VACANT,
      },
    });

    if (this.eventsGateway) {
      this.eventsGateway.emitTableStatusChanged(updated);
    }

    this.logger.log({
      step: 'TABLE_RESET',
      tableId: table.id,
      number: table.number,
      msg: `Table ${table.number} reset to VACANT`,
    });

    return updated;
  }

  async remove(id: string) {
    const table = await this.prisma.table.findUnique({
      where: { id },
      include: {
        orders: {
          where: {
            status: { in: ['PENDING', 'PREPARING', 'SERVED'] },
          },
        },
      },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    if (table.orders.length > 0) {
      throw new ConflictException(
        `Cannot delete table ${table.number} while it has active orders`,
      );
    }

    await this.prisma.table.delete({
      where: { id },
    });

    this.logger.log({
      step: 'TABLE_DELETE',
      tableId: id,
      number: table.number,
      msg: `Table ${table.number} deleted`,
    });

    return { success: true, message: `Table ${table.number} deleted successfully` };
  }
}
