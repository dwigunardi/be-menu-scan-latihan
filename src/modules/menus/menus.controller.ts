import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { MenusService } from './menus.service';
import {
  CreateMenuDto,
  UpdateMenuDto,
  ToggleMenuStatusDto,
  QueryMenuDto,
} from './dto/menu.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Menus')
@Controller()
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  // -------------------------------------------------------------
  // Public Customer Endpoints
  // -------------------------------------------------------------

  @Public()
  @Get('public/menus')
  @ApiOperation({ summary: 'Browse active catalog menu items with filters' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isBestSeller', required: false, type: Boolean })
  @ApiQuery({ name: 'isRecommended', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'List of available menu items' })
  async findAllPublic(@Query() query: QueryMenuDto) {
    return this.menusService.findAllPublic(query);
  }

  @Public()
  @Get('public/menus/:id')
  @ApiOperation({ summary: 'Get detailed menu item with variants' })
  @ApiResponse({ status: 200, description: 'Detailed menu item' })
  @ApiResponse({ status: 404, description: 'Menu not found' })
  async findOnePublic(@Param('id') id: string) {
    return this.menusService.findOnePublic(id);
  }

  // -------------------------------------------------------------
  // Admin & Staff Operations
  // -------------------------------------------------------------

  @Get('admin/menus')
  @Roles(UserRole.ADMIN, UserRole.KITCHEN, UserRole.CASHIER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Paginated menu list for admin table' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'isAvailable', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Admin paginated menu list' })
  async findAllAdmin(@Query() query: QueryMenuDto) {
    return this.menusService.findAllAdmin(query);
  }

  @Post('admin/menus')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create new menu item with variant groups' })
  @ApiResponse({ status: 201, description: 'Menu item created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createMenu(@Body() dto: CreateMenuDto) {
    return this.menusService.create(dto);
  }

  @Get('admin/menus/:id')
  @Roles(UserRole.ADMIN, UserRole.KITCHEN, UserRole.CASHIER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get menu detail for editing' })
  @ApiResponse({ status: 200, description: 'Menu item details' })
  @ApiResponse({ status: 404, description: 'Menu not found' })
  async getAdminMenuDetail(@Param('id') id: string) {
    return this.menusService.findOnePublic(id);
  }

  @Put('admin/menus/:id')
  @Patch('admin/menus/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update menu item and sync variant options' })
  @ApiResponse({ status: 200, description: 'Menu updated successfully' })
  @ApiResponse({ status: 404, description: 'Menu not found' })
  async updateMenu(
    @Param('id') id: string,
    @Body() dto: UpdateMenuDto,
  ) {
    return this.menusService.update(id, dto);
  }

  @Put('admin/menus/:id/status')
  @Patch('admin/menus/:id/status')
  @Roles(UserRole.ADMIN, UserRole.KITCHEN, UserRole.CASHIER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Fast toggle availability status (In Stock / Out of Stock)' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async toggleStatus(
    @Param('id') id: string,
    @Body() dto: ToggleMenuStatusDto,
  ) {
    return this.menusService.updateStatus(id, dto);
  }

  @Delete('admin/menus/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin soft delete menu item' })
  @ApiResponse({ status: 200, description: 'Menu deleted' })
  @ApiResponse({ status: 404, description: 'Menu not found' })
  async deleteMenu(@Param('id') id: string) {
    return this.menusService.remove(id);
  }
}
