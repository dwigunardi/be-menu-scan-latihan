import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BannersService } from './banners.service';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Banners')
@Controller()
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  // -------------------------------------------------------------
  // Public Customer Endpoints
  // -------------------------------------------------------------

  @Public()
  @Get('public/banners')
  @ApiOperation({ summary: 'Get active promo banners for homepage' })
  @ApiResponse({ status: 200, description: 'List of active banners' })
  async getPublicBanners() {
    return this.bannersService.findAllPublic();
  }

  // -------------------------------------------------------------
  // Admin Endpoints
  // -------------------------------------------------------------

  @Get('admin/banners')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List all promo banners' })
  @ApiResponse({ status: 200, description: 'List of all banners' })
  async getAdminBanners() {
    return this.bannersService.findAllAdmin();
  }

  @Post('admin/banners')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create new promo banner' })
  @ApiResponse({ status: 201, description: 'Banner created' })
  async createBanner(@Body() dto: CreateBannerDto) {
    return this.bannersService.create(dto);
  }

  @Get('admin/banners/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get banner detail' })
  @ApiResponse({ status: 200, description: 'Banner detail' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  async getBannerDetail(@Param('id') id: string) {
    return this.bannersService.findOne(id);
  }

  @Patch('admin/banners/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update promo banner' })
  @ApiResponse({ status: 200, description: 'Banner updated' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  async updateBanner(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.bannersService.update(id, dto);
  }

  @Delete('admin/banners/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete promo banner' })
  @ApiResponse({ status: 200, description: 'Banner deleted' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  async deleteBanner(@Param('id') id: string) {
    return this.bannersService.remove(id);
  }
}
