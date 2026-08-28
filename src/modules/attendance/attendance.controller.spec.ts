import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceStatus, LeaveType, LeaveStatus, UserRole } from '@prisma/client';

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let service: any;

  const mockAttendance = {
    id: 'att-1',
    staffId: 'staff-1',
    date: '2026-08-28',
    status: AttendanceStatus.ON_TIME,
    clockInTime: new Date(),
    clockOutTime: null,
  };

  beforeEach(async () => {
    service = {
      recordClockIn: jest.fn().mockResolvedValue(mockAttendance),
      recordClockOut: jest.fn().mockResolvedValue({
        ...mockAttendance,
        clockOutTime: new Date(),
        status: AttendanceStatus.COMPLETED,
        workDurationMinutes: 480,
      }),
      getAttendancePaginated: jest.fn().mockResolvedValue({
        items: [mockAttendance],
        meta: { page: 1, limit: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      }),
      getAttendanceSummary: jest.fn().mockResolvedValue({
        date: '2026-08-28',
        totalActiveStaff: 5,
        presentCount: 4,
        onTimeCount: 3,
        lateCount: 1,
        leaveCount: 1,
        absentCount: 0,
        disciplinePercentage: 75,
      }),
      createLeaveRequest: jest.fn().mockResolvedValue({
        id: 'leave-1',
        staffId: 'staff-1',
        leaveType: LeaveType.SICK,
        startDate: '2026-08-28',
        endDate: '2026-08-29',
        reason: 'Sakit flu',
        status: LeaveStatus.APPROVED,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [{ provide: AttendanceService, useValue: service }],
    }).compile();

    controller = module.get<AttendanceController>(AttendanceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('recordClockIn', () => {
    it('should call attendanceService.recordClockIn', async () => {
      const dto = {
        staffId: 'staff-1',
        pinCode: '1234',
        latitude: -6.2297,
        longitude: 106.8557,
      };
      const result = await controller.recordClockIn(dto);
      expect(service.recordClockIn).toHaveBeenCalledWith(dto);
      expect(result.id).toBe('att-1');
    });
  });

  describe('recordClockOut', () => {
    it('should call attendanceService.recordClockOut', async () => {
      const dto = {
        staffId: 'staff-1',
        pinCode: '1234',
        latitude: -6.2297,
        longitude: 106.8557,
      };
      const result = await controller.recordClockOut(dto);
      expect(service.recordClockOut).toHaveBeenCalledWith(dto);
      expect(result.status).toBe(AttendanceStatus.COMPLETED);
    });
  });

  describe('getAttendancePaginated', () => {
    it('should return paginated attendance list', async () => {
      const query = { page: 1, limit: 10 };
      const result = await controller.getAttendancePaginated(query);
      expect(service.getAttendancePaginated).toHaveBeenCalledWith(query);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getAttendanceSummary', () => {
    it('should return daily summary statistics', async () => {
      const result = await controller.getAttendanceSummary('2026-08-28');
      expect(service.getAttendanceSummary).toHaveBeenCalledWith('2026-08-28');
      expect(result.disciplinePercentage).toBe(75);
    });
  });

  describe('createLeaveRequest', () => {
    it('should call attendanceService.createLeaveRequest', async () => {
      const dto = {
        staffId: 'staff-1',
        leaveType: 'SICK' as any,
        startDate: '2026-08-28',
        endDate: '2026-08-29',
        reason: 'Sakit flu',
      };
      const result = await controller.createLeaveRequest(dto);
      expect(service.createLeaveRequest).toHaveBeenCalledWith(dto);
      expect(result.id).toBe('leave-1');
    });
  });
});
