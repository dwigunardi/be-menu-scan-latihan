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
      updateStatus: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenusController],
      providers: [
        { provide: MenusService, useValue: mockMenusService },
      ],
    }).compile();

    controller = module.get<MenusController>(MenusController);
    menusService = module.get(MenusService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAllPublic', () => {
    it('should return all public menus matching query', async () => {
      const menus = [{ id: 'm1', name: 'Latte' }];
      menusService.findAllPublic.mockResolvedValue(menus as any);

      const result = await controller.findAllPublic({ categoryId: 'cat-1' });
      expect(result).toEqual(menus);
      expect(menusService.findAllPublic).toHaveBeenCalledWith({ categoryId: 'cat-1' });
    });
  });

  describe('findOnePublic', () => {
    it('should return menu detail by id', async () => {
      const menu = { id: 'm1', name: 'Latte' };
      menusService.findOnePublic.mockResolvedValue(menu as any);

      const result = await controller.findOnePublic('m1');
      expect(result).toEqual(menu);
      expect(menusService.findOnePublic).toHaveBeenCalledWith('m1');
    });
  });

  describe('findAllAdmin', () => {
    it('should return paginated admin menu list', async () => {
      const paginated = { data: [{ id: 'm1', name: 'Latte' }], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } };
      menusService.findAllAdmin.mockResolvedValue(paginated as any);

      const result = await controller.findAllAdmin({ page: 1, limit: 10 });
      expect(result).toEqual(paginated);
      expect(menusService.findAllAdmin).toHaveBeenCalledWith({ page: 1, limit: 10 });
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
      const updated = { item: { id: 'm1', isAvailable: false }, message: 'Updated' };
      menusService.updateStatus.mockResolvedValue(updated as any);

      const result = await controller.toggleStatus('m1', dto as any);
      expect(result).toEqual(updated);
      expect(menusService.updateStatus).toHaveBeenCalledWith('m1', dto);
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
