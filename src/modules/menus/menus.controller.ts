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
import { MenusService } from './menus.service';
import {
  CreateMenuDto,
  UpdateMenuDto,
  QueryMenuDto,
  ToggleMenuStatusDto,
} from './dto/menu.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Menus')
@Controller()
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  // -------------------------------------------------------------
  // Public Customer Endpoints
  // -------------------------------------------------------------

  @Public()
  @Get('public/menus')
  @ApiOperation({
    summary: 'Public browse menu catalog with variant options and filters',
  })
  @ApiResponse({ status: 200, description: 'List of menu items with variants' })
  async getPublicMenus(@Query() query: QueryMenuDto) {
    return this.menusService.findAllPublic(query);
  }

  @Public()
  @Get('public/menus/:id')
  @ApiOperation({
    summary: 'Public menu item detail with full variant modifiers',
  })
  @ApiResponse({ status: 200, description: 'Detail menu with variant groups' })
  @ApiResponse({ status: 404, description: 'Menu item not found' })
  async getPublicMenuDetail(@Param('id') id: string) {
    return this.menusService.findOnePublic(id);
  }

  // -------------------------------------------------------------
  // Admin Endpoints
  // -------------------------------------------------------------

  @Get('admin/menus')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin list all menus with pagination' })
  @ApiResponse({ status: 200, description: 'Paginated menu list' })
  async getAdminMenus(@Query() query: QueryMenuDto) {
    return this.menusService.findAllAdmin(query);
  }

  @Post('admin/menus')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin create menu item with optional nested variant groups',
  })
  @ApiResponse({ status: 201, description: 'Menu item created' })
  async createMenu(@Body() dto: CreateMenuDto) {
    return this.menusService.create(dto);
  }

  @Get('admin/menus/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin get menu detail' })
  @ApiResponse({ status: 200, description: 'Menu detail' })
  @ApiResponse({ status: 404, description: 'Menu not found' })
  async getAdminMenuDetail(@Param('id') id: string) {
    return this.menusService.findOnePublic(id);
  }

  @Patch('admin/menus/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin update menu item and variants' })
  @ApiResponse({ status: 200, description: 'Menu updated' })
  @ApiResponse({ status: 404, description: 'Menu not found' })
  async updateMenu(
    @Param('id') id: string,
    @Body() dto: UpdateMenuDto,
  ) {
    return this.menusService.update(id, dto);
  }

  @Patch('admin/menus/:id/status')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin fast toggle availability status' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async toggleStatus(
    @Param('id') id: string,
    @Body() dto: ToggleMenuStatusDto,
  ) {
    return this.menusService.toggleStatus(id, dto);
  }

  @Delete('admin/menus/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin soft delete menu item' })
  @ApiResponse({ status: 200, description: 'Menu deleted' })
  @ApiResponse({ status: 404, description: 'Menu not found' })
  async deleteMenu(@Param('id') id: string) {
    return this.menusService.remove(id);
  }
}
