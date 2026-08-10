import { Test, TestingModule } from '@nestjs/testing';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

describe('BannersController', () => {
  let controller: BannersController;
  let bannersService: jest.Mocked<BannersService>;

  beforeEach(async () => {
    const mockBannersService = {
      findAllPublic: jest.fn(),
      findAllAdmin: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BannersController],
      providers: [
        {
          provide: BannersService,
          useValue: mockBannersService,
        },
      ],
    }).compile();

    controller = module.get<BannersController>(BannersController);
    bannersService = module.get(BannersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPublicBanners', () => {
    it('should return active banners', async () => {
      const mockBanners = [{ id: 'b1', title: 'Promo Diskon', isActive: true }];
      bannersService.findAllPublic.mockResolvedValue(mockBanners as any);

      const result = await controller.getPublicBanners();
      expect(result).toEqual(mockBanners);
      expect(bannersService.findAllPublic).toHaveBeenCalled();
    });
  });

  describe('getAdminBanners', () => {
    it('should return all banners for admin', async () => {
      const mockBanners = [{ id: 'b1', title: 'Promo Diskon' }];
      bannersService.findAllAdmin.mockResolvedValue(mockBanners as any);

      const result = await controller.getAdminBanners();
      expect(result).toEqual(mockBanners);
      expect(bannersService.findAllAdmin).toHaveBeenCalled();
    });
  });

  describe('createBanner', () => {
    it('should create and return new banner', async () => {
      const dto = {
        title: 'New Promo',
        imageUrl: 'https://img.com/banner.jpg',
        sortOrder: 1,
        isActive: true,
      };
      const createdBanner = { id: 'b2', ...dto };
      bannersService.create.mockResolvedValue(createdBanner as any);

      const result = await controller.createBanner(dto);
      expect(result).toEqual(createdBanner);
      expect(bannersService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('getBannerDetail', () => {
    it('should return single banner by id', async () => {
      const banner = { id: 'b1', title: 'Promo' };
      bannersService.findOne.mockResolvedValue(banner as any);

      const result = await controller.getBannerDetail('b1');
      expect(result).toEqual(banner);
      expect(bannersService.findOne).toHaveBeenCalledWith('b1');
    });
  });

  describe('updateBanner', () => {
    it('should update banner and return updated data', async () => {
      const dto = { title: 'Updated Promo' };
      const updatedBanner = { id: 'b1', title: 'Updated Promo' };
      bannersService.update.mockResolvedValue(updatedBanner as any);

      const result = await controller.updateBanner('b1', dto);
      expect(result).toEqual(updatedBanner);
      expect(bannersService.update).toHaveBeenCalledWith('b1', dto);
    });
  });

  describe('deleteBanner', () => {
    it('should delete banner and return deletion message', async () => {
      const deleteResult = { success: true, message: 'Banner b1 deleted successfully' };
      bannersService.remove.mockResolvedValue(deleteResult as any);

      const result = await controller.deleteBanner('b1');
      expect(result).toEqual(deleteResult);
      expect(bannersService.remove).toHaveBeenCalledWith('b1');
    });
  });
});
