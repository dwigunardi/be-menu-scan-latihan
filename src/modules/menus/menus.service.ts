import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public: Browse menu items with filters and full variant structures
   */
  async findAllPublic(query: QueryMenuDto) {
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

    return this.prisma.menuItem.findMany({
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
  }

  /**
   * Public: Detail menu item with all variant options
   */
  async findOnePublic(id: string) {
    const menuItem = await this.prisma.menuItem.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        variantGroups: {
          include: {
            options: {
              orderBy: { extraPrice: 'asc' },
            },
          },
        },
      },
    });

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    return menuItem;
  }

  /**
   * Admin: List menu items with pagination and filters
   */
  async findAllAdmin(query: QueryMenuDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
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
          category: {
            select: { id: true, name: true, slug: true },
          },
          variantGroups: {
            include: {
              options: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin: Create menu item with nested variant groups and options
   */
  async create(dto: CreateMenuDto) {
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, deletedAt: null },
    });

    if (!category) {
      throw new BadRequestException('Category not found or deleted');
    }

    const menuItem = await this.prisma.menuItem.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        promoPrice: dto.promoPrice,
        categoryId: dto.categoryId,
        imageUrl: dto.imageUrl,
        isBestSeller: dto.isBestSeller ?? false,
        isRecommended: dto.isRecommended ?? false,
        isAvailable: dto.isAvailable ?? true,
        variantGroups: dto.variantGroups?.length
          ? {
              create: dto.variantGroups.map((group) => ({
                name: group.name,
                isRequired: group.isRequired ?? false,
                minSelect: group.minSelect ?? 0,
                maxSelect: group.maxSelect ?? 1,
                options: {
                  create: group.options.map((opt) => ({
                    name: opt.name,
                    extraPrice: opt.extraPrice ?? 0,
                    isAvailable: opt.isAvailable ?? true,
                  })),
                },
              })),
            }
          : undefined,
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

    this.logger.log({
      step: 'MENU_CREATE',
      menuId: menuItem.id,
      name: menuItem.name,
      msg: `Menu item ${menuItem.name} created`,
    });

    return menuItem;
  }

  /**
   * Admin: Update menu item
   */
  async update(id: string, dto: UpdateMenuDto) {
    const existing = await this.prisma.menuItem.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, deletedAt: null },
      });
      if (!category) {
        throw new BadRequestException('Category not found');
      }
    }

    // If variantGroups are provided, recreate them in a transaction
    if (dto.variantGroups) {
      await this.prisma.$transaction(async (tx) => {
        await tx.menuItemVariantGroup.deleteMany({
          where: { menuItemId: id },
        });

        if (dto.variantGroups && dto.variantGroups.length > 0) {
          for (const group of dto.variantGroups) {
            await tx.menuItemVariantGroup.create({
              data: {
                menuItemId: id,
                name: group.name,
                isRequired: group.isRequired ?? false,
                minSelect: group.minSelect ?? 0,
                maxSelect: group.maxSelect ?? 1,
                options: {
                  create: group.options.map((opt) => ({
                    name: opt.name,
                    extraPrice: opt.extraPrice ?? 0,
                    isAvailable: opt.isAvailable ?? true,
                  })),
                },
              },
            });
          }
        }
      });
    }

    const { variantGroups, ...updateFields } = dto;

    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: updateFields,
      include: {
        category: true,
        variantGroups: {
          include: {
            options: true,
          },
        },
      },
    });

    this.logger.log({
      step: 'MENU_UPDATE',
      menuId: id,
      msg: `Menu item ${id} updated`,
    });

    return updated;
  }

  /**
   * Admin: Fast toggle isAvailable status
   */
  async toggleStatus(id: string, dto: ToggleMenuStatusDto) {
    const existing = await this.prisma.menuItem.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable: dto.isAvailable },
    });

    this.logger.log({
      step: 'MENU_TOGGLE_STATUS',
      menuId: id,
      isAvailable: dto.isAvailable,
      msg: `Menu item ${id} status set to ${dto.isAvailable}`,
    });

    return updated;
  }

  /**
   * Admin: Soft delete menu item
   */
  async remove(id: string) {
    const existing = await this.prisma.menuItem.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    await this.prisma.menuItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log({
      step: 'MENU_DELETE',
      menuId: id,
      msg: `Menu item ${id} soft-deleted`,
    });

    return {
      success: true,
      message: `Menu item ${id} deleted successfully`,
    };
  }
}
