import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: any;

  const mockBranch = {
    id: 'branch-1',
    name: 'Kumpul Cafe',
    latitude: -6.2297,
    longitude: 106.8557,
    geofenceRadius: 100,
    isStoreOpen: true,
    storeMode: 'SHIFT_DRIVEN',
    openTime: '08:00',
    closeTime: '22:00',
  };

  beforeEach(async () => {
    service = {
      getPublicBranchLocation: jest.fn().mockResolvedValue({
        id: mockBranch.id,
        name: mockBranch.name,
        latitude: mockBranch.latitude,
        longitude: mockBranch.longitude,
        geofenceRadius: mockBranch.geofenceRadius,
        isStoreOpen: mockBranch.isStoreOpen,
        storeMode: mockBranch.storeMode,
      }),
      getBranchSetting: jest.fn().mockResolvedValue(mockBranch),
      updateBranchSetting: jest.fn().mockResolvedValue(mockBranch),
      updateStoreStatus: jest.fn().mockResolvedValue({
        ...mockBranch,
        isStoreOpen: false,
        storeMode: 'EMERGENCY_CLOSED',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: service }],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPublicBranchLocation', () => {
    it('should return public branch location', async () => {
      const result = await controller.getPublicBranchLocation();
      expect(service.getPublicBranchLocation).toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
      expect(result.data.name).toBe('Kumpul Cafe');
    });
  });

  describe('getAdminBranchSetting', () => {
    it('should return full branch settings for admin', async () => {
      const result = await controller.getAdminBranchSetting();
      expect(service.getBranchSetting).toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
      expect(result.data.geofenceRadius).toBe(100);
    });
  });

  describe('updateAdminBranchSetting', () => {
    it('should update branch settings', async () => {
      const dto = { geofenceRadius: 150 };
      const result = await controller.updateAdminBranchSetting(dto as any);
      expect(service.updateBranchSetting).toHaveBeenCalledWith(dto);
      expect(result.statusCode).toBe(200);
    });
  });

  describe('updateStoreStatus', () => {
    it('should update store operational status', async () => {
      const dto = { isStoreOpen: false, storeMode: 'EMERGENCY_CLOSED' as any };
      const result = await controller.updateStoreStatus(dto);
      expect(service.updateStoreStatus).toHaveBeenCalledWith(dto);
      expect(result.statusCode).toBe(200);
    });
  });
});
