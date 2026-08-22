import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTableZoneDto, UpdateTableZoneDto } from './dto/table-zone.dto';

@Injectable()
export class TableZonesService {
  private readonly logger = new Logger(TableZonesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const zones = await this.prisma.tableZone.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { tables: true },
        },
        tables: {
          select: {
            id: true,
            number: true,
            capacity: true,
            status: true,
            seatingType: true,
            tags: true,
            activeCustomerName: true,
          },
        },
      },
    });

    return zones.map((zone) => {
      const totalTables = zone.tables.length;
      const vacantTables = zone.tables.filter((t) => t.status === 'VACANT').length;
      const occupiedTables = zone.tables.filter((t) => t.status === 'OCCUPIED').length;
      const totalCapacity = zone.tables.reduce((acc, t) => acc + (t.capacity || 0), 0);

      return {
        ...zone,
        tableCount: totalTables,
        vacantCount: vacantTables,
        occupiedCount: occupiedTables,
        totalCapacity,
      };
    });
  }

  async findOne(id: string) {
    const zone = await this.prisma.tableZone.findUnique({
      where: { id },
      include: {
        tables: true,
      },
    });

    if (!zone) {
      throw new NotFoundException(`Table Zone with ID ${id} not found`);
    }

    return zone;
  }

  async create(dto: CreateTableZoneDto) {
    const existing = await this.prisma.tableZone.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Zone with name "${dto.name}" already exists`);
    }

    const created = await this.prisma.tableZone.create({
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color || 'amber',
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    this.logger.log({
      step: 'ZONE_CREATE',
      zoneId: created.id,
      name: created.name,
      msg: `Table Zone "${created.name}" created`,
    });

    return created;
  }

  async update(id: string, dto: UpdateTableZoneDto) {
    await this.findOne(id);

    if (dto.name) {
      const conflict = await this.prisma.tableZone.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(`Zone with name "${dto.name}" already exists`);
      }
    }

    const updated = await this.prisma.tableZone.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color && { color: dto.color }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });

    this.logger.log({
      step: 'ZONE_UPDATE',
      zoneId: id,
      msg: `Table Zone "${updated.name}" updated`,
    });

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);

    // Set zoneId to null for all associated tables
    await this.prisma.table.updateMany({
      where: { zoneId: id },
      data: { zoneId: null },
    });

    await this.prisma.tableZone.delete({
      where: { id },
    });

    this.logger.log({
      step: 'ZONE_DELETE',
      zoneId: id,
      msg: `Table Zone ${id} deleted`,
    });

    return { success: true, message: 'Table Zone deleted successfully' };
  }
}
