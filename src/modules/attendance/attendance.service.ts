import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PinVerificationService } from '../../common/security/pin-verification.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { OvertimeReviewDto } from './dto/overtime-review.dto';
import { AttendanceCorrectionDto } from './dto/attendance-correction.dto';
import {
  AttendanceItemResponse,
  AttendanceSummaryResponse,
} from './dto/attendance-response.dto';
import { calculateHaversineDistance } from './utils/geofence.util';
import {
  ATTENDANCE_INCLUDE,
  computeOvertimeMinutes,
  toAttendanceItem,
} from './utils/attendance-mapper';
import {
  branchDateTime,
  toBranchDateString,
} from '../../common/utils/branch-time';
import { AttendanceStatus, LeaveType, LeaveStatus } from '@prisma/client';

const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pinVerification: PinVerificationService,
  ) {}

  /**
   * Tanggal hari ini (YYYY-MM-DD) menurut WIB, bukan UTC: presensi jam 00:00–07:00 WIB tetap masuk hari ini
   */
  private getTodayString(): string {
    return toBranchDateString();
  }

  /**
   * Presensi Masuk (Clock-In)
   * 1. Verifikasi PIN 4-digit staf
   * 2. Validasi Geofence (Haversine distance <= branch.geofenceRadius)
   * 3. Kalkulasi On-Time vs Late berdasarkan lateGracePeriod
   * 4. Upsert/Save record presensi
   */
  async recordClockIn(dto: ClockInDto): Promise<AttendanceItemResponse> {
    const today = this.getTodayString();

    // 1. Cari data staf
    const staff = await this.prisma.user.findUnique({
      where: { id: dto.staffId, deletedAt: null },
    });

    if (!staff || !staff.isActive) {
      throw new NotFoundException('Staf tidak ditemukan atau status tidak aktif');
    }

    if (!staff.pinCode) {
      throw new BadRequestException('PIN presensi belum diatur untuk staf ini. Hubungi admin.');
    }

    // 2. Verifikasi PIN (lockout dibagi dengan verify-pin kiosk)
    const isPinMatch = await this.pinVerification.verify(
      { ...staff, pinCode: staff.pinCode },
      dto.pinCode,
      'CLOCK_IN',
    );
    if (!isPinMatch) {
      throw new BadRequestException('PIN presensi salah. Masukkan 4-digit PIN yang valid.');
    }

    // 3. Validasi Geofence
    const branch = await this.prisma.branchSetting.findFirst();
    let distanceMeters = 0;
    let isWithinGeofence = true;

    if (branch && branch.latitude !== undefined && branch.longitude !== undefined) {
      distanceMeters = calculateHaversineDistance(
        dto.latitude,
        dto.longitude,
        branch.latitude,
        branch.longitude
      );

      const maxRadius = branch.geofenceRadius || 100;
      if (distanceMeters > maxRadius) {
        throw new BadRequestException(
          `Presensi masuk ditolak: Lokasi berada di luar radius cabang kafe (${distanceMeters}m > ${maxRadius}m)`
        );
      }
    }

    // 4. Periksa apakah sudah ada presensi masuk hari ini
    const existing = await this.prisma.attendance.findUnique({
      where: { staffId_date: { staffId: staff.id, date: today } },
    });

    if (existing && existing.clockInTime) {
      throw new ConflictException('Staf sudah melakukan presensi masuk hari ini.');
    }

    // 5. Kalkulasi Status Kehadiran (ON_TIME vs LATE)
    const now = new Date();
    const lateGraceMinutes = branch?.lateGracePeriod ?? 15;
    const openTimeStr = branch?.openTime || '08:00';
    const [openHour, openMinute] = openTimeStr.split(':').map(Number);

    // Jam buka cabang adalah jam dinding WIB, terlepas dari timezone server
    const thresholdTime = branchDateTime(
      today,
      `${String(openHour).padStart(2, '0')}:${String(openMinute).padStart(2, '0')}`,
    );
    thresholdTime.setTime(thresholdTime.getTime() + lateGraceMinutes * 60_000);

    const status = now > thresholdTime ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME;

    // 6. Simpan presensi ke database
    const attendance = await this.prisma.attendance.upsert({
      where: { staffId_date: { staffId: staff.id, date: today } },
      create: {
        branchId: branch?.id || 'default-branch',
        staffId: staff.id,
        date: today,
        clockInTime: now,
        status,
        clockInLat: dto.latitude,
        clockInLon: dto.longitude,
        clockInDistanceMeters: distanceMeters,
        isWithinGeofence,
        notes: dto.notes,
      },
      update: {
        clockInTime: now,
        status,
        clockInLat: dto.latitude,
        clockInLon: dto.longitude,
        clockInDistanceMeters: distanceMeters,
        isWithinGeofence,
        notes: dto.notes,
      },
      include: ATTENDANCE_INCLUDE,
    });

    this.logger.log(`[Attendance] Clock-In recorded for ${staff.name} (${status}) at ${distanceMeters}m`);
    return toAttendanceItem(attendance);
  }

  /**
   * Presensi Pulang (Clock-Out)
   * 1. Verifikasi PIN 4-digit staf
   * 2. Validasi Geofence
   * 3. Hitung durasi kerja total dalam menit
   * 4. Update status dan clockOutTime
   */
  async recordClockOut(dto: ClockOutDto): Promise<AttendanceItemResponse> {
    const today = this.getTodayString();

    const staff = await this.prisma.user.findUnique({
      where: { id: dto.staffId, deletedAt: null },
    });

    if (!staff || !staff.isActive) {
      throw new NotFoundException('Staf tidak ditemukan atau status tidak aktif');
    }

    if (!staff.pinCode) {
      throw new BadRequestException('PIN presensi belum diatur untuk staf ini');
    }

    const isPinMatch = await this.pinVerification.verify(
      { ...staff, pinCode: staff.pinCode },
      dto.pinCode,
      'CLOCK_OUT',
    );
    if (!isPinMatch) {
      throw new BadRequestException('PIN presensi salah. Masukkan 4-digit PIN yang valid.');
    }

    const branch = await this.prisma.branchSetting.findFirst();
    if (branch && branch.latitude !== undefined && branch.longitude !== undefined) {
      const distanceMeters = calculateHaversineDistance(
        dto.latitude,
        dto.longitude,
        branch.latitude,
        branch.longitude
      );

      const maxRadius = branch.geofenceRadius || 100;
      if (distanceMeters > maxRadius) {
        throw new BadRequestException(
          `Presensi pulang ditolak: Lokasi berada di luar radius cabang kafe (${distanceMeters}m > ${maxRadius}m)`
        );
      }
    }

    const attendance = await this.prisma.attendance.findUnique({
      where: { staffId_date: { staffId: staff.id, date: today } },
    });

    if (!attendance || !attendance.clockInTime) {
      throw new BadRequestException('Staf belum melakukan presensi masuk hari ini.');
    }

    if (attendance.clockOutTime) {
      throw new ConflictException('Staf sudah melakukan presensi pulang hari ini.');
    }

    const now = new Date();
    const diffMs = now.getTime() - attendance.clockInTime.getTime();
    const workDurationMinutes = Math.max(0, Math.round(diffMs / 60000));
    const overtimeMinutes = computeOvertimeMinutes(
      workDurationMinutes,
      staff.dailyShiftHours,
    );

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        clockOutTime: now,
        workDurationMinutes,
        overtimeMinutes,
        status: this.completedStatus(attendance.status),
        notes: dto.notes ? `${attendance.notes || ''} | Out: ${dto.notes}`.trim() : attendance.notes,
      },
      include: ATTENDANCE_INCLUDE,
    });

    this.logger.log(
      `[Attendance] Clock-Out recorded for ${staff.name} (${workDurationMinutes} mins, overtime ${overtimeMinutes} mins)`,
    );
    return toAttendanceItem(updated);
  }

  /**
   * Review Lembur oleh Admin
   * - APPROVED: menit lembur hasil hitung disetujui apa adanya
   * - REJECTED: lembur tidak diberikan (0 menit)
   * - OVERRIDDEN: admin menetapkan jumlah menit sendiri
   * Review boleh diulang; keputusan terakhir yang berlaku.
   */
  async reviewOvertime(
    id: string,
    dto: OvertimeReviewDto,
    reviewerId: string,
  ): Promise<AttendanceItemResponse> {
    const attendance = await this.prisma.attendance.findUnique({ where: { id } });

    if (!attendance) {
      throw new NotFoundException(`Presensi dengan ID ${id} tidak ditemukan`);
    }
    if (!attendance.clockOutTime) {
      throw new ConflictException(
        'Staf belum presensi pulang, lembur belum dapat ditinjau.',
      );
    }

    const computedMinutes = attendance.overtimeMinutes ?? 0;
    if (dto.status !== 'OVERRIDDEN' && computedMinutes <= 0) {
      throw new BadRequestException(
        'Tidak ada lembur untuk ditinjau pada presensi ini. Gunakan OVERRIDDEN untuk menetapkan menit lembur manual.',
      );
    }

    const approvedByDecision = {
      APPROVED: computedMinutes,
      REJECTED: 0,
      OVERRIDDEN: dto.approvedMinutes ?? 0,
    } as const;
    const approvedOvertimeMinutes = approvedByDecision[dto.status];

    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        overtimeReviewStatus: dto.status,
        approvedOvertimeMinutes,
        overtimeReviewedById: reviewerId,
        overtimeReviewedAt: new Date(),
        overtimeNotes: dto.notes || null,
      },
      include: ATTENDANCE_INCLUDE,
    });

    this.logger.log({
      step: 'ATTENDANCE_OVERTIME_REVIEW',
      attendanceId: id,
      staffId: attendance.staffId,
      reviewerId,
      decision: dto.status,
      computedMinutes,
      approvedOvertimeMinutes,
      msg: `Overtime ${dto.status} for attendance ${id}`,
    });

    return toAttendanceItem(updated);
  }

  /**
   * Koreksi Jam Pulang oleh Admin (mis. staf lupa presensi pulang)
   * `HH:mm` dibaca sebagai jam WIB pada tanggal presensi; jika tidak setelah jam masuk, dianggap hari berikutnya
   * (shift lewat tengah malam). Durasi kerja dan lembur dihitung ulang; review lembur di-reset jika menitnya berubah.
   */
  async correctClockOut(
    id: string,
    dto: AttendanceCorrectionDto,
    correctorId: string,
  ): Promise<AttendanceItemResponse> {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: { staff: { select: { dailyShiftHours: true } } },
    });

    if (!attendance) {
      throw new NotFoundException(`Presensi dengan ID ${id} tidak ditemukan`);
    }
    if (!attendance.clockInTime) {
      throw new BadRequestException(
        'Presensi ini tidak memiliki jam masuk, jam pulang tidak dapat dikoreksi.',
      );
    }

    const clockIn = attendance.clockInTime;
    let clockOut: Date;
    if (dto.clockOutTime.includes('T')) {
      clockOut = new Date(dto.clockOutTime);
    } else {
      clockOut = branchDateTime(attendance.date, dto.clockOutTime);
      if (clockOut <= clockIn) {
        clockOut = new Date(clockOut.getTime() + DAY_MS);
      }
    }

    if (clockOut <= clockIn) {
      throw new BadRequestException('Jam pulang harus setelah jam masuk.');
    }
    if (clockOut.getTime() > Date.now()) {
      throw new BadRequestException('Jam pulang tidak boleh di masa depan.');
    }
    if (clockOut.getTime() - clockIn.getTime() > MAX_SHIFT_MS) {
      throw new BadRequestException('Durasi kerja hasil koreksi melebihi 24 jam.');
    }

    const workDurationMinutes = Math.round(
      (clockOut.getTime() - clockIn.getTime()) / 60000,
    );
    const overtimeMinutes = computeOvertimeMinutes(
      workDurationMinutes,
      attendance.staff.dailyShiftHours,
    );
    // A decision on the old minutes no longer applies once the minutes change
    const resetReview = overtimeMinutes !== attendance.overtimeMinutes;

    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        clockOutTime: clockOut,
        workDurationMinutes,
        overtimeMinutes,
        status: this.completedStatus(attendance.status),
        correctedById: correctorId,
        correctedAt: new Date(),
        correctionNotes: dto.notes,
        // Keep the clock-out recorded before the first correction (null if the staff never clocked out)
        originalClockOutTime: attendance.correctedAt
          ? attendance.originalClockOutTime
          : attendance.clockOutTime,
        ...(resetReview
          ? {
              overtimeReviewStatus: null,
              approvedOvertimeMinutes: null,
              overtimeReviewedById: null,
              overtimeReviewedAt: null,
            }
          : {}),
      },
      include: ATTENDANCE_INCLUDE,
    });

    this.logger.log({
      step: 'ATTENDANCE_CORRECTION',
      attendanceId: id,
      staffId: attendance.staffId,
      correctorId,
      previousClockOut: attendance.clockOutTime?.toISOString() ?? null,
      correctedClockOut: clockOut.toISOString(),
      workDurationMinutes,
      overtimeMinutes,
      overtimeReviewReset: resetReview,
      msg: `Clock-out corrected for attendance ${id}`,
    });

    return toAttendanceItem(updated);
  }

  /** Status setelah presensi pulang: LATE tetap LATE, ON_TIME menjadi COMPLETED, status lain tidak berubah. */
  private completedStatus(current: AttendanceStatus): AttendanceStatus {
    return current === AttendanceStatus.ON_TIME ||
      current === AttendanceStatus.COMPLETED
      ? AttendanceStatus.COMPLETED
      : current;
  }

  /**
   * Mengambil daftar presensi staf dengan filter dan pagination
   */
  async getAttendancePaginated(query: AttendanceQueryDto) {
    const { page = 1, limit = 10, startDate, endDate, status, role, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate };
    } else if (startDate) {
      where.date = startDate;
    }

    if (status) {
      where.status = status;
    }

    if (role || (search && search.trim())) {
      where.staff = {};
      if (role) {
        where.staff.role = role;
      }
      if (search && search.trim()) {
        const s = search.trim();
        where.staff.OR = [
          { name: { contains: s, mode: 'insensitive' } },
          { email: { contains: s, mode: 'insensitive' } },
          { phone: { contains: s } },
        ];
      }
    }

    const [totalItems, items] = await Promise.all([
      this.prisma.attendance.count({ where }),
      this.prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: ATTENDANCE_INCLUDE,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: items.map(toAttendanceItem),
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Ringkasan Statistik Presensi Harian (KPI Summary)
   */
  async getAttendanceSummary(
    dateParam?: string,
  ): Promise<AttendanceSummaryResponse> {
    const date = dateParam || this.getTodayString();

    const [totalActiveStaff, attendances] = await Promise.all([
      this.prisma.user.count({
        where: { isActive: true, deletedAt: null },
      }),
      this.prisma.attendance.findMany({
        where: { date },
      }),
    ]);

    const presentCount = attendances.filter((a) => a.clockInTime !== null).length;
    const onTimeCount = attendances.filter(
      (a) => a.status === AttendanceStatus.ON_TIME || a.status === AttendanceStatus.COMPLETED
    ).length;
    const lateCount = attendances.filter((a) => a.status === AttendanceStatus.LATE).length;
    const earlyLeaveCount = attendances.filter(
      (a) => a.status === AttendanceStatus.EARLY_LEAVE,
    ).length;
    const leaveCount = attendances.filter(
      (a) => a.status === AttendanceStatus.SICK || a.status === AttendanceStatus.LEAVE
    ).length;

    const absentCount = Math.max(0, totalActiveStaff - (presentCount + leaveCount));
    const attendanceRatePercent =
      totalActiveStaff > 0 ? Math.round((presentCount / totalActiveStaff) * 100) : 0;

    // Field names follow FE `AttendanceSummarySchema`
    return {
      date,
      totalStaff: totalActiveStaff,
      presentCount,
      onTimeCount,
      lateCount,
      earlyLeaveCount,
      leaveCount,
      absentCount,
      attendanceRatePercent,
    };
  }

  /**
   * Pengajuan Izin / Cuti Resmi
   */
  async createLeaveRequest(dto: CreateLeaveRequestDto) {
    const staff = await this.prisma.user.findUnique({
      where: { id: dto.staffId, deletedAt: null },
    });

    if (!staff) {
      throw new NotFoundException('Staf tidak ditemukan');
    }

    const branch = await this.prisma.branchSetting.findFirst();
    const leaveTypeEnum = dto.leaveType as LeaveType;

    // Buat record LeaveRequest
    const leaveRequest = await this.prisma.leaveRequest.create({
      data: {
        branchId: branch?.id || 'default-branch',
        staffId: staff.id,
        leaveType: leaveTypeEnum,
        startDate: dto.startDate,
        endDate: dto.endDate,
        reason: dto.reason,
        status: LeaveStatus.APPROVED,
      },
      include: {
        staff: { select: { id: true, name: true, role: true } },
      },
    });

    // Otomatis tandai presensi hari ini jika rentang mencakup hari ini
    const today = this.getTodayString();
    if (dto.startDate <= today && dto.endDate >= today) {
      const attendanceStatus =
        leaveTypeEnum === LeaveType.SICK ? AttendanceStatus.SICK : AttendanceStatus.LEAVE;

      await this.prisma.attendance.upsert({
        where: { staffId_date: { staffId: staff.id, date: today } },
        create: {
          branchId: branch?.id || 'default-branch',
          staffId: staff.id,
          date: today,
          status: attendanceStatus,
          leaveType: leaveTypeEnum,
          leaveStatus: LeaveStatus.APPROVED,
          leaveReason: dto.reason,
          isWithinGeofence: true,
        },
        update: {
          status: attendanceStatus,
          leaveType: leaveTypeEnum,
          leaveStatus: LeaveStatus.APPROVED,
          leaveReason: dto.reason,
        },
      });
    }

    this.logger.log(
      `[Attendance] Leave request ${leaveRequest.id} created for ${staff.name} (${dto.leaveType})`,
    );
    // Shape follows FE `LeaveResponseSchema`
    return {
      success: true,
      message: `Pengajuan izin ${staff.name} (${dto.startDate} s/d ${dto.endDate}) berhasil dicatat`,
    };
  }
}
