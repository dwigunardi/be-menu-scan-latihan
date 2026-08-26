import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: PrismaService;

  const mockBranchSetting = {
    id: 'test-branch-id',
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
    phone: '081234567890',
    email: 'admin@menuscan.com',
    schedules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    branchSetting: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return existing branch setting if found', async () => {
    mockPrismaService.branchSetting.findFirst.mockResolvedValue(mockBranchSetting);

    const result = await service.getBranchSetting();

    expect(result).toEqual(mockBranchSetting);
    expect(mockPrismaService.branchSetting.findFirst).toHaveBeenCalled();
    expect(mockPrismaService.branchSetting.create).not.toHaveBeenCalled();
  });

  it('should auto-seed default branch setting if table is empty', async () => {
    mockPrismaService.branchSetting.findFirst.mockResolvedValue(null);
    mockPrismaService.branchSetting.create.mockResolvedValue(mockBranchSetting);

    const result = await service.getBranchSetting();

    expect(result).toEqual(mockBranchSetting);
    expect(mockPrismaService.branchSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Kumpul Cafe - Cabang Pusat',
          latitude: -6.2297465,
          longitude: 106.8557342,
          geofenceRadius: 100,
        }),
      })
    );
  });

  it('should update branch settings properly', async () => {
    mockPrismaService.branchSetting.findFirst.mockResolvedValue(mockBranchSetting);
    const updatedMock = { ...mockBranchSetting, geofenceRadius: 150 };
    mockPrismaService.branchSetting.update.mockResolvedValue(updatedMock);

    const result = await service.updateBranchSetting({
      latitude: -6.2297465,
      longitude: 106.8557342,
      geofenceRadius: 150,
    });

    expect(result.geofenceRadius).toBe(150);
    expect(mockPrismaService.branchSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockBranchSetting.id },
        data: expect.objectContaining({
          geofenceRadius: 150,
        }),
      })
    );
  });

  it('should update store status properly', async () => {
    mockPrismaService.branchSetting.findFirst.mockResolvedValue(mockBranchSetting);
    const updatedStatusMock = { ...mockBranchSetting, isStoreOpen: false, emergencyReason: 'Renovasi' };
    mockPrismaService.branchSetting.update.mockResolvedValue(updatedStatusMock);

    const result = await service.updateStoreStatus({
      isStoreOpen: false,
      emergencyReason: 'Renovasi',
    });

    expect(result.isStoreOpen).toBe(false);
    expect(result.emergencyReason).toBe('Renovasi');
  });

  it('should return public branch location without sensitive fields', async () => {
    mockPrismaService.branchSetting.findFirst.mockResolvedValue(mockBranchSetting);

    const result = await service.getPublicBranchLocation();

    expect(result).toEqual({
      name: mockBranchSetting.name,
      address: mockBranchSetting.address,
      latitude: mockBranchSetting.latitude,
      longitude: mockBranchSetting.longitude,
      geofenceRadius: mockBranchSetting.geofenceRadius,
      isStoreOpen: mockBranchSetting.isStoreOpen,
      storeMode: mockBranchSetting.storeMode,
      openTime: mockBranchSetting.openTime,
      closeTime: mockBranchSetting.closeTime,
      timezone: mockBranchSetting.timezone,
    });
  });
});
