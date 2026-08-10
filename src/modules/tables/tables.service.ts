import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTableDto, TableSessionDto } from './dto/table.dto';

export const TableStatus = {
  VACANT: 'VACANT',
  OCCUPIED: 'OCCUPIED',
  WAITING_PAYMENT: 'WAITING_PAYMENT',
} as const;
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus];

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public: Check table status and active customer by table number
   */
  async getTableStatus(tableNumber: string) {
    const table = await this.prisma.table.findUnique({
      where: { number: tableNumber },
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
      where: { id: table.id },
      data: {
        status: TableStatus.OCCUPIED,
        activeCustomerName: dto.customerName,
      },
    });

    this.logger.log({
      step: 'TABLE_SESSION_INIT',
      tableId: table.id,
      tableNumber: table.number,
      customerName: dto.customerName,
      msg: `Customer "${dto.customerName}" initialized session on ${table.number}`,
    });

    return {
      tableId: updated.id,
      number: updated.number,
      status: updated.status,
      customerName: updated.activeCustomerName,
    };
  }

  /**
   * Admin: List all tables with status and active orders
   */
  async findAllAdmin() {
    return this.prisma.table.findMany({
      orderBy: {
        number: 'asc',
      },
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
      throw new ConflictException(`Table with number "${dto.number}" already exists`);
    }

    const table = await this.prisma.table.create({
      data: {
        number: dto.number,
        status: TableStatus.VACANT,
      },
    });

    this.logger.log({
      step: 'TABLE_CREATE',
      tableId: table.id,
      number: table.number,
      msg: `Table ${table.number} created`,
    });

    return table;
  }

  /**
   * Admin: Reset table status to VACANT
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
          where: { status: { in: ['PENDING', 'PREPARING', 'SERVED'] } },
        },
      },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    if (table.orders.length > 0) {
      throw new ConflictException(
        `Cannot delete table ${table.number} with active orders`,
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
