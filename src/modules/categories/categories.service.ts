import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public: List all active categories with available item counts
   */
  async findAllPublic() {
    return this.prisma.category.findMany({
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
  }

  /**
   * Admin: List all categories with total menu item counts
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
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find single category by ID
   */
  async findOne(id: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        menuItems: {
          where: { deletedAt: null },
        },
      },
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

    const existing = await this.prisma.category.findUnique({
      where: { slug },
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictException(
        `Category with name "${dto.name}" (slug: ${slug}) already exists`,
      );
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: existing?.deletedAt ? `${slug}-${Date.now()}` : slug,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

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

    const data: any = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
      data.slug = slugify(dto.name);
    }
    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    const category = await this.prisma.category.update({
      where: { id },
      data,
    });

    this.logger.log({
      step: 'CATEGORY_UPDATE',
      categoryId: id,
      msg: `Category ${id} updated`,
    });

    return category;
  }

  /**
   * Admin: Soft delete category
   */
  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log({
      step: 'CATEGORY_DELETE',
      categoryId: id,
      msg: `Category ${id} soft-deleted`,
    });

    return {
      success: true,
      message: `Category ${id} deleted successfully`,
    };
  }

  /**
   * Admin: Batch reorder categories
   */
  async reorder(dto: ReorderCategoryDto) {
    const updateOperations = dto.items.map((item) =>
      this.prisma.category.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    );

    await this.prisma.$transaction(updateOperations);

    this.logger.log({
      step: 'CATEGORY_REORDER',
      itemCount: dto.items.length,
      msg: `Reordered ${dto.items.length} categories`,
    });

    return {
      success: true,
      message: 'Categories reordered successfully',
    };
  }
}
