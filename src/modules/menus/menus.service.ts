import { createPaginatedResult } from '../../common/dto/pagination.dto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  CreateMenuDto,
  UpdateMenuDto,
  QueryMenuDto,
  ToggleMenuStatusDto,
} from './dto/menu.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class MenusService {
  private readonly logger = new Logger(MenusService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * Public: Browse menu items with filters and full variant structures (Redis Cached)
   */
  async findAllPublic(query: QueryMenuDto) {
    const cacheKey = `menuscan:cache:menus:query:${JSON.stringify(query)}`;
    if (this.redisService) {
      const cached = await this.redisService.get<any[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const where: Prisma.MenuItemWhereInput = {
      deletedAt: null,
      isAvailable: query.isAvailable !== undefined ? query.isAvailable : true,
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isBestSeller !== undefined) {
      where.isBestSeller = query.isBestSeller;
    }

    if (query.isRecommended !== undefined) {
      where.isRecommended = query.isRecommended;
    }

    const items = await this.prisma.menuItem.findMany({
      where,
      orderBy: [
        { isBestSeller: 'desc' },
        { isRecommended: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        variantGroups: {
          include: {
            options: {
              where: { isAvailable: true },
              orderBy: { extraPrice: 'asc' },
            },
          },
        },
      },
    });

    if (this.redisService) {
      await this.redisService.set(cacheKey, items, 300); // 5 mins TTL
    }

    return items;
  }

  /**
   * Public: Detail menu item with all variant options (Redis Cached)
   */
  async findOnePublic(id: string) {
    const cacheKey = `menuscan:cache:menus:item:${id}`;
    if (this.redisService) {
      const cached = await this.redisService.get<any>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const item = await this.prisma.menuItem.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        variantGroups: {
          include: {
            options: {
              where: { isAvailable: true },
              orderBy: { extraPrice: 'asc' },
            },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    if (this.redisService) {
      await this.redisService.set(cacheKey, item, 300);
    }

    return item;
  }

  /**
   * Admin: List all menu items with pagination and filters
   */
  async findAllAdmin(query: QueryMenuDto & { page?: number; limit?: number }) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const where: Prisma.MenuItemWhereInput = {
      deletedAt: null,
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isAvailable !== undefined) {
      where.isAvailable = query.isAvailable;
    }

    const [total, data] = await Promise.all([
      this.prisma.menuItem.count({ where }),
      this.prisma.menuItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          variantGroups: {
            include: {
              options: true,
            },
          },
        },
      }),
    ]);

    return createPaginatedResult(data, total, page, limit);
  }

  /**
   * Admin: Find one menu item detail
   */
  async findOneAdmin(id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        variantGroups: {
          include: {
            options: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    return item;
  }

  /**
   * Admin: Create menu item with nested variant groups and options
   */
  async create(dto: CreateMenuDto) {
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, deletedAt: null },
    });

    if (!category) {
      throw new BadRequestException(
        `Category with ID ${dto.categoryId} does not exist`,
      );
    }

    const item = await this.prisma.menuItem.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        promoPrice: dto.promoPrice,
        imageUrl: dto.imageUrl,
        isAvailable: dto.isAvailable ?? true,
        isBestSeller: dto.isBestSeller ?? false,
        isRecommended: dto.isRecommended ?? false,
        categoryId: dto.categoryId,
        variantGroups: {
          create: dto.variantGroups?.map((group) => ({
            name: group.name,
            isRequired: group.isRequired ?? false,
            minSelect: group.minSelect ?? 0,
            maxSelect: group.maxSelect ?? 1,
            options: {
              create: group.options.map((option) => ({
                name: option.name,
                extraPrice: option.extraPrice ?? 0,
                isAvailable: option.isAvailable ?? true,
              })),
            },
          })),
        },
      },
      include: {
        category: true,
        variantGroups: {
          include: {
            options: true,
          },
        },
      },
    });

    this.invalidateCache();

    this.logger.log({
      step: 'MENU_CREATE',
      menuId: item.id,
      name: item.name,
      msg: `Menu ${item.name} created`,
    });

    return item;
  }

  /**
   * Admin: Update menu item and replace variant groups atomically
   */
  async update(id: string, dto: UpdateMenuDto) {
    await this.findOneAdmin(id);

    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, deletedAt: null },
      });
      if (!category) {
        throw new BadRequestException(
          `Category with ID ${dto.categoryId} does not exist`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.variantGroups) {
        await tx.menuItemVariantGroup.deleteMany({
          where: { menuItemId: id },
        });

        for (const group of dto.variantGroups) {
          await tx.menuItemVariantGroup.create({
            data: {
              menuItemId: id,
              name: group.name,
              isRequired: group.isRequired ?? false,
              minSelect: group.minSelect ?? 0,
              maxSelect: group.maxSelect ?? 1,
              options: {
                create: group.options.map((option) => ({
                  name: option.name,
                  extraPrice: option.extraPrice ?? 0,
                  isAvailable: option.isAvailable ?? true,
                })),
              },
            },
          });
        }
      }

      return tx.menuItem.update({
        where: { id },
        data: {
          ...(dto.name && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.promoPrice !== undefined && { promoPrice: dto.promoPrice }),
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
          ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
          ...(dto.isBestSeller !== undefined && { isBestSeller: dto.isBestSeller }),
          ...(dto.isRecommended !== undefined && { isRecommended: dto.isRecommended }),
          ...(dto.categoryId && { categoryId: dto.categoryId }),
        },
        include: {
          category: true,
          variantGroups: {
            include: {
              options: true,
            },
          },
        },
      });
    });

    this.invalidateCache();

    this.logger.log({
      step: 'MENU_UPDATE',
      menuId: id,
      msg: `Menu ${id} updated`,
    });

    return updated;
  }

  /**
   * Admin / Kitchen / Cashier: Fast Toggle availability status (1-Click Out-of-Stock)
   */
  async updateStatus(id: string, dto: ToggleMenuStatusDto) {
    await this.findOneAdmin(id);

    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable: dto.isAvailable },
    });

    this.invalidateCache();

    this.logger.log({
      step: 'MENU_STATUS_TOGGLE',
      menuId: id,
      isAvailable: dto.isAvailable,
      msg: `Menu ${id} availability changed to ${dto.isAvailable}`,
    });

    return {
      success: true,
      message: `Menu availability updated to ${dto.isAvailable ? 'AVAILABLE' : 'OUT_OF_STOCK'}`,
      item: updated,
    };
  }

  /**
   * Admin: Soft delete menu item
   */
  async remove(id: string) {
    await this.findOneAdmin(id);

    await this.prisma.menuItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.invalidateCache();

    this.logger.log({
      step: 'MENU_DELETE',
      menuId: id,
      msg: `Menu ${id} soft deleted`,
    });

    return { success: true, message: `Menu item ${id} deleted successfully` };
  }

  private invalidateCache() {
    if (this.redisService) {
      this.redisService.delByPattern('menuscan:cache:menus:*');
      this.redisService.del('menuscan:cache:categories:public');
    }
  }
}
