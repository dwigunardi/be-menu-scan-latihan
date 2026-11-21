import { z } from 'zod';

// Response contracts — mirror FE schemas in fe/src/lib/validations/attendance.schema.ts

export const AttendanceItemResponseSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  staffId: z.string(),
  staffName: z.string(),
  staffRole: z.enum(['ADMIN', 'CASHIER', 'KITCHEN', 'WAITER']),
  avatarUrl: z.string().nullable(),
  date: z.string(), // YYYY-MM-DD (WIB)
  clockInTime: z.string().nullable(), // ISO datetime
  clockOutTime: z.string().nullable(), // ISO datetime
  status: z.enum([
    'ON_TIME',
    'LATE',
    'EARLY_LEAVE',
    'COMPLETED',
    'SICK',
    'LEAVE',
    'ABSENT',
  ]),
  clockInLat: z.number().nullable(),
  clockInLon: z.number().nullable(),
  clockInDistanceMeters: z.number().nullable(),
  isWithinGeofence: z.boolean(),
  workDurationMinutes: z.number().nullable(),
  isAutoClosed: z.boolean(),
  overtimeMinutes: z.number().nullable(),
  isOvertimeApproved: z.boolean().nullable(),
  overtimeApprovedById: z.string().nullable(),
  overtimeNotes: z.string().nullable(),
  actingRole: z.string().nullable(),
  notes: z.string().nullable(),
  leaveType: z
    .enum(['SICK', 'ANNUAL_LEAVE', 'URGENT_MATTER', 'OTHER'])
    .nullable(),
  leaveStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).nullable(),
  leaveReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AttendanceItemResponse = z.infer<
  typeof AttendanceItemResponseSchema
>;

export const AttendancePaginatedResponseSchema = z.object({
  items: z.array(AttendanceItemResponseSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  }),
});

export const AttendanceSummaryResponseSchema = z.object({
  date: z.string(),
  totalStaff: z.number(),
  presentCount: z.number(),
  onTimeCount: z.number(),
  lateCount: z.number(),
  earlyLeaveCount: z.number(),
  leaveCount: z.number(),
  absentCount: z.number(),
  attendanceRatePercent: z.number(),
});

export type AttendanceSummaryResponse = z.infer<
  typeof AttendanceSummaryResponseSchema
>;

export const LeaveResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
