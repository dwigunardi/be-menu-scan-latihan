import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { TableZonesService } from './table-zones.service';
import { CreateTableZoneDto, UpdateTableZoneDto } from './dto/table-zone.dto';

@ApiTags('Admin Table Zones 📍')
@ApiBearerAuth('JWT-auth')
@ApiSecurity('x-handshake-token')
@Controller('admin/table-zones')
export class TableZonesController {
  constructor(private readonly zonesService: TableZonesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CASHIER, UserRole.WAITER, UserRole.KITCHEN)
  @ApiOperation({ summary: 'Get all table zones with table counts & capacity metrics' })
  findAll() {
    return this.zonesService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CASHIER, UserRole.WAITER, UserRole.KITCHEN)
  @ApiOperation({ summary: 'Get table zone detail by ID' })
  findOne(@Param('id') id: string) {
    return this.zonesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new table zone' })
  create(@Body() dto: CreateTableZoneDto) {
    return this.zonesService.create(dto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update table zone info' })
  update(@Param('id') id: string, @Body() dto: UpdateTableZoneDto) {
    return this.zonesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a table zone' })
  remove(@Param('id') id: string) {
    return this.zonesService.remove(id);
  }
}
