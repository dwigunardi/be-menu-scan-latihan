import { Prisma } from '@prisma/client';
import { AttendanceItemResponse } from '../dto/attendance-response.dto';

export const ATTENDANCE_INCLUDE = {
  staff: { select: { id: true, name: true, role: true, avatarUrl: true } },
} satisfies Prisma.AttendanceInclude;

export type AttendanceWithStaff = Prisma.AttendanceGetPayload<{
  include: typeof ATTENDANCE_INCLUDE;
}>;

/** Minutes worked beyond the staff's daily shift length (never negative). */
export function computeOvertimeMinutes(
  workDurationMinutes: number,
  dailyShiftHours: number,
): number {
  return Math.max(0, workDurationMinutes - dailyShiftHours * 60);
}

/** Maps a DB row to the FE `AttendanceItem` contract. */
export function toAttendanceItem(
  row: AttendanceWithStaff,
): AttendanceItemResponse {
  const review = row.overtimeReviewStatus;

  return {
    id: row.id,
    branchId: row.branchId,
    staffId: row.staffId,
    staffName: row.staff.name,
    staffRole: row.staff.role,
    avatarUrl: row.staff.avatarUrl,
    date: row.date,
    clockInTime: row.clockInTime?.toISOString() ?? null,
    clockOutTime: row.clockOutTime?.toISOString() ?? null,
    status: row.status,
    clockInLat: row.clockInLat,
    clockInLon: row.clockInLon,
    clockInDistanceMeters: row.clockInDistanceMeters,
    isWithinGeofence: row.isWithinGeofence,
    workDurationMinutes: row.workDurationMinutes,
    isAutoClosed: false, // No automatic clock-out cutoff job exists yet
    // An override replaces the computed minutes; otherwise show what was computed
    overtimeMinutes:
      review === 'OVERRIDDEN'
        ? row.approvedOvertimeMinutes
        : row.overtimeMinutes,
    isOvertimeApproved: review === null ? null : review !== 'REJECTED',
    overtimeApprovedById: row.overtimeReviewedById,
    overtimeNotes: row.overtimeNotes,
    actingRole: null, // Role substitution is not tracked yet
    notes: row.notes,
    leaveType: row.leaveType,
    leaveStatus: row.leaveStatus,
    leaveReason: row.leaveReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
