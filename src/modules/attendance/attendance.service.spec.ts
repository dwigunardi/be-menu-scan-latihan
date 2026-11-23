import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PinVerificationService } from '../../common/security/pin-verification.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AttendanceStatus, LeaveType, LeaveStatus, UserRole } from '@prisma/client';
import { calculateHaversineDistance } from './utils/geofence.util';
import { toBranchDateString } from '../../common/utils/branch-time';

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
    dailyShiftHours: 8,
    pinFailedAttempts: 0,
    pinLockedUntil: null as Date | null,
  };

  // Full attendance row as returned by Prisma with ATTENDANCE_INCLUDE
  const attendanceRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'att-1',
    branchId: 'branch-1',
    staffId: 'staff-1',
    date: '2026-11-20',
    clockInTime: null,
    clockOutTime: null,
    status: AttendanceStatus.ON_TIME,
    clockInLat: null,
    clockInLon: null,
    clockInDistanceMeters: null,
    isWithinGeofence: true,
    workDurationMinutes: null,
    overtimeMinutes: null,
    overtimeReviewStatus: null,
    approvedOvertimeMinutes: null,
    overtimeReviewedById: null,
    overtimeReviewedAt: null,
    overtimeNotes: null,
    correctedById: null,
    correctedAt: null,
    correctionNotes: null,
    originalClockOutTime: null,
    notes: null,
    leaveType: null,
    leaveStatus: null,
    leaveReason: null,
    createdAt: new Date('2026-11-20T01:00:00.000Z'),
    updatedAt: new Date('2026-11-20T01:00:00.000Z'),
    staff: {
      id: 'staff-1',
      name: 'Budi Kasir',
      role: UserRole.CASHIER,
      avatarUrl: null,
    },
    ...overrides,
  });

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
        update: jest.fn().mockResolvedValue({ pinFailedAttempts: 1 }),
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
        PinVerificationService,
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
      prisma.attendance.upsert.mockImplementation((args: any) =>
        Promise.resolve(attendanceRow(args.create)),
      );

      const result = await service.recordClockIn({
        staffId: 'staff-1',
        pinCode: '1234',
        latitude: -6.2297465,
        longitude: 106.8557342,
      });

      expect(result).toBeDefined();
      expect(result.staffId).toBe('staff-1');
      // FE AttendanceItem contract: flat staff fields and ISO times
      expect(result.staffName).toBe('Budi Kasir');
      expect(result.staffRole).toBe(UserRole.CASHIER);
      expect(typeof result.clockInTime).toBe('string');
      expect(result).not.toHaveProperty('staff');
      expect(result.isWithinGeofence).toBe(true);
      expect(prisma.attendance.upsert).toHaveBeenCalled();
    });

    describe('WIB day and late threshold (independent of server timezone)', () => {
      afterEach(() => jest.useRealTimers());

      const clockInAt = async (iso: string) => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date(iso));
        prisma.user.findUnique.mockResolvedValue(mockStaff);
        prisma.branchSetting.findFirst.mockResolvedValue(mockBranch);
        prisma.attendance.findUnique.mockResolvedValue(null);
        prisma.attendance.upsert.mockImplementation((args: any) =>
          Promise.resolve(attendanceRow(args.create)),
        );
        await service.recordClockIn({
          staffId: 'staff-1',
          pinCode: '1234',
          latitude: -6.2297465,
          longitude: 106.8557342,
        });
        return prisma.attendance.upsert.mock.calls[0][0].create;
      };

      it('is ON_TIME at 08:10 WIB (open 08:00 + 15 min grace)', async () => {
        const created = await clockInAt('2026-11-20T01:10:00.000Z');
        expect(created.status).toBe(AttendanceStatus.ON_TIME);
        expect(created.date).toBe('2026-11-20');
      });

      it('is LATE at 08:20 WIB', async () => {
        const created = await clockInAt('2026-11-20T01:20:00.000Z');
        expect(created.status).toBe(AttendanceStatus.LATE);
      });

      it('dates a 01:00 WIB clock-in on the WIB day, not the UTC day', async () => {
        const created = await clockInAt('2026-11-20T18:00:00.000Z');
        expect(created.date).toBe('2026-11-21');
      });
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
      const clockInTime = new Date(Date.now() - 9 * 60 * 60 * 1000); // 9 hours ago
      prisma.user.findUnique.mockResolvedValue(mockStaff);
      prisma.branchSetting.findFirst.mockResolvedValue(mockBranch);
      prisma.attendance.findUnique.mockResolvedValue({
        id: 'att-1',
        staffId: 'staff-1',
        clockInTime,
        clockOutTime: null,
        status: AttendanceStatus.ON_TIME,
      });

      prisma.attendance.update.mockImplementation((args: any) =>
        Promise.resolve(attendanceRow({ clockInTime, ...args.data })),
      );

      const result = await service.recordClockOut({
        staffId: 'staff-1',
        pinCode: '1234',
        latitude: -6.2297465,
        longitude: 106.8557342,
      });

      expect(result).toBeDefined();
      expect(result.workDurationMinutes).toBe(540);
      // 9h worked on an 8h shift = 60 min overtime, pending review
      expect(prisma.attendance.update.mock.calls[0][0].data.overtimeMinutes).toBe(60);
      expect(result.overtimeMinutes).toBe(60);
      expect(result.isOvertimeApproved).toBeNull();
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
        { id: '5', clockInTime: new Date(), status: AttendanceStatus.EARLY_LEAVE },
        { id: '4', clockInTime: null, status: AttendanceStatus.SICK },
      ]);

      const summary = await service.getAttendanceSummary('2026-08-28');

      // Field names follow FE AttendanceSummarySchema
      expect(summary).toEqual({
        date: '2026-08-28',
        totalStaff: 10,
        presentCount: 4,
        onTimeCount: 2,
        lateCount: 1,
        earlyLeaveCount: 1,
        leaveCount: 1,
        absentCount: 5, // 10 - (4 + 1)
        attendanceRatePercent: 40, // (4 / 10) * 100
      });
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

      const today = toBranchDateString();
      const result = await service.createLeaveRequest({
        staffId: 'staff-1',
        leaveType: 'SICK',
        startDate: today,
        endDate: today,
        reason: 'Demam tinggi',
      });

      // Shape follows FE LeaveResponseSchema
      expect(result.success).toBe(true);
      expect(result.message).toContain('Budi Kasir');
      expect(prisma.attendance.upsert).toHaveBeenCalled();
    });
  });

  describe('reviewOvertime', () => {
    const clockedOut = (overrides: Record<string, unknown> = {}) =>
      attendanceRow({
        clockInTime: new Date('2026-11-20T01:00:00.000Z'),
        clockOutTime: new Date('2026-11-20T11:00:00.000Z'),
        workDurationMinutes: 600,
        overtimeMinutes: 120,
        status: AttendanceStatus.COMPLETED,
        ...overrides,
      });

    beforeEach(() => {
      prisma.attendance.update.mockImplementation((args: any) =>
        Promise.resolve(clockedOut(args.data)),
      );
    });

    it('APPROVED grants the computed minutes and records the reviewer', async () => {
      prisma.attendance.findUnique.mockResolvedValue(clockedOut());

      const result = await service.reviewOvertime(
        'att-1',
        { status: 'APPROVED', notes: 'Closing stok' },
        'admin-1',
      );

      const data = prisma.attendance.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        overtimeReviewStatus: 'APPROVED',
        approvedOvertimeMinutes: 120,
        overtimeReviewedById: 'admin-1',
        overtimeNotes: 'Closing stok',
      });
      expect(data.overtimeReviewedAt).toBeInstanceOf(Date);
      expect(result).toMatchObject({
        overtimeMinutes: 120,
        isOvertimeApproved: true,
        overtimeApprovedById: 'admin-1',
        overtimeNotes: 'Closing stok',
      });
    });

    it('REJECTED grants 0 minutes and reports isOvertimeApproved false', async () => {
      prisma.attendance.findUnique.mockResolvedValue(clockedOut());

      const result = await service.reviewOvertime(
        'att-1',
        { status: 'REJECTED' },
        'admin-1',
      );

      expect(
        prisma.attendance.update.mock.calls[0][0].data.approvedOvertimeMinutes,
      ).toBe(0);
      expect(result.isOvertimeApproved).toBe(false);
      // The computed minutes stay visible next to the rejected badge
      expect(result.overtimeMinutes).toBe(120);
    });

    it('OVERRIDDEN uses the admin minutes, shown instead of the computed ones', async () => {
      prisma.attendance.findUnique.mockResolvedValue(clockedOut());

      const result = await service.reviewOvertime(
        'att-1',
        { status: 'OVERRIDDEN', approvedMinutes: 90 },
        'admin-1',
      );

      expect(
        prisma.attendance.update.mock.calls[0][0].data.approvedOvertimeMinutes,
      ).toBe(90);
      expect(result.overtimeMinutes).toBe(90);
      expect(result.isOvertimeApproved).toBe(true);
    });

    it('allows OVERRIDDEN even without computed overtime', async () => {
      prisma.attendance.findUnique.mockResolvedValue(
        clockedOut({ overtimeMinutes: 0 }),
      );

      await service.reviewOvertime(
        'att-1',
        { status: 'OVERRIDDEN', approvedMinutes: 30 },
        'admin-1',
      );

      expect(prisma.attendance.update).toHaveBeenCalled();
    });

    it.each(['APPROVED', 'REJECTED'] as const)(
      'rejects %s with 400 when there is no computed overtime',
      async (status) => {
        prisma.attendance.findUnique.mockResolvedValue(
          clockedOut({ overtimeMinutes: 0 }),
        );

        await expect(
          service.reviewOvertime('att-1', { status }, 'admin-1'),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.attendance.update).not.toHaveBeenCalled();
      },
    );

    it('rejects with 409 before the staff has clocked out', async () => {
      prisma.attendance.findUnique.mockResolvedValue(
        clockedOut({ clockOutTime: null }),
      );

      await expect(
        service.reviewOvertime('att-1', { status: 'APPROVED' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 404 for an unknown attendance', async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(
        service.reviewOvertime('nope', { status: 'APPROVED' }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('correctClockOut', () => {
    // Clock-in 08:00 WIB on 2026-11-20; "now" is 2026-11-21 12:00 WIB
    const clockInTime = new Date('2026-11-20T01:00:00.000Z');
    const forgotToClockOut = (overrides: Record<string, unknown> = {}) =>
      attendanceRow({
        clockInTime,
        status: AttendanceStatus.ON_TIME,
        staff: { ...attendanceRow().staff, dailyShiftHours: 8 },
        ...overrides,
      });

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date('2026-11-21T05:00:00.000Z'));
      prisma.attendance.update.mockImplementation((args: any) =>
        Promise.resolve(attendanceRow({ clockInTime, ...args.data })),
      );
    });
    afterEach(() => jest.useRealTimers());

    it('reads HH:mm as WIB on the attendance date and recomputes duration and overtime', async () => {
      prisma.attendance.findUnique.mockResolvedValue(forgotToClockOut());

      const result = await service.correctClockOut(
        'att-1',
        { clockOutTime: '18:30', notes: 'Lupa presensi pulang' },
        'admin-1',
      );

      const data = prisma.attendance.update.mock.calls[0][0].data;
      // 18:30 WIB = 11:30 UTC; 10h30m worked on an 8h shift
      expect(data.clockOutTime.toISOString()).toBe('2026-11-20T11:30:00.000Z');
      expect(data.workDurationMinutes).toBe(630);
      expect(data.overtimeMinutes).toBe(150);
      expect(data.status).toBe(AttendanceStatus.COMPLETED);
      expect(data).toMatchObject({
        correctedById: 'admin-1',
        correctionNotes: 'Lupa presensi pulang',
        originalClockOutTime: null,
      });
      expect(result.clockOutTime).toBe('2026-11-20T11:30:00.000Z');
    });

    it('rolls an HH:mm not after clock-in over to the next day (past-midnight shift)', async () => {
      prisma.attendance.findUnique.mockResolvedValue(forgotToClockOut());

      await service.correctClockOut(
        'att-1',
        { clockOutTime: '01:00', notes: 'Closing malam' },
        'admin-1',
      );

      const data = prisma.attendance.update.mock.calls[0][0].data;
      // 01:00 WIB on 21 Nov = 18:00 UTC on 20 Nov; 17h worked
      expect(data.clockOutTime.toISOString()).toBe('2026-11-20T18:00:00.000Z');
      expect(data.workDurationMinutes).toBe(17 * 60);
    });

    it('accepts a full ISO datetime', async () => {
      prisma.attendance.findUnique.mockResolvedValue(forgotToClockOut());

      await service.correctClockOut(
        'att-1',
        { clockOutTime: '2026-11-20T17:00:00+07:00', notes: 'Koreksi' },
        'admin-1',
      );

      expect(
        prisma.attendance.update.mock.calls[0][0].data.workDurationMinutes,
      ).toBe(9 * 60);
    });

    it.each([
      ['in the future', '2026-11-21T13:00:00+07:00'],
      ['before clock-in', '2026-11-20T07:00:00+07:00'],
      ['more than 24h after clock-in', '2026-11-21T09:00:00+07:00'],
    ])('rejects a clock-out %s with 400', async (_label, clockOutTime) => {
      prisma.attendance.findUnique.mockResolvedValue(forgotToClockOut());

      await expect(
        service.correctClockOut(
          'att-1',
          { clockOutTime, notes: 'Koreksi' },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.attendance.update).not.toHaveBeenCalled();
    });

    it('rejects with 400 when there is no clock-in', async () => {
      prisma.attendance.findUnique.mockResolvedValue(
        forgotToClockOut({ clockInTime: null }),
      );

      await expect(
        service.correctClockOut(
          'att-1',
          { clockOutTime: '17:00', notes: 'Koreksi' },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('resets the overtime review when the minutes change, and keeps the first clock-out', async () => {
      const firstClockOut = new Date('2026-11-20T13:00:00.000Z');
      prisma.attendance.findUnique.mockResolvedValue(
        forgotToClockOut({
          clockOutTime: firstClockOut,
          overtimeMinutes: 240,
          overtimeReviewStatus: 'APPROVED',
          approvedOvertimeMinutes: 240,
          overtimeReviewedById: 'admin-1',
        }),
      );

      await service.correctClockOut(
        'att-1',
        { clockOutTime: '17:00', notes: 'Jam pulang salah' },
        'admin-2',
      );

      const data = prisma.attendance.update.mock.calls[0][0].data;
      expect(data.overtimeMinutes).toBe(60);
      expect(data).toMatchObject({
        overtimeReviewStatus: null,
        approvedOvertimeMinutes: null,
        overtimeReviewedById: null,
        overtimeReviewedAt: null,
        originalClockOutTime: firstClockOut,
      });
    });

    it('keeps the overtime review when the minutes do not change', async () => {
      prisma.attendance.findUnique.mockResolvedValue(
        forgotToClockOut({
          clockOutTime: new Date('2026-11-20T10:00:00.000Z'),
          overtimeMinutes: 60,
          overtimeReviewStatus: 'APPROVED',
        }),
      );

      await service.correctClockOut(
        'att-1',
        { clockOutTime: '17:00', notes: 'Catatan saja' },
        'admin-1',
      );

      expect(prisma.attendance.update.mock.calls[0][0].data).not.toHaveProperty(
        'overtimeReviewStatus',
      );
    });

    it('keeps a null original clock-out on a second correction of a forgotten clock-out', async () => {
      prisma.attendance.findUnique.mockResolvedValue(
        forgotToClockOut({
          clockOutTime: new Date('2026-11-20T13:00:00.000Z'), // set by the first correction
          correctedAt: new Date('2026-11-21T02:00:00.000Z'),
          originalClockOutTime: null,
        }),
      );

      await service.correctClockOut(
        'att-1',
        { clockOutTime: '17:00', notes: 'Koreksi kedua' },
        'admin-1',
      );

      expect(
        prisma.attendance.update.mock.calls[0][0].data.originalClockOutTime,
      ).toBeNull();
    });

    it('keeps LATE as LATE after correction', async () => {
      prisma.attendance.findUnique.mockResolvedValue(
        forgotToClockOut({ status: AttendanceStatus.LATE }),
      );

      await service.correctClockOut(
        'att-1',
        { clockOutTime: '17:00', notes: 'Koreksi' },
        'admin-1',
      );

      expect(prisma.attendance.update.mock.calls[0][0].data.status).toBe(
        AttendanceStatus.LATE,
      );
    });

    it('throws 404 for an unknown attendance', async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(
        service.correctClockOut(
          'nope',
          { clockOutTime: '17:00', notes: 'Koreksi' },
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAttendancePaginated', () => {
    it('maps every row to the FE AttendanceItem shape', async () => {
      prisma.attendance.count.mockResolvedValue(1);
      prisma.attendance.findMany.mockResolvedValue([attendanceRow()]);

      const result = await service.getAttendancePaginated({ page: 1, limit: 10 });

      expect(result.items[0]).toMatchObject({
        staffName: 'Budi Kasir',
        staffRole: UserRole.CASHIER,
        isAutoClosed: false,
        actingRole: null,
        createdAt: '2026-11-20T01:00:00.000Z',
      });
      expect(result.items[0]).not.toHaveProperty('staff');
      expect(result.meta.totalItems).toBe(1);
    });
  });

  describe('shared PIN lockout on clock-in/out', () => {
    const clockIn = () =>
      service.recordClockIn({
        staffId: 'staff-1',
        pinCode: '1234',
        latitude: -6.2297465,
        longitude: 106.8557342,
      });

    it('refuses clock-in with 429 while the PIN is locked (e.g. by kiosk-exit attempts)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockStaff,
        pinLockedUntil: new Date(Date.now() + 2 * 60_000),
      });

      const error = await clockIn().catch((e) => e);

      expect(error.getStatus()).toBe(429);
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('counts a wrong clock-in PIN toward the shared lockout', async () => {
      prisma.user.findUnique.mockResolvedValue(mockStaff);
      prisma.branchSetting.findFirst.mockResolvedValue(mockBranch);

      await expect(
        service.recordClockIn({
          staffId: 'staff-1',
          pinCode: '9999',
          latitude: -6.2297465,
          longitude: 106.8557342,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'staff-1' },
        data: { pinFailedAttempts: { increment: 1 } },
        select: { pinFailedAttempts: true },
      });
    });
  });

  describe('getKioskRoster', () => {
    beforeEach(() => {
      prisma.user.findMany = jest.fn();
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      // 01:30 WIB on 21 Nov (still 20 Nov in UTC)
      jest.setSystemTime(new Date('2026-11-20T18:30:00.000Z'));
    });
    afterEach(() => jest.useRealTimers());

    const staffRows = [
      { id: 'admin-1', employeeId: 'KC-001', name: 'Ayu Admin', role: UserRole.ADMIN, avatarUrl: null, pinCode: 'hash-a' },
      { id: 'staff-1', employeeId: 'KC-002', name: 'Budi Kasir', role: UserRole.CASHIER, avatarUrl: '/uploads/b.webp', pinCode: 'hash-b' },
      { id: 'staff-2', employeeId: null, name: 'Citra Dapur', role: UserRole.KITCHEN, avatarUrl: null, pinCode: null },
    ];

    it('lists active onboarded staff (ADMIN included) with today WIB attendance and no contact details', async () => {
      prisma.user.findMany.mockResolvedValue(staffRows);
      prisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-1',
          staffId: 'staff-1',
          clockInTime: new Date('2026-11-21T01:05:00.000Z'),
          clockOutTime: null,
          status: AttendanceStatus.ON_TIME,
        },
      ]);

      const roster = await service.getKioskRoster();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, deletedAt: null, needsOnboarding: false },
          orderBy: { name: 'asc' },
        }),
      );
      // Roles are not filtered: ADMIN shows on the kiosk too
      expect(prisma.user.findMany.mock.calls[0][0].where).not.toHaveProperty('role');
      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { date: '2026-11-21', staffId: { in: ['admin-1', 'staff-1', 'staff-2'] } },
        }),
      );
      expect(roster).toEqual([
        { id: 'admin-1', employeeId: 'KC-001', name: 'Ayu Admin', role: 'ADMIN', avatarUrl: null, hasPin: true, today: null },
        {
          id: 'staff-1',
          employeeId: 'KC-002',
          name: 'Budi Kasir',
          role: 'CASHIER',
          avatarUrl: '/uploads/b.webp',
          hasPin: true,
          today: {
            attendanceId: 'att-1',
            clockInTime: '2026-11-21T01:05:00.000Z',
            clockOutTime: null,
            status: 'ON_TIME',
          },
        },
        { id: 'staff-2', employeeId: null, name: 'Citra Dapur', role: 'KITCHEN', avatarUrl: null, hasPin: false, today: null },
      ]);
    });

    it('never exposes the PIN hash, email or phone', async () => {
      prisma.user.findMany.mockResolvedValue(staffRows);
      prisma.attendance.findMany.mockResolvedValue([]);

      const roster = await service.getKioskRoster();

      for (const item of roster) {
        expect(item).not.toHaveProperty('pinCode');
        expect(item).not.toHaveProperty('email');
        expect(item).not.toHaveProperty('phone');
      }
      const select = prisma.user.findMany.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('email');
      expect(select).not.toHaveProperty('phone');
    });

    it('skips the attendance query when there is no staff', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(service.getKioskRoster()).resolves.toEqual([]);
      expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    });
  });
});
