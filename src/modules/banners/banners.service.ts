import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';

@Injectable()
export class BannersService {
  private readonly logger = new Logger(BannersService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Public: Get active promo banners
   */
  async findAllPublic() {
    return this.prisma.promoBanner.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });
  }

  /**
   * Admin: Get all promo banners
   */
  async findAllAdmin() {
    return this.prisma.promoBanner.findMany({
      orderBy: {
        sortOrder: 'asc',
      },
    });
  }

  /**
   * Get single promo banner by ID
   */
  async findOne(id: string) {
    const banner = await this.prisma.promoBanner.findUnique({
      where: { id },
    });

    if (!banner) {
      throw new NotFoundException(`Banner with ID ${id} not found`);
    }

    return banner;
  }

  /**
   * Admin: Create promo banner
   */
  async create(dto: CreateBannerDto) {
    const banner = await this.prisma.promoBanner.create({
      data: {
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        targetUrl: dto.targetUrl,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });

    this.logger.log({
      step: 'BANNER_CREATE',
      bannerId: banner.id,
      title: banner.title,
      msg: `Banner ${banner.title} created`,
    });

    return banner;
  }

  /**
   * Admin: Update promo banner
   */
  async update(id: string, dto: UpdateBannerDto) {
    await this.findOne(id);

    const banner = await this.prisma.promoBanner.update({
      where: { id },
      data: dto,
    });

    this.logger.log({
      step: 'BANNER_UPDATE',
      bannerId: id,
      msg: `Banner ${id} updated`,
    });

    return banner;
  }

  /**
   * Admin: Delete promo banner
   */
  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.promoBanner.delete({
      where: { id },
    });

    this.logger.log({
      step: 'BANNER_DELETE',
      bannerId: id,
      msg: `Banner ${id} deleted`,
    });

    return {
      success: true,
      message: `Banner ${id} deleted successfully`,
    };
  }
}
