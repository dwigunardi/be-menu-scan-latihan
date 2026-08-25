import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { StaffService } from './staff.service';
import {
  CreateStaffDto,
  UpdateStaffDto,
  UpdateStaffPinDto,
  StaffQueryDto,
} from './dto/staff.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin Staff')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.ADMIN)
@Controller('admin/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @ApiOperation({ summary: 'List all branch staff with pagination, search, and role filter' })
  @ApiResponse({ status: 200, description: 'Paginated staff list' })
  async findAll(@Query() query: StaffQueryDto) {
    return this.staffService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single staff profile by ID' })
  @ApiResponse({ status: 200, description: 'Staff details' })
  async findById(@Param('id') id: string) {
    return this.staffService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new branch staff account' })
  @ApiResponse({ status: 201, description: 'Staff account created successfully' })
  async create(@Body() dto: CreateStaffDto) {
    return this.staffService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update staff profile and active status' })
  @ApiResponse({ status: 200, description: 'Staff profile updated successfully' })
  async update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.update(id, dto);
  }

  @Put(':id/pin')
  @ApiOperation({ summary: 'Set or update 4-digit PIN for staff clock-in' })
  @ApiResponse({ status: 200, description: 'Staff PIN updated successfully' })
  async updatePin(@Param('id') id: string, @Body() dto: UpdateStaffPinDto) {
    return this.staffService.updatePin(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete / deactivate staff account' })
  @ApiResponse({ status: 200, description: 'Staff deactivated successfully' })
  async remove(@Param('id') id: string) {
    return this.staffService.remove(id);
  }
}
