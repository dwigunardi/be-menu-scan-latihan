import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderCategoryDto,
} from './dto/category.dto';

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);
  private readonly CACHE_KEY = 'menuscan:cache:categories:public';

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  /**
   * Public: List all active categories with available item counts (Redis Cached)
   */
  async findAllPublic() {
    if (this.redisService) {
      const cached = await this.redisService.get<any[]>(this.CACHE_KEY);
      if (cached) {
        return cached;
      }
    }

    const categories = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        sortOrder: 'asc',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        sortOrder: true,
        _count: {
          select: {
            menuItems: {
              where: {
                isAvailable: true,
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (this.redisService) {
      await this.redisService.set(this.CACHE_KEY, categories, 300); // 5 mins TTL
    }

    return categories;
  }

  /**
   * Admin: List all categories (including item total counts)
   */
  async findAllAdmin() {
    return this.prisma.category.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        sortOrder: 'asc',
      },
      include: {
        _count: {
          select: {
            menuItems: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });
  }

  /**
   * Admin: Find single category
   */
  async findOne(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  /**
   * Admin: Create new category
   */
  async create(dto: CreateCategoryDto) {
    const slug = slugify(dto.name);

    const existing = await this.prisma.category.findFirst({
      where: { slug, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const lastCategory = await this.prisma.category.findFirst({
        where: { deletedAt: null },
        orderBy: { sortOrder: 'desc' },
      });
      sortOrder = (lastCategory?.sortOrder ?? 0) + 1;
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        sortOrder,
      },
    });

    this.invalidateCache();

    this.logger.log({
      step: 'CATEGORY_CREATE',
      categoryId: category.id,
      name: category.name,
      msg: `Category ${category.name} created`,
    });

    return category;
  }

  /**
   * Admin: Update category
   */
  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);

    let slug: string | undefined;
    if (dto.name) {
      slug = slugify(dto.name);
      const existing = await this.prisma.category.findFirst({
        where: { slug, deletedAt: null, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException(`Category "${dto.name}" already exists`);
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name, slug }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });

    this.invalidateCache();

    this.logger.log({
      step: 'CATEGORY_UPDATE',
      categoryId: id,
      msg: `Category ${id} updated`,
    });

    return updated;
  }

  /**
   * Admin: Reorder multiple categories at once
   */
  async reorder(dto: ReorderCategoryDto) {
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.category.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    this.invalidateCache();

    this.logger.log({
      step: 'CATEGORY_REORDER',
      totalUpdated: dto.items.length,
      msg: `Reordered ${dto.items.length} categories`,
    });

    return { success: true, count: dto.items.length };
  }

  /**
   * Admin: Soft delete category
   */
  async remove(id: string) {
    await this.findOne(id);

    const activeItems = await this.prisma.menuItem.count({
      where: { categoryId: id, deletedAt: null },
    });

    if (activeItems > 0) {
      throw new ConflictException(
        `Cannot delete category. It still contains ${activeItems} active menu items.`,
      );
    }

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.invalidateCache();

    this.logger.log({
      step: 'CATEGORY_DELETE',
      categoryId: id,
      msg: `Category ${id} soft deleted`,
    });

    return { success: true, message: `Category ${id} deleted successfully` };
  }

  private invalidateCache() {
    if (this.redisService) {
      this.redisService.del(this.CACHE_KEY);
      this.redisService.delByPattern('menuscan:cache:menus:*');
    }
  }
}
