import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prismaService: any;

  const mockCategory = {
    id: 'cat-123',
    name: 'Coffee',
    slug: 'coffee',
    sortOrder: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prismaService = {
      category: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      menuItem: {
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllPublic', () => {
    it('should return active categories ordered by sortOrder', async () => {
      prismaService.category.findMany.mockResolvedValue([mockCategory]);

      const result = await service.findAllPublic();
      expect(result).toHaveLength(1);
      expect(prismaService.category.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: expect.any(Object),
      });
    });
  });

  describe('findAllAdmin', () => {
    it('should return all categories for admin', async () => {
      prismaService.category.findMany.mockResolvedValue([mockCategory]);

      const result = await service.findAllAdmin();
      expect(result).toHaveLength(1);
      expect(prismaService.category.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: expect.any(Object),
      });
    });
  });

  describe('findOne', () => {
    it('should return category when found', async () => {
      prismaService.category.findFirst.mockResolvedValue(mockCategory);

      const result = await service.findOne('cat-123');
      expect(result.id).toBe('cat-123');
    });

    it('should throw NotFoundException if category not found', async () => {
      prismaService.category.findFirst.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a new category with generated slug', async () => {
      prismaService.category.findFirst.mockResolvedValue(null);
      prismaService.category.create.mockResolvedValue(mockCategory);

      const result = await service.create({ name: 'Coffee', sortOrder: 1 });
      expect(result.name).toBe('Coffee');
      expect(prismaService.category.create).toHaveBeenCalledWith({
        data: {
          name: 'Coffee',
          slug: 'coffee',
          sortOrder: 1,
        },
      });
    });

    it('should throw ConflictException if slug already exists and not deleted', async () => {
      prismaService.category.findFirst.mockResolvedValue(mockCategory);

      await expect(
        service.create({ name: 'Coffee', sortOrder: 1 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update category name and sortOrder', async () => {
      // First findOne, then findFirst for unique check (returns null meaning slug is unique)
      prismaService.category.findFirst
        .mockResolvedValueOnce(mockCategory)
        .mockResolvedValueOnce(null);

      prismaService.category.update.mockResolvedValue({
        ...mockCategory,
        name: 'Specialty Coffee',
        sortOrder: 5,
      });

      const result = await service.update('cat-123', {
        name: 'Specialty Coffee',
        sortOrder: 5,
      });
      expect(result.name).toBe('Specialty Coffee');
      expect(prismaService.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-123' },
        data: {
          name: 'Specialty Coffee',
          slug: 'specialty-coffee',
          sortOrder: 5,
        },
      });
    });
  });

  describe('remove', () => {
    it('should soft delete category by setting deletedAt', async () => {
      prismaService.category.findFirst.mockResolvedValue(mockCategory);
      prismaService.menuItem.count.mockResolvedValue(0);
      prismaService.category.update.mockResolvedValue({
        ...mockCategory,
        deletedAt: new Date(),
      });

      const result = await service.remove('cat-123');
      expect(result.success).toBe(true);
      expect(prismaService.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-123' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should throw ConflictException if category still contains active items', async () => {
      prismaService.category.findFirst.mockResolvedValue(mockCategory);
      prismaService.menuItem.count.mockResolvedValue(3);

      await expect(service.remove('cat-123')).rejects.toThrow(ConflictException);
    });
  });

  describe('reorder', () => {
    it('should execute batch update in transaction', async () => {
      prismaService.$transaction.mockResolvedValue([]);

      const result = await service.reorder({
        items: [
          { id: '11111111-1111-1111-1111-111111111111', sortOrder: 1 },
          { id: '22222222-2222-2222-2222-222222222222', sortOrder: 2 },
        ],
      });

      expect(result.success).toBe(true);
      expect(prismaService.$transaction).toHaveBeenCalled();
    });
  });
});
