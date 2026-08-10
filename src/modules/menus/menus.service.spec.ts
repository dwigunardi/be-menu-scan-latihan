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
    promoPrice: null,
    categoryId: 'cat-123',
    imageUrl: 'https://images.unsplash.com/coffee.jpg',
    isAvailable: true,
    isBestSeller: true,
    isRecommended: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    variantGroups: [],
  };

  beforeEach(async () => {
    prismaService = {
      menuItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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
    it('should return menu items with variant groups and applied filters', async () => {
      prismaService.menuItem.findMany.mockResolvedValue([mockMenu]);

      const result = await service.findAllPublic({
        categoryId: 'cat-123',
        search: 'caramel',
        isBestSeller: true,
        isRecommended: false,
        isAvailable: true,
      });
      expect(result).toHaveLength(1);
      expect(prismaService.menuItem.findMany).toHaveBeenCalled();
    });
  });

  describe('findOnePublic', () => {
    it('should return single menu with details', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(mockMenu);

      const result = await service.findOnePublic('menu-123');
      expect(result.id).toBe('menu-123');
    });

    it('should throw NotFoundException if not found', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(null);

      await expect(service.findOnePublic('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllAdmin', () => {
    it('should return paginated menu items with category and search filter', async () => {
      prismaService.menuItem.count.mockResolvedValue(1);
      prismaService.menuItem.findMany.mockResolvedValue([mockMenu]);

      const result = await service.findAllAdmin({
        page: 1,
        limit: 10,
        categoryId: 'cat-123',
        search: 'espresso',
        isAvailable: true,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('create', () => {
    it('should create menu item without variant groups', async () => {
      prismaService.category.findFirst.mockResolvedValue({ id: 'cat-123' });
      prismaService.menuItem.create.mockResolvedValue(mockMenu);

      const result = await service.create({
        name: 'Caramel Macchiato',
        price: 35000,
        categoryId: 'cat-123',
      });

      expect(result.name).toBe('Caramel Macchiato');
      expect(prismaService.menuItem.create).toHaveBeenCalled();
    });

    it('should create menu item with nested variant groups and options', async () => {
      prismaService.category.findFirst.mockResolvedValue({ id: 'cat-123' });
      prismaService.menuItem.create.mockResolvedValue(mockMenu);

      const result = await service.create({
        name: 'Caramel Macchiato',
        price: 35000,
        categoryId: 'cat-123',
        variantGroups: [
          {
            name: 'Ukuran',
            isRequired: true,
            minSelect: 1,
            maxSelect: 1,
            options: [
              { name: 'Regular', extraPrice: 0, isAvailable: true },
              { name: 'Large', extraPrice: 5000, isAvailable: true },
            ],
          },
        ],
      });

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
    it('should throw NotFoundException if menu to update is not found', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(null);

      await expect(service.update('invalid-id', { price: 40000 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if new category does not exist', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(mockMenu);
      prismaService.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update('menu-123', { categoryId: 'invalid-cat' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update menu item and sync variant groups inside transaction', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(mockMenu);
      prismaService.category.findFirst.mockResolvedValue({ id: 'cat-123' });
      prismaService.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          menuItemVariantGroup: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            create: jest.fn().mockResolvedValue({ id: 'vg-1' }),
          },
        };
        return cb(tx);
      });
      prismaService.menuItem.update.mockResolvedValue({
        ...mockMenu,
        price: 40000,
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
      expect(prismaService.menuItem.update).toHaveBeenCalled();
    });
  });

  describe('toggleStatus', () => {
    it('should update isAvailable field', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(mockMenu);
      prismaService.menuItem.update.mockResolvedValue({
        ...mockMenu,
        isAvailable: false,
      });

      const result = await service.toggleStatus('menu-123', {
        isAvailable: false,
      });

      expect(result.isAvailable).toBe(false);
      expect(prismaService.menuItem.update).toHaveBeenCalledWith({
        where: { id: 'menu-123' },
        data: { isAvailable: false },
      });
    });

    it('should throw NotFoundException if menu to toggle not found', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(null);

      await expect(
        service.toggleStatus('invalid-id', { isAvailable: false }),
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

    it('should throw NotFoundException if menu to delete not found', async () => {
      prismaService.menuItem.findFirst.mockResolvedValue(null);

      await expect(service.remove('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
