import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateTableDto, TableSessionDto } from './dto/table.dto';

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

  /**
   * Public: Check table status, active customer, and persistent order history
   */
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

    return {
      tableId: table.id,
      number: table.number,
      status: table.status,
      activeCustomerName: table.activeCustomerName,
      activeOrderId: table.orders[0]?.id || null,
      activeOrderNumber: table.orders[0]?.orderNumber || null,
      activeOrders: (table.orders || []).map((ord) => ({
        id: ord.id,
        orderNumber: ord.orderNumber,
        status: ord.status,
        totalAmount: Number(ord.totalAmount),
        paidAt: ord.paidAt,
        createdAt: ord.createdAt,
        items: (ord.orderItems || []).map((item) => ({
          name: item.menuNameSnapshot,
          quantity: item.quantity,
          subtotal: Number(item.subtotal),
          selectedVariants: (item.selectedVariants || []).map((v) => ({
            groupName: v.groupNameSnapshot,
            optionName: v.optionNameSnapshot,
          })),
        })),
      })),
    };
  }

  /**
   * Public: Initialize guest table session with customer name
   */
  async initSession(tableNumber: string, dto: TableSessionDto) {
    const table = await this.prisma.table.findUnique({
      where: { number: tableNumber },
    });

    if (!table) {
      throw new NotFoundException(`Table "${tableNumber}" not found`);
    }

    const updated = await this.prisma.table.update({
      where: { number: tableNumber },
      data: {
        status: TableStatus.OCCUPIED,
        activeCustomerName: dto.customerName,
      },
    });

    if (this.eventsGateway) {
      this.eventsGateway.emitTableStatusChanged(updated);
    }

    this.logger.log({
      step: 'TABLE_SESSION_INIT',
      tableNumber,
      customerName: dto.customerName,
      msg: `Session initialized for table ${tableNumber} by ${dto.customerName}`,
    });

    return {
      tableId: updated.id,
      number: updated.number,
      status: updated.status,
      customerName: updated.activeCustomerName,
    };
  }

  /**
   * Admin: Find all tables
   */
  async findAllAdmin() {
    return this.prisma.table.findMany({
      orderBy: { number: 'asc' },
      include: {
        orders: {
          where: {
            status: { in: ['PENDING', 'PREPARING', 'SERVED'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  /**
   * Admin: Create new table
   */
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

  /**
   * Admin / Waiter: Reset table status to VACANT
   */
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
        status: TableStatus.VACANT,
        activeCustomerName: null,
      },
    });

    if (this.eventsGateway) {
      this.eventsGateway.emitTableStatusChanged(updated);
    }

    this.logger.log({
      step: 'TABLE_RESET',
      tableId: id,
      number: updated.number,
      msg: `Table ${updated.number} reset to VACANT`,
    });

    return {
      success: true,
      message: `Table ${updated.number} reset to VACANT successfully`,
      table: updated,
    };
  }

  /**
   * Admin: Delete table
   */
  async remove(id: string) {
    const table = await this.prisma.table.findUnique({
      where: { id },
      include: {
        orders: {
          where: {
            status: { in: ['PENDING', 'PREPARING'] },
          },
        },
      },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    if (table.orders.length > 0) {
      throw new ConflictException(
        `Cannot delete table ${table.number} because it has active pending orders`,
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

    return {
      success: true,
      message: `Table ${table.number} deleted successfully`,
    };
  }
}
