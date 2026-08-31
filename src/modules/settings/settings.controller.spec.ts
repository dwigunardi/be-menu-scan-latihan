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
      expect(result.name).toBe('Kumpul Cafe');
    });
  });

  describe('getAdminBranchSetting', () => {
    it('should return full branch settings for admin', async () => {
      const result = await controller.getAdminBranchSetting();
      expect(service.getBranchSetting).toHaveBeenCalled();
      expect(result.geofenceRadius).toBe(100);
    });
  });

  describe('updateAdminBranchSetting', () => {
    it('should update branch settings', async () => {
      const dto = { geofenceRadius: 150 };
      const result = await controller.updateAdminBranchSetting(dto as any);
      expect(service.updateBranchSetting).toHaveBeenCalledWith(dto);
      expect(result.geofenceRadius).toBe(100);
    });
  });

  describe('updateStoreStatus', () => {
    it('should update store operational status', async () => {
      const dto = { isStoreOpen: false, storeMode: 'EMERGENCY_CLOSED' as any };
      const result = await controller.updateStoreStatus(dto);
      expect(service.updateStoreStatus).toHaveBeenCalledWith(dto);
      expect(result.isStoreOpen).toBe(false);
    });
  });

  describe('Shift Templates CRUD', () => {
    const mockTemplate = {
      id: 'tmpl-1',
      name: 'Shift Pagi (Opening)',
      code: 'PAGI',
      startTime: '08:00',
      endTime: '16:00',
      breakMinutes: 60,
      colorBadge: 'emerald',
      isActive: true,
    };

    beforeEach(() => {
      service.getShiftTemplates = jest.fn().mockResolvedValue([mockTemplate]);
      service.createShiftTemplate = jest.fn().mockResolvedValue(mockTemplate);
      service.updateShiftTemplate = jest.fn().mockResolvedValue(mockTemplate);
      service.deleteShiftTemplate = jest.fn().mockResolvedValue(mockTemplate);
      service.seedDefaultShiftTemplates = jest.fn().mockResolvedValue([mockTemplate]);
    });

    it('should get shift templates', async () => {
      const result = await controller.getShiftTemplates();
      expect(service.getShiftTemplates).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should create shift template', async () => {
      const dto = {
        name: 'Shift Pagi',
        code: 'PAGI',
        startTime: '08:00',
        endTime: '16:00',
      };
      const result = await controller.createShiftTemplate(dto as any);
      expect(service.createShiftTemplate).toHaveBeenCalledWith(dto);
      expect(result.code).toBe('PAGI');
    });

    it('should update shift template', async () => {
      const dto = { name: 'Shift Pagi Update' };
      const result = await controller.updateShiftTemplate('tmpl-1', dto as any);
      expect(service.updateShiftTemplate).toHaveBeenCalledWith('tmpl-1', dto);
      expect(result.id).toBe('tmpl-1');
    });

    it('should delete shift template', async () => {
      const result = await controller.deleteShiftTemplate('tmpl-1');
      expect(service.deleteShiftTemplate).toHaveBeenCalledWith('tmpl-1');
      expect(result.id).toBe('tmpl-1');
    });

    it('should seed default shift templates', async () => {
      const result = await controller.seedDefaultShiftTemplates({ openTime: '08:00', closeTime: '22:00' });
      expect(service.seedDefaultShiftTemplates).toHaveBeenCalledWith('08:00', '22:00');
      expect(result).toHaveLength(1);
    });
  });
});
