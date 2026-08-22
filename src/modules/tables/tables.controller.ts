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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TablesService } from './tables.service';
import {
  CreateTableDto,
  UpdateTableDto,
  TableSessionDto,
  QueryTableDto,
  TableStatusResponseSchema,
} from './dto/table.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodResponse } from '../../common/decorators/zod-response.decorator';

@ApiTags('Tables')
@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Public()
  @ZodResponse(TableStatusResponseSchema)
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

  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN, UserRole.CASHIER, UserRole.WAITER)
  @Get('admin/tables')
  @ApiOperation({ summary: 'List cafe tables with current occupancy (paginated or limit: -1 for getAll)' })
  @ApiResponse({ status: 200, description: 'Paginated tables returned' })
  async findAllAdmin(@Query() query: QueryTableDto) {
    return this.tablesService.findAllAdmin(query);
  }

  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN)
  @Post('admin/tables')
  @ApiOperation({ summary: 'Create a new table' })
  @ApiResponse({ status: 201, description: 'Table created' })
  @ApiResponse({ status: 409, description: 'Table number already exists' })
  async create(@Body() dto: CreateTableDto) {
    return this.tablesService.create(dto);
  }

  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN, UserRole.CASHIER, UserRole.WAITER)
  @HttpCode(HttpStatus.OK)
  @Post('admin/tables/:id/reset')
  @ApiOperation({ summary: 'Reset table session back to VACANT after guests leave' })
  @ApiResponse({ status: 200, description: 'Table reset to VACANT' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  async resetTable(@Param('id') id: string) {
    return this.tablesService.resetTable(id);
  }

  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN)
  @Put('admin/tables/:id')
  @Patch('admin/tables/:id')
  @ApiOperation({ summary: 'Update table number or status' })
  @ApiResponse({ status: 200, description: 'Table updated' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  @ApiResponse({ status: 409, description: 'Table number already exists' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.tablesService.update(id, dto);
  }

  @Delete('admin/tables/:id')
  @ApiOperation({ summary: 'Delete table' })
  @ApiResponse({ status: 200, description: 'Table deleted' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete table with active orders' })
  async remove(@Param('id') id: string) {
    return this.tablesService.remove(id);
  }
}
