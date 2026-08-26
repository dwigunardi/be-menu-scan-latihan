import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateBranchSettingDto, UpdateStoreStatusDto } from './dto/branch-setting.dto';

const DEFAULT_SCHEDULES = [
  { day: 'MONDAY', isOpen: true, openTime: '08:00', closeTime: '22:00' },
  { day: 'TUESDAY', isOpen: true, openTime: '08:00', closeTime: '22:00' },
  { day: 'WEDNESDAY', isOpen: true, openTime: '08:00', closeTime: '22:00' },
  { day: 'THURSDAY', isOpen: true, openTime: '08:00', closeTime: '22:00' },
  { day: 'FRIDAY', isOpen: true, openTime: '08:00', closeTime: '23:00' },
  { day: 'SATURDAY', isOpen: true, openTime: '08:00', closeTime: '23:00' },
  { day: 'SUNDAY', isOpen: true, openTime: '08:00', closeTime: '22:00' },
];

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get branch setting. Auto-seeds default setting if table is empty.
   */
  async getBranchSetting() {
    let setting = await this.prisma.branchSetting.findFirst();

    if (!setting) {
      this.logger.log('Branch settings empty. Auto-seeding default branch setting...');
      setting = await this.prisma.branchSetting.create({
        data: {
          name: 'Kumpul Cafe - Cabang Pusat',
          address: 'Jl. Tebet Raya No. 45, Jakarta Selatan',
          latitude: -6.2297465,
          longitude: 106.8557342,
          geofenceRadius: 100,
          openTime: '08:00',
          closeTime: '22:00',
          lateGracePeriod: 15,
          isStoreOpen: true,
          storeMode: 'SHIFT_DRIVEN',
          timezone: 'Asia/Jakarta',
          schedules: DEFAULT_SCHEDULES,
        },
      });
    }

    return setting;
  }

  /**
   * Update branch location, geofence, and operating parameters.
   */
  async updateBranchSetting(dto: UpdateBranchSettingDto) {
    const current = await this.getBranchSetting();

    const updated = await this.prisma.branchSetting.update({
      where: { id: current.id },
      data: {
        name: dto.name ?? current.name,
        address: dto.address ?? current.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        geofenceRadius: dto.geofenceRadius,
        openTime: dto.openTime ?? current.openTime,
        closeTime: dto.closeTime ?? current.closeTime,
        lateGracePeriod: dto.lateGracePeriod ?? current.lateGracePeriod,
        storeMode: dto.storeMode ?? current.storeMode,
        timezone: dto.timezone ?? current.timezone,
        phone: dto.phone !== undefined ? dto.phone : current.phone,
        email: dto.email !== undefined ? dto.email : current.email,
        schedules: dto.schedules !== undefined ? (dto.schedules as any) : current.schedules,
      },
    });

    this.logger.log(`Branch settings updated: ${updated.name} (Radius: ${updated.geofenceRadius}m)`);
    return updated;
  }

  /**
   * Quick toggle store open/close/emergency status.
   */
  async updateStoreStatus(dto: UpdateStoreStatusDto) {
    const current = await this.getBranchSetting();

    const updated = await this.prisma.branchSetting.update({
      where: { id: current.id },
      data: {
        isStoreOpen: dto.isStoreOpen,
        storeMode: dto.storeMode ?? current.storeMode,
        emergencyReason: dto.emergencyReason !== undefined ? dto.emergencyReason : current.emergencyReason,
      },
    });

    this.logger.log(`Store status updated: isStoreOpen=${updated.isStoreOpen}, mode=${updated.storeMode}`);
    return updated;
  }

  /**
   * Public lightweight endpoint for smart attendance and customer menu radius checks.
   */
  async getPublicBranchLocation() {
    const setting = await this.getBranchSetting();
    return {
      name: setting.name,
      address: setting.address,
      latitude: setting.latitude,
      longitude: setting.longitude,
      geofenceRadius: setting.geofenceRadius,
      isStoreOpen: setting.isStoreOpen,
      storeMode: setting.storeMode,
      openTime: setting.openTime,
      closeTime: setting.closeTime,
      timezone: setting.timezone,
    };
  }
}
