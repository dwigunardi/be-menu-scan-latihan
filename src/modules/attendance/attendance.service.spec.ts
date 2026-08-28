import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AttendanceStatus, LeaveType, LeaveStatus, UserRole } from '@prisma/client';
import { calculateHaversineDistance } from './utils/geofence.util';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: any;

  const mockHashedPin = bcrypt.hashSync('1234', 10);

  const mockStaff = {
    id: 'staff-1',
    name: 'Budi Kasir',
    email: 'budi@kumpul.cafe',
    phone: '+6281234567890',
    role: UserRole.CASHIER,
    pinCode: mockHashedPin,
    isActive: true,
    avatarUrl: null,
  };

  const mockBranch = {
    id: 'branch-1',
    name: 'Kumpul Cafe Tebet',
    latitude: -6.2297465,
    longitude: 106.8557342,
    geofenceRadius: 100,
    openTime: '08:00',
    closeTime: '22:00',
    lateGracePeriod: 15,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      branchSetting: {
        findFirst: jest.fn(),
      },
      attendance: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      leaveRequest: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Haversine Geofence Utility', () => {
    it('calculates 0 meters for identical coordinates', () => {
      const dist = calculateHaversineDistance(-6.2297465, 106.8557342, -6.2297465, 106.8557342);
      expect(dist).toBe(0);
    });

    it('calculates distance accurately for nearby coordinates within ~50m', () => {
      // Small shift in latitude (~0.0004 deg is approx 44 meters)
      const dist = calculateHaversineDistance(-6.2297465, 106.8557342, -6.2301465, 106.8557342);
      expect(dist).toBeGreaterThan(40);
      expect(dist).toBeLessThan(50);
    });

    it('detects distance outside 100m geofence', () => {
      // Larger shift in longitude (~0.002 deg is approx 220 meters)
      const dist = calculateHaversineDistance(-6.2297465, 106.8557342, -6.2297465, 106.8577342);
      expect(dist).toBeGreaterThan(200);
    });
  });

  describe('recordClockIn', () => {
    it('successfully records clock-in when PIN is valid and within geofence', async () => {
      prisma.user.findUnique.mockResolvedValue(mockStaff);
      prisma.branchSetting.findFirst.mockResolvedValue(mockBranch);
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.upsert.mockImplementation((args: any) => Promise.resolve({
        id: 'att-1',
        ...args.create,
        staff: mockStaff,
      }));

      const result = await service.recordClockIn({
        staffId: 'staff-1',
        pinCode: '1234',
        latitude: -6.2297465,
        longitude: 106.8557342,
      });

      expect(result).toBeDefined();
      expect(result.staffId).toBe('staff-1');
      expect(result.isWithinGeofence).toBe(true);
      expect(prisma.attendance.upsert).toHaveBeenCalled();
    });

    it('throws NotFoundException if staff does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.recordClockIn({
          staffId: 'unknown',
          pinCode: '1234',
          latitude: -6.2297465,
          longitude: 106.8557342,
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if staff has no PIN set', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockStaff, pinCode: null });

      await expect(
        service.recordClockIn({
          staffId: 'staff-1',
          pinCode: '1234',
          latitude: -6.2297465,
          longitude: 106.8557342,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if PIN is incorrect', async () => {
      prisma.user.findUnique.mockResolvedValue(mockStaff);

      await expect(
        service.recordClockIn({
          staffId: 'staff-1',
          pinCode: '9999',
          latitude: -6.2297465,
          longitude: 106.8557342,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if location is outside geofence radius', async () => {
      prisma.user.findUnique.mockResolvedValue(mockStaff);
      prisma.branchSetting.findFirst.mockResolvedValue(mockBranch);

      // Coordinates ~500m away
      await expect(
        service.recordClockIn({
          staffId: 'staff-1',
          pinCode: '1234',
          latitude: -6.2350000,
          longitude: 106.8600000,
        })
      ).rejects.toThrow(/Presensi masuk ditolak/);
    });

    it('throws ConflictException if clock-in already recorded today', async () => {
      prisma.user.findUnique.mockResolvedValue(mockStaff);
      prisma.branchSetting.findFirst.mockResolvedValue(mockBranch);
      prisma.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        clockInTime: new Date(),
      });

      await expect(
        service.recordClockIn({
          staffId: 'staff-1',
          pinCode: '1234',
          latitude: -6.2297465,
          longitude: 106.8557342,
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('recordClockOut', () => {
    it('successfully records clock-out and computes work duration minutes', async () => {
      const clockInTime = new Date(Date.now() - 8 * 60 * 60 * 1000); // 8 hours ago
      prisma.user.findUnique.mockResolvedValue(mockStaff);
      prisma.branchSetting.findFirst.mockResolvedValue(mockBranch);
      prisma.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        staffId: 'staff-1',
        clockInTime,
        clockOutTime: null,
        status: AttendanceStatus.ON_TIME,
      });

      prisma.attendance.update.mockResolvedValue({
        id: 'att-1',
        staffId: 'staff-1',
        clockInTime,
        clockOutTime: new Date(),
        workDurationMinutes: 480,
        status: AttendanceStatus.COMPLETED,
        staff: mockStaff,
      });

      const result = await service.recordClockOut({
        staffId: 'staff-1',
        pinCode: '1234',
        latitude: -6.2297465,
        longitude: 106.8557342,
      });

      expect(result).toBeDefined();
      expect(result.workDurationMinutes).toBe(480);
      expect(result.status).toBe(AttendanceStatus.COMPLETED);
    });

    it('throws BadRequestException if staff has not clocked in yet', async () => {
      prisma.user.findUnique.mockResolvedValue(mockStaff);
      prisma.branchSetting.findFirst.mockResolvedValue(mockBranch);
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(
        service.recordClockOut({
          staffId: 'staff-1',
          pinCode: '1234',
          latitude: -6.2297465,
          longitude: 106.8557342,
        })
      ).rejects.toThrow(/belum melakukan presensi masuk/);
    });

    it('throws ConflictException if staff already clocked out', async () => {
      prisma.user.findUnique.mockResolvedValue(mockStaff);
      prisma.branchSetting.findFirst.mockResolvedValue(mockBranch);
      prisma.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        clockInTime: new Date(),
        clockOutTime: new Date(),
      });

      await expect(
        service.recordClockOut({
          staffId: 'staff-1',
          pinCode: '1234',
          latitude: -6.2297465,
          longitude: 106.8557342,
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getAttendanceSummary', () => {
    it('aggregates daily attendance statistics accurately', async () => {
      prisma.user.count.mockResolvedValue(10);
      prisma.attendance.findMany.mockResolvedValue([
        { id: '1', clockInTime: new Date(), status: AttendanceStatus.ON_TIME },
        { id: '2', clockInTime: new Date(), status: AttendanceStatus.COMPLETED },
        { id: '3', clockInTime: new Date(), status: AttendanceStatus.LATE },
        { id: '4', clockInTime: null, status: AttendanceStatus.SICK },
      ]);

      const summary = await service.getAttendanceSummary('2026-08-28');

      expect(summary.totalActiveStaff).toBe(10);
      expect(summary.presentCount).toBe(3);
      expect(summary.onTimeCount).toBe(2);
      expect(summary.lateCount).toBe(1);
      expect(summary.leaveCount).toBe(1);
      expect(summary.absentCount).toBe(6); // 10 - (3 + 1)
      expect(summary.disciplinePercentage).toBe(20); // (2 / 10) * 100
    });
  });

  describe('createLeaveRequest', () => {
    it('creates leave request and marks attendance record for today', async () => {
      prisma.user.findUnique.mockResolvedValue(mockStaff);
      prisma.branchSetting.findFirst.mockResolvedValue(mockBranch);
      prisma.leaveRequest.create.mockResolvedValue({
        id: 'leave-1',
        staffId: 'staff-1',
        leaveType: LeaveType.SICK,
        startDate: '2026-08-28',
        endDate: '2026-08-29',
        reason: 'Demam tinggi',
        status: LeaveStatus.APPROVED,
        staff: mockStaff,
      });

      const today = new Date().toISOString().split('T')[0];
      const result = await service.createLeaveRequest({
        staffId: 'staff-1',
        leaveType: 'SICK',
        startDate: today,
        endDate: today,
        reason: 'Demam tinggi',
      });

      expect(result).toBeDefined();
      expect(result.leaveType).toBe(LeaveType.SICK);
      expect(prisma.attendance.upsert).toHaveBeenCalled();
    });
  });
});
