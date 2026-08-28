import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { calculateHaversineDistance } from './utils/geofence.util';
import { AttendanceStatus, LeaveType, LeaveStatus } from '@prisma/client';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper untuk mendapatkan tanggal hari ini dalam format YYYY-MM-DD
   */
  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Presensi Masuk (Clock-In)
   * 1. Verifikasi PIN 4-digit staf
   * 2. Validasi Geofence (Haversine distance <= branch.geofenceRadius)
   * 3. Kalkulasi On-Time vs Late berdasarkan lateGracePeriod
   * 4. Upsert/Save record presensi
   */
  async recordClockIn(dto: ClockInDto) {
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

    // 2. Verifikasi PIN dengan bcrypt
    const isPinMatch = await bcrypt.compare(dto.pinCode, staff.pinCode);
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

    const thresholdTime = new Date();
    thresholdTime.setHours(openHour, openMinute + lateGraceMinutes, 0, 0);

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
      include: {
        staff: {
          select: { id: true, name: true, role: true, email: true, phone: true, avatarUrl: true },
        },
      },
    });

    this.logger.log(`[Attendance] Clock-In recorded for ${staff.name} (${status}) at ${distanceMeters}m`);
    return attendance;
  }

  /**
   * Presensi Pulang (Clock-Out)
   * 1. Verifikasi PIN 4-digit staf
   * 2. Validasi Geofence
   * 3. Hitung durasi kerja total dalam menit
   * 4. Update status dan clockOutTime
   */
  async recordClockOut(dto: ClockOutDto) {
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

    const isPinMatch = await bcrypt.compare(dto.pinCode, staff.pinCode);
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

    const finalStatus =
      attendance.status === AttendanceStatus.LATE
        ? AttendanceStatus.LATE
        : AttendanceStatus.COMPLETED;

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        clockOutTime: now,
        workDurationMinutes,
        status: finalStatus,
        notes: dto.notes ? `${attendance.notes || ''} | Out: ${dto.notes}`.trim() : attendance.notes,
      },
      include: {
        staff: {
          select: { id: true, name: true, role: true, email: true, phone: true, avatarUrl: true },
        },
      },
    });

    this.logger.log(`[Attendance] Clock-Out recorded for ${staff.name} (${workDurationMinutes} mins)`);
    return updated;
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
        include: {
          staff: {
            select: { id: true, name: true, role: true, email: true, phone: true, avatarUrl: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
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
  async getAttendanceSummary(dateParam?: string) {
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
    const leaveCount = attendances.filter(
      (a) => a.status === AttendanceStatus.SICK || a.status === AttendanceStatus.LEAVE
    ).length;

    const absentCount = Math.max(0, totalActiveStaff - (presentCount + leaveCount));
    const disciplinePercentage =
      totalActiveStaff > 0 ? Math.round((onTimeCount / totalActiveStaff) * 100) : 100;

    return {
      date,
      totalActiveStaff,
      presentCount,
      onTimeCount,
      lateCount,
      leaveCount,
      absentCount,
      disciplinePercentage,
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

    this.logger.log(`[Attendance] Leave request created for ${staff.name} (${dto.leaveType})`);
    return leaveRequest;
  }
}
