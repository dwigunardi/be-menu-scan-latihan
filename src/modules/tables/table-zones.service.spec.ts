import { Test, TestingModule } from '@nestjs/testing';
import { TableZonesService } from './table-zones.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { TableStatus } from '@prisma/client';

describe('TableZonesService', () => {
  let service: TableZonesService;
  let prisma: any;

  const mockZone = {
    id: 'zone-1',
    name: 'Indoor Non-Smoking',
    description: 'Area ber-AC',
    color: 'emerald',
    sortOrder: 1,
    tables: [
      { id: 't-1', number: 'T01', capacity: 4, status: TableStatus.VACANT, seatingType: 'DINING', tags: [], activeCustomerName: null },
      { id: 't-2', number: 'T02', capacity: 2, status: TableStatus.OCCUPIED, seatingType: 'SOFA', tags: [], activeCustomerName: 'Andi' },
    ],
    _count: { tables: 2 },
  };

  beforeEach(async () => {
    prisma = {
      tableZone: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      table: {
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TableZonesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TableZonesService>(TableZonesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return zones with aggregated metrics', async () => {
      prisma.tableZone.findMany.mockResolvedValue([mockZone]);

      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].tableCount).toBe(2);
      expect(result[0].vacantCount).toBe(1);
      expect(result[0].occupiedCount).toBe(1);
      expect(result[0].totalCapacity).toBe(6);
    });
  });

  describe('findOne', () => {
    it('should return zone by id', async () => {
      prisma.tableZone.findUnique.mockResolvedValue(mockZone);

      const result = await service.findOne('zone-1');
      expect(result.id).toBe('zone-1');
    });

    it('should throw NotFoundException if zone does not exist', async () => {
      prisma.tableZone.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-zone')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create new table zone', async () => {
      prisma.tableZone.findUnique.mockResolvedValue(null);
      prisma.tableZone.create.mockResolvedValue({
        id: 'zone-2',
        name: 'Outdoor Terrace',
        description: 'Area merokok',
        color: 'amber',
        sortOrder: 2,
      });

      const result = await service.create({
        name: 'Outdoor Terrace',
        description: 'Area merokok',
        color: 'amber',
        sortOrder: 2,
      });

      expect(result.id).toBe('zone-2');
      expect(prisma.tableZone.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if zone name already exists', async () => {
      prisma.tableZone.findUnique.mockResolvedValue(mockZone);

      await expect(
        service.create({ name: 'Indoor Non-Smoking' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update zone info', async () => {
      prisma.tableZone.findUnique.mockResolvedValue(mockZone);
      prisma.tableZone.findFirst.mockResolvedValue(null);
      prisma.tableZone.update.mockResolvedValue({ ...mockZone, name: 'Indoor AC Reguler' });

      const result = await service.update('zone-1', { name: 'Indoor AC Reguler' });
      expect(result.name).toBe('Indoor AC Reguler');
    });

    it('should throw ConflictException if new name is taken by another zone', async () => {
      prisma.tableZone.findUnique.mockResolvedValue(mockZone);
      prisma.tableZone.findFirst.mockResolvedValue({ id: 'zone-2', name: 'Outdoor' });

      await expect(
        service.update('zone-1', { name: 'Outdoor' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should unbind tables and delete zone', async () => {
      prisma.tableZone.findUnique.mockResolvedValue(mockZone);
      prisma.table.updateMany.mockResolvedValue({ count: 2 });
      prisma.tableZone.delete.mockResolvedValue(mockZone);

      const result = await service.remove('zone-1');
      expect(result.success).toBe(true);
      expect(prisma.table.updateMany).toHaveBeenCalledWith({
        where: { zoneId: 'zone-1' },
        data: { zoneId: null },
      });
      expect(prisma.tableZone.delete).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
      });
    });
  });
});
