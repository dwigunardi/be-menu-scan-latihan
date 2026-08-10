import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TablesService } from './tables.service';
import { CreateTableDto, TableSessionDto } from './dto/table.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Tables')
@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  // -------------------------------------------------------------
  // Public Customer Endpoints (QR Scan)
  // -------------------------------------------------------------

  @Public()
  @Get('public/tables/:number/status')
  @ApiOperation({ summary: 'Check table status & active customer by table number' })
  @ApiResponse({ status: 200, description: 'Table status details' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  async getTableStatus(@Param('number') tableNumber: string) {
    return this.tablesService.getTableStatus(tableNumber);
  }

  @Public()
  @Post('public/tables/:number/session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initialize guest table session with customer name' })
  @ApiResponse({ status: 200, description: 'Session initialized' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  async initTableSession(
    @Param('number') tableNumber: string,
    @Body() dto: TableSessionDto,
  ) {
    return this.tablesService.initSession(tableNumber, dto);
  }

  // -------------------------------------------------------------
  // Admin Endpoints
  // -------------------------------------------------------------

  @Get('admin/tables')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List all tables with status and active orders' })
  @ApiResponse({ status: 200, description: 'List of all tables' })
  async getAdminTables() {
    return this.tablesService.findAllAdmin();
  }

  @Post('admin/tables')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create new restaurant table' })
  @ApiResponse({ status: 201, description: 'Table created' })
  @ApiResponse({ status: 409, description: 'Table number already exists' })
  async createTable(@Body() dto: CreateTableDto) {
    return this.tablesService.create(dto);
  }

  @Post('admin/tables/:id/reset')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Reset table status to VACANT and clear active customer' })
  @ApiResponse({ status: 200, description: 'Table reset successfully' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  async resetTable(@Param('id') id: string) {
    return this.tablesService.resetTable(id);
  }

  @Delete('admin/tables/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete table (only if no active orders)' })
  @ApiResponse({ status: 200, description: 'Table deleted' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete table with active orders' })
  async deleteTable(@Param('id') id: string) {
    return this.tablesService.remove(id);
  }
}
