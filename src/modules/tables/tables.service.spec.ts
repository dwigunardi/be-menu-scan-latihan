import { Test, TestingModule } from '@nestjs/testing';
import { TablesService, TableStatus } from './tables.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('TablesService', () => {
  let service: TablesService;
  let prismaService: any;

  const mockTable = {
    id: 'table-123',
    number: 'Meja 01',
    status: TableStatus.VACANT,
    activeCustomerName: null,
    orders: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prismaService = {
      table: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<TablesService>(TablesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTableStatus', () => {
    it('should return table status with null activeOrder when no orders', async () => {
      prismaService.table.findUnique.mockResolvedValue(mockTable);

      const result = await service.getTableStatus('Meja 01');
      expect(result.number).toBe('Meja 01');
      expect(result.status).toBe(TableStatus.VACANT);
      expect(result.activeOrderId).toBeNull();
    });

    it('should return activeOrderId when table has active order', async () => {
      prismaService.table.findUnique.mockResolvedValue({
        ...mockTable,
        orders: [{ id: 'order-1', orderNumber: 'ORD-001' }],
      });

      const result = await service.getTableStatus('Meja 01');
      expect(result.activeOrderId).toBe('order-1');
      expect(result.activeOrderNumber).toBe('ORD-001');
    });

    it('should throw NotFoundException if table not found', async () => {
      prismaService.table.findUnique.mockResolvedValue(null);

      await expect(service.getTableStatus('Invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('initSession', () => {
    it('should update table status to OCCUPIED and set active customer', async () => {
      prismaService.table.findUnique.mockResolvedValue(mockTable);
      prismaService.table.update.mockResolvedValue({
        ...mockTable,
        status: TableStatus.OCCUPIED,
        activeCustomerName: 'John Doe',
      });

      const result = await service.initSession('Meja 01', {
        customerName: 'John Doe',
      });

      expect(result.customerName).toBe('John Doe');
      expect(result.status).toBe(TableStatus.OCCUPIED);
    });

    it('should throw NotFoundException if table not found', async () => {
      prismaService.table.findUnique.mockResolvedValue(null);

      await expect(
        service.initSession('Invalid', { customerName: 'John' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllAdmin', () => {
    it('should return all tables sorted by number', async () => {
      prismaService.table.findMany.mockResolvedValue([mockTable]);

      const result = await service.findAllAdmin();
      expect(result).toHaveLength(1);
      expect(prismaService.table.findMany).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create new table', async () => {
      prismaService.table.findUnique.mockResolvedValue(null);
      prismaService.table.create.mockResolvedValue(mockTable);

      const result = await service.create({ number: 'Meja 01' });
      expect(result.number).toBe('Meja 01');
    });

    it('should throw ConflictException if number exists', async () => {
      prismaService.table.findUnique.mockResolvedValue(mockTable);

      await expect(service.create({ number: 'Meja 01' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('resetTable', () => {
    it('should set table status back to VACANT', async () => {
      prismaService.table.findUnique.mockResolvedValue(mockTable);
      prismaService.table.update.mockResolvedValue({
        ...mockTable,
        status: TableStatus.VACANT,
        activeCustomerName: null,
      });

      const result = await service.resetTable('table-123');
      expect(result.success).toBe(true);
      expect(result.table.status).toBe(TableStatus.VACANT);
    });

    it('should throw NotFoundException if table to reset not found', async () => {
      prismaService.table.findUnique.mockResolvedValue(null);

      await expect(service.resetTable('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete table successfully when no active orders', async () => {
      prismaService.table.findUnique.mockResolvedValue({
        ...mockTable,
        orders: [],
      });
      prismaService.table.delete.mockResolvedValue(mockTable);

      const result = await service.remove('table-123');
      expect(result.success).toBe(true);
      expect(prismaService.table.delete).toHaveBeenCalledWith({
        where: { id: 'table-123' },
      });
    });

    it('should throw NotFoundException if table to delete not found', async () => {
      prismaService.table.findUnique.mockResolvedValue(null);

      await expect(service.remove('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if table has active orders', async () => {
      prismaService.table.findUnique.mockResolvedValue({
        ...mockTable,
        orders: [{ id: 'ord-1', status: 'PENDING' }],
      });

      await expect(service.remove('table-123')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
