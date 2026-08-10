import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let categoriesService: jest.Mocked<CategoriesService>;

  beforeEach(async () => {
    const mockCategoriesService = {
      findAllPublic: jest.fn(),
      findAllAdmin: jest.fn(),
      create: jest.fn(),
      reorder: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
    categoriesService = module.get(CategoriesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPublicCategories', () => {
    it('should return active categories for public', async () => {
      const categories = [{ id: 'c1', name: 'Coffee', slug: 'coffee', itemCount: 5 }];
      categoriesService.findAllPublic.mockResolvedValue(categories as any);

      const result = await controller.getPublicCategories();
      expect(result).toEqual(categories);
      expect(categoriesService.findAllPublic).toHaveBeenCalled();
    });
  });

  describe('getAdminCategories', () => {
    it('should return all categories for admin', async () => {
      const categories = [{ id: 'c1', name: 'Coffee', sortOrder: 0 }];
      categoriesService.findAllAdmin.mockResolvedValue(categories as any);

      const result = await controller.getAdminCategories();
      expect(result).toEqual(categories);
      expect(categoriesService.findAllAdmin).toHaveBeenCalled();
    });
  });

  describe('createCategory', () => {
    it('should create new category', async () => {
      const dto = { name: 'Desserts', slug: 'desserts', sortOrder: 2 };
      const created = { id: 'c2', ...dto };
      categoriesService.create.mockResolvedValue(created as any);

      const result = await controller.createCategory(dto);
      expect(result).toEqual(created);
      expect(categoriesService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('reorderCategories', () => {
    it('should call categoriesService.reorder with items array', async () => {
      const dto = {
        items: [
          { id: '11111111-1111-1111-1111-111111111111', sortOrder: 1 },
          { id: '22222222-2222-2222-2222-222222222222', sortOrder: 2 },
        ],
      };
      const response = { success: true, message: 'Categories reordered successfully' };
      categoriesService.reorder.mockResolvedValue(response as any);

      const result = await controller.reorderCategories(dto);
      expect(result).toEqual(response);
      expect(categoriesService.reorder).toHaveBeenCalledWith(dto);
    });
  });

  describe('getCategoryDetail', () => {
    it('should return category detail', async () => {
      const category = { id: 'c1', name: 'Coffee' };
      categoriesService.findOne.mockResolvedValue(category as any);

      const result = await controller.getCategoryDetail('c1');
      expect(result).toEqual(category);
      expect(categoriesService.findOne).toHaveBeenCalledWith('c1');
    });
  });

  describe('updateCategory', () => {
    it('should update category and return updated data', async () => {
      const dto = { name: 'Specialty Coffee' };
      const updated = { id: 'c1', name: 'Specialty Coffee' };
      categoriesService.update.mockResolvedValue(updated as any);

      const result = await controller.updateCategory('c1', dto);
      expect(result).toEqual(updated);
      expect(categoriesService.update).toHaveBeenCalledWith('c1', dto);
    });
  });

  describe('deleteCategory', () => {
    it('should soft delete category and return confirmation', async () => {
      const response = { success: true, message: 'Category c1 deleted successfully' };
      categoriesService.remove.mockResolvedValue(response as any);

      const result = await controller.deleteCategory('c1');
      expect(result).toEqual(response);
      expect(categoriesService.remove).toHaveBeenCalledWith('c1');
    });
  });
});
