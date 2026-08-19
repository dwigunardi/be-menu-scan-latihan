import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderCategoryDto,
} from './dto/category.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Categories')
@Controller()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get('public/categories')
  @ApiOperation({ summary: 'Get all active categories for public customer menu (supports limit: -1 for getAll)' })
  @ApiResponse({ status: 200, description: 'Paginated active categories' })
  async getPublicCategories(@Query() query: PaginationQueryDto) {
    return this.categoriesService.findAllPublic(query);
  }

  @Get('admin/categories')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List all categories with total menu item counts (supports pagination / getAll)' })
  @ApiResponse({ status: 200, description: 'Paginated categories list' })
  async getAdminCategories(@Query() query: PaginationQueryDto) {
    return this.categoriesService.findAllAdmin(query);
  }

  @Post('admin/categories')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create new category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  @ApiResponse({ status: 409, description: 'Category already exists' })
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch('admin/categories/reorder')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Reorder categories sort order' })
  @ApiResponse({ status: 200, description: 'Categories reordered' })
  async reorderCategories(@Body() dto: ReorderCategoryDto) {
    return this.categoriesService.reorder(dto);
  }

  @Get('admin/categories/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get category detail by ID' })
  @ApiResponse({ status: 200, description: 'Category detail' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async getCategoryDetail(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch('admin/categories/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update category' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete('admin/categories/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Soft delete category' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async deleteCategory(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
