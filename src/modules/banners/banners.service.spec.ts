import { Test, TestingModule } from '@nestjs/testing';
import { BannersService } from './banners.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('BannersService', () => {
  let service: BannersService;
  let prismaService: any;

  const mockBanner = {
    id: 'banner-123',
    title: 'Diskon Kopi 20%',
    description: 'Promo akhir pekan',
    imageUrl: 'https://images.unsplash.com/promo.jpg',
    targetUrl: '/menu/kopi',
    sortOrder: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prismaService = {
      promoBanner: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BannersService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<BannersService>(BannersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllPublic', () => {
    it('should return active banners sorted by sortOrder', async () => {
      prismaService.promoBanner.findMany.mockResolvedValue([mockBanner]);

      const result = await service.findAllPublic();
      expect(result).toHaveLength(1);
      expect(prismaService.promoBanner.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('findAllAdmin', () => {
    it('should return all banners sorted by sortOrder', async () => {
      prismaService.promoBanner.findMany.mockResolvedValue([mockBanner]);

      const result = await service.findAllAdmin();
      expect(result).toHaveLength(1);
      expect(prismaService.promoBanner.findMany).toHaveBeenCalledWith({
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return banner when exists', async () => {
      prismaService.promoBanner.findUnique.mockResolvedValue(mockBanner);

      const result = await service.findOne('banner-123');
      expect(result.id).toBe('banner-123');
    });

    it('should throw NotFoundException when banner not found', async () => {
      prismaService.promoBanner.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a new banner with default values', async () => {
      prismaService.promoBanner.create.mockResolvedValue(mockBanner);

      const result = await service.create({
        title: 'Diskon Kopi 20%',
        imageUrl: 'https://images.unsplash.com/promo.jpg',
      });

      expect(result.title).toBe('Diskon Kopi 20%');
      expect(prismaService.promoBanner.create).toHaveBeenCalled();
    });

    it('should create a new banner with custom sortOrder and isActive', async () => {
      prismaService.promoBanner.create.mockResolvedValue({
        ...mockBanner,
        sortOrder: 5,
        isActive: false,
      });

      const result = await service.create({
        title: 'Diskon Kopi 20%',
        imageUrl: 'https://images.unsplash.com/promo.jpg',
        sortOrder: 5,
        isActive: false,
      });

      expect(result.sortOrder).toBe(5);
      expect(prismaService.promoBanner.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sortOrder: 5,
          isActive: false,
        }),
      });
    });
  });

  describe('update', () => {
    it('should update banner', async () => {
      prismaService.promoBanner.findUnique.mockResolvedValue(mockBanner);
      prismaService.promoBanner.update.mockResolvedValue({
        ...mockBanner,
        title: 'Updated Title',
      });

      const result = await service.update('banner-123', {
        title: 'Updated Title',
      });
      expect(result.title).toBe('Updated Title');
    });
  });

  describe('remove', () => {
    it('should delete banner', async () => {
      prismaService.promoBanner.findUnique.mockResolvedValue(mockBanner);
      prismaService.promoBanner.delete.mockResolvedValue(mockBanner);

      const result = await service.remove('banner-123');
      expect(result.success).toBe(true);
      expect(prismaService.promoBanner.delete).toHaveBeenCalledWith({
        where: { id: 'banner-123' },
      });
    });
  });
});
