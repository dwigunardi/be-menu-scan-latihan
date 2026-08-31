import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateBranchSettingDto, UpdateStoreStatusDto } from './dto/branch-setting.dto';
import {
  CreateShiftTemplateDto,
  UpdateShiftTemplateDto,
  SeedDefaultShiftTemplatesDto,
} from './dto/shift-template.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';

@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Public location endpoint for staff mobile clock-in geofence validation and customer menu info.
   */
  @Public()
  @Get('public/branch/location')
  async getPublicBranchLocation() {
    return this.settingsService.getPublicBranchLocation();
  }

  /**
   * Endpoint to get complete branch settings & geofencing configurations.
   */
  @Get('admin/settings/branch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  async getAdminBranchSetting() {
    return this.settingsService.getBranchSetting();
  }

  /**
   * Admin endpoint to update branch location coordinates, geofence radius, and schedules.
   */
  @Put('admin/settings/branch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateAdminBranchSetting(@Body() dto: UpdateBranchSettingDto) {
    return this.settingsService.updateBranchSetting(dto);
  }

  /**
   * Fast toggle for Admin & Cashier to change Store Status (Open / Closed / Emergency).
   */
  @Put('admin/settings/branch/store-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  async updateStoreStatus(@Body() dto: UpdateStoreStatusDto) {
    return this.settingsService.updateStoreStatus(dto);
  }

  /**
   * Get all master shift templates.
   */
  @Get('admin/settings/shift-templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  async getShiftTemplates() {
    return this.settingsService.getShiftTemplates();
  }

  /**
   * Create a new shift template.
   */
  @Post('admin/settings/shift-templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createShiftTemplate(@Body() dto: CreateShiftTemplateDto) {
    return this.settingsService.createShiftTemplate(dto);
  }

  /**
   * Update an existing shift template.
   */
  @Put('admin/settings/shift-templates/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateShiftTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateShiftTemplateDto
  ) {
    return this.settingsService.updateShiftTemplate(id, dto);
  }

  /**
   * Delete a shift template.
   */
  @Delete('admin/settings/shift-templates/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteShiftTemplate(@Param('id') id: string) {
    return this.settingsService.deleteShiftTemplate(id);
  }

  /**
   * Seed default shift templates aligned with store hours.
   */
  @Post('admin/settings/shift-templates/seed-defaults')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async seedDefaultShiftTemplates(@Body() dto: SeedDefaultShiftTemplatesDto) {
    return this.settingsService.seedDefaultShiftTemplates(dto.openTime, dto.closeTime);
  }
}
