import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { OvertimeReviewDto } from './dto/overtime-review.dto';
import { AttendanceCorrectionDto } from './dto/attendance-correction.dto';
import {
  AttendanceItemResponseSchema,
  AttendancePaginatedResponseSchema,
  AttendanceSummaryResponseSchema,
  LeaveResponseSchema,
} from './dto/attendance-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodResponse } from '../../common/decorators/zod-response.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin Attendance')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // Kiosk tablet: any logged-in staff device records attendance; the staff's own PIN is the check
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('clock-in')
  @Roles(UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  @HttpCode(HttpStatus.OK)
  @ZodResponse(AttendanceItemResponseSchema)
  @ApiOperation({ summary: 'Presensi Masuk Staf dengan Validasi PIN & Geofence GPS' })
  @ApiResponse({ status: 200, description: 'Presensi masuk berhasil dicatat' })
  async recordClockIn(@Body() dto: ClockInDto) {
    return this.attendanceService.recordClockIn(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('clock-out')
  @Roles(UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  @HttpCode(HttpStatus.OK)
  @ZodResponse(AttendanceItemResponseSchema)
  @ApiOperation({ summary: 'Presensi Pulang Staf dengan Validasi PIN & Geofence GPS' })
  @ApiResponse({ status: 200, description: 'Presensi pulang berhasil dicatat' })
  async recordClockOut(@Body() dto: ClockOutDto) {
    return this.attendanceService.recordClockOut(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ZodResponse(AttendancePaginatedResponseSchema)
  @ApiOperation({ summary: 'Daftar Log Presensi Staf Terpaginasi' })
  @ApiResponse({ status: 200, description: 'Paginated attendance list' })
  async getAttendancePaginated(@Query() query: AttendanceQueryDto) {
    return this.attendanceService.getAttendancePaginated(query);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN)
  @ZodResponse(AttendanceSummaryResponseSchema)
  @ApiOperation({ summary: 'Ringkasan Statistik Kehadiran Harian (KPI Summary)' })
  @ApiResponse({ status: 200, description: 'Daily attendance summary' })
  async getAttendanceSummary(@Query('date') date?: string) {
    return this.attendanceService.getAttendanceSummary(date);
  }

  @Post('leave')
  @Roles(UserRole.ADMIN)
  @ZodResponse(LeaveResponseSchema)
  @ApiOperation({ summary: 'Pengajuan Cuti / Izin / Sakit Resmi Staf' })
  @ApiResponse({ status: 201, description: 'Pengajuan izin berhasil dibuat' })
  async createLeaveRequest(@Body() dto: CreateLeaveRequestDto) {
    return this.attendanceService.createLeaveRequest(dto);
  }

  @Patch(':id/overtime')
  @Roles(UserRole.ADMIN)
  @ZodResponse(AttendanceItemResponseSchema)
  @ApiOperation({
    summary: 'Review Lembur Staf (APPROVED / REJECTED / OVERRIDDEN)',
    description:
      'APPROVED menyetujui menit hasil hitung, REJECTED memberi 0 menit, OVERRIDDEN memakai approvedMinutes. Review boleh diulang.',
  })
  @ApiResponse({ status: 200, description: 'Presensi dengan hasil review lembur' })
  @ApiResponse({ status: 400, description: 'Tidak ada lembur untuk APPROVED/REJECTED, atau approvedMinutes tidak valid' })
  @ApiResponse({ status: 404, description: 'Presensi tidak ditemukan' })
  @ApiResponse({ status: 409, description: 'Staf belum presensi pulang' })
  async reviewOvertime(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OvertimeReviewDto,
    @CurrentUser('id') reviewerId: string,
  ) {
    return this.attendanceService.reviewOvertime(id, dto, reviewerId);
  }

  @Patch(':id/correction')
  @Roles(UserRole.ADMIN)
  @ZodResponse(AttendanceItemResponseSchema)
  @ApiOperation({
    summary: 'Koreksi Jam Pulang Presensi Staf',
    description:
      'clockOutTime berformat HH:mm (jam WIB pada tanggal presensi; jika tidak setelah jam masuk dianggap hari berikutnya) atau ISO datetime. Durasi kerja dan lembur dihitung ulang.',
  })
  @ApiResponse({ status: 200, description: 'Presensi setelah koreksi' })
  @ApiResponse({ status: 400, description: 'Jam pulang tidak valid (sebelum jam masuk, di masa depan, atau lebih dari 24 jam)' })
  @ApiResponse({ status: 404, description: 'Presensi tidak ditemukan' })
  async correctAttendance(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AttendanceCorrectionDto,
    @CurrentUser('id') correctorId: string,
  ) {
    return this.attendanceService.correctClockOut(id, dto, correctorId);
  }
}
