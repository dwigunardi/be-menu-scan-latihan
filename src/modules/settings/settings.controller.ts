import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateBranchSettingDto, UpdateStoreStatusDto } from './dto/branch-setting.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Public location endpoint for staff mobile clock-in geofence validation and customer menu info.
   */
  @Get('public/branch/location')
  async getPublicBranchLocation() {
    const data = await this.settingsService.getPublicBranchLocation();
    return {
      statusCode: 200,
      message: 'Lokasi cabang berhasil diambil',
      data,
    };
  }

  /**
   * Admin endpoint to get complete branch settings & geofencing configurations.
   */
  @Get('admin/settings/branch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAdminBranchSetting() {
    const data = await this.settingsService.getBranchSetting();
    return {
      statusCode: 200,
      message: 'Pengaturan cabang berhasil diambil',
      data,
    };
  }

  /**
   * Admin endpoint to update branch location coordinates, geofence radius, and schedules.
   */
  @Put('admin/settings/branch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateAdminBranchSetting(@Body() dto: UpdateBranchSettingDto) {
    const data = await this.settingsService.updateBranchSetting(dto);
    return {
      statusCode: 200,
      message: 'Pengaturan cabang berhasil diperbarui',
      data,
    };
  }

  /**
   * Fast toggle for Admin & Cashier to change Store Status (Open / Closed / Emergency).
   */
  @Put('admin/settings/branch/store-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  async updateStoreStatus(@Body() dto: UpdateStoreStatusDto) {
    const data = await this.settingsService.updateStoreStatus(dto);
    return {
      statusCode: 200,
      message: 'Status operasional toko berhasil diperbarui',
      data,
    };
  }
}
