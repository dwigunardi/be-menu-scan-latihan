import { Test, TestingModule } from '@nestjs/testing';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

describe('MenusController', () => {
  let controller: MenusController;
  let menusService: jest.Mocked<MenusService>;

  beforeEach(async () => {
    const mockMenusService = {
      findAllPublic: jest.fn(),
      findOnePublic: jest.fn(),
      findAllAdmin: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      toggleStatus: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenusController],
      providers: [
        {
          provide: MenusService,
          useValue: mockMenusService,
        },
      ],
    }).compile();

    controller = module.get<MenusController>(MenusController);
    menusService = module.get(MenusService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPublicMenus', () => {
    it('should return public menus list based on query', async () => {
      const query = { categoryId: 'cat-1', search: 'Latte' };
      const menus = [{ id: 'm1', name: 'Caramel Latte', price: 28000 }];
      menusService.findAllPublic.mockResolvedValue(menus as any);

      const result = await controller.getPublicMenus(query as any);
      expect(result).toEqual(menus);
      expect(menusService.findAllPublic).toHaveBeenCalledWith(query);
    });
  });

  describe('getPublicMenuDetail', () => {
    it('should return public menu detail with variants', async () => {
      const menu = { id: 'm1', name: 'Latte', variantGroups: [] };
      menusService.findOnePublic.mockResolvedValue(menu as any);

      const result = await controller.getPublicMenuDetail('m1');
      expect(result).toEqual(menu);
      expect(menusService.findOnePublic).toHaveBeenCalledWith('m1');
    });
  });

  describe('getAdminMenus', () => {
    it('should return paginated admin menus', async () => {
      const query = { page: 1, limit: 10 };
      const paginatedResult = {
        data: [{ id: 'm1', name: 'Latte' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      menusService.findAllAdmin.mockResolvedValue(paginatedResult as any);

      const result = await controller.getAdminMenus(query as any);
      expect(result).toEqual(paginatedResult);
      expect(menusService.findAllAdmin).toHaveBeenCalledWith(query);
    });
  });

  describe('createMenu', () => {
    it('should create menu and return created record', async () => {
      const dto = {
        name: 'Cappuccino',
        price: 25000,
        categoryId: 'cat-1',
      };
      const created = { id: 'm2', ...dto };
      menusService.create.mockResolvedValue(created as any);

      const result = await controller.createMenu(dto as any);
      expect(result).toEqual(created);
      expect(menusService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('getAdminMenuDetail', () => {
    it('should return admin menu detail', async () => {
      const menu = { id: 'm1', name: 'Latte' };
      menusService.findOnePublic.mockResolvedValue(menu as any);

      const result = await controller.getAdminMenuDetail('m1');
      expect(result).toEqual(menu);
      expect(menusService.findOnePublic).toHaveBeenCalledWith('m1');
    });
  });

  describe('updateMenu', () => {
    it('should update menu and return updated record', async () => {
      const dto = { price: 30000 };
      const updated = { id: 'm1', name: 'Latte', price: 30000 };
      menusService.update.mockResolvedValue(updated as any);

      const result = await controller.updateMenu('m1', dto as any);
      expect(result).toEqual(updated);
      expect(menusService.update).toHaveBeenCalledWith('m1', dto);
    });
  });

  describe('toggleStatus', () => {
    it('should fast toggle menu availability status', async () => {
      const dto = { isAvailable: false };
      const updated = { id: 'm1', isAvailable: false };
      menusService.toggleStatus.mockResolvedValue(updated as any);

      const result = await controller.toggleStatus('m1', dto as any);
      expect(result).toEqual(updated);
      expect(menusService.toggleStatus).toHaveBeenCalledWith('m1', dto);
    });
  });

  describe('deleteMenu', () => {
    it('should soft delete menu and return confirmation', async () => {
      const response = { success: true, message: 'Menu m1 deleted successfully' };
      menusService.remove.mockResolvedValue(response as any);

      const result = await controller.deleteMenu('m1');
      expect(result).toEqual(response);
      expect(menusService.remove).toHaveBeenCalledWith('m1');
    });
  });
});
