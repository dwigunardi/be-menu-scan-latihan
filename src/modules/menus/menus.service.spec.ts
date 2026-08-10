import { Test, TestingModule } from '@nestjs/testing';
import { MenusService } from './menus.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('MenusService', () => {
  let service: MenusService;
  let prismaService: any;

  const mockMenu = {
    id: 'menu-123',
    name: 'Caramel Macchiato',
    description: 'Espresso with vanilla and caramel drizzle',
    price: 35000,
    promoPrice: 30000,
    imageUrl: 'https://img.com/caramel.jpg',
    isAvailable: true,
    isBestSeller: true,
    isRecommended: false,
    categoryId: 'cat-123',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: 'cat-123', name: 'Coffee', slug: 'coffee' },
    variantGroups: [],
  };

  beforeEach(async () => {
    prismaService = {
      menuItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      category: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenusService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<MenusService>(MenusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllPublic', () => {
    it('should return available menu items', async () => {
      prismaService.menuItem.findMany.mockResolvedValue([mockMenu]);

      const result = await service.findAllPublic({});
      expect(result).toHaveLength(1);
      expect(prismaService.menuItem.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, isAvailable: true },
        orderBy: expect.any(Array),
        include: expect.any(Object),
      });
    });

    it('should filter by category and search query', async () => {
      prismaService.menuItem.findMany.mockResolvedValue([mockMenu]);

      await service.findAllPublic({
        categoryId: 'cat-123',
        search: 'Caramel',
      });

      expect(prismaService.menuItem.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          isAvailable: true,
          categoryId: 'cat-123',
          OR: [
            { name: { contains: 'Caramel', mode: 'insensitive' } },
            { description: { contains: 'Caramel', mode: 'insensitive' } },
          ],
        },
        orderBy: expect.any(Array),
        include: expect.any(Object),
      });
    });
  });

  describe('findOnePublic', () => {
    it('should return menu item detail with variants', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(mockMenu);

      const result = await service.findOnePublic('menu-123');
      expect(result.id).toBe('menu-123');
    });

    it('should throw NotFoundException if menu item not found', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(null);

      await expect(service.findOnePublic('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllAdmin', () => {
    it('should return paginated admin menu items list', async () => {
      prismaService.menuItem.count.mockResolvedValue(1);
      prismaService.menuItem.findMany.mockResolvedValue([mockMenu]);

      const result = await service.findAllAdmin({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('create', () => {
    it('should create menu item with nested variants', async () => {
      prismaService.category.findFirst.mockResolvedValue({ id: 'cat-123' });
      prismaService.menuItem.create.mockResolvedValue(mockMenu);

      const dto = {
        name: 'Caramel Macchiato',
        price: 35000,
        categoryId: 'cat-123',
        variantGroups: [
          {
            name: 'Size',
            isRequired: true,
            minSelect: 1,
            maxSelect: 1,
            options: [{ name: 'Regular', extraPrice: 0, isAvailable: true }],
          },
        ],
      };

      const result = await service.create(dto);
      expect(result.name).toBe('Caramel Macchiato');
      expect(prismaService.menuItem.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if category does not exist', async () => {
      prismaService.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Caramel Macchiato',
          price: 35000,
          categoryId: 'invalid-cat',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update menu item and sync variant groups inside transaction', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(mockMenu);
      prismaService.category.findFirst.mockResolvedValue({ id: 'cat-123' });
      prismaService.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          menuItemVariantGroup: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            create: jest.fn().mockResolvedValue({ id: 'vg-1' }),
          },
          menuItem: {
            update: jest.fn().mockResolvedValue({
              ...mockMenu,
              price: 40000,
            }),
          },
        };
        return cb(tx);
      });

      const result = await service.update('menu-123', {
        categoryId: 'cat-123',
        price: 40000,
        variantGroups: [
          {
            name: 'Sugar Level',
            isRequired: false,
            minSelect: 0,
            maxSelect: 1,
            options: [{ name: 'Less Sugar', extraPrice: 0 }],
          },
        ],
      });

      expect(result.price).toBe(40000);
      expect(prismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update isAvailable field', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(mockMenu);
      prismaService.menuItem.update.mockResolvedValue({
        ...mockMenu,
        isAvailable: false,
      });

      const result = await service.updateStatus('menu-123', {
        isAvailable: false,
      });

      expect(result.item.isAvailable).toBe(false);
      expect(prismaService.menuItem.update).toHaveBeenCalledWith({
        where: { id: 'menu-123' },
        data: { isAvailable: false },
      });
    });

    it('should throw NotFoundException if menu to toggle not found', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus('invalid-id', { isAvailable: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete menu item', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(mockMenu);
      prismaService.menuItem.update.mockResolvedValue({
        ...mockMenu,
        deletedAt: new Date(),
      });

      const result = await service.remove('menu-123');
      expect(result.success).toBe(true);
      expect(prismaService.menuItem.update).toHaveBeenCalledWith({
        where: { id: 'menu-123' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
