import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin Attendance')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Presensi Masuk Staf dengan Validasi PIN & Geofence GPS' })
  @ApiResponse({ status: 200, description: 'Presensi masuk berhasil dicatat' })
  async recordClockIn(@Body() dto: ClockInDto) {
    return this.attendanceService.recordClockIn(dto);
  }

  @Post('clock-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Presensi Pulang Staf dengan Validasi PIN & Geofence GPS' })
  @ApiResponse({ status: 200, description: 'Presensi pulang berhasil dicatat' })
  async recordClockOut(@Body() dto: ClockOutDto) {
    return this.attendanceService.recordClockOut(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Daftar Log Presensi Staf Terpaginasi' })
  @ApiResponse({ status: 200, description: 'Paginated attendance list' })
  async getAttendancePaginated(@Query() query: AttendanceQueryDto) {
    return this.attendanceService.getAttendancePaginated(query);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ringkasan Statistik Kehadiran Harian (KPI Summary)' })
  @ApiResponse({ status: 200, description: 'Daily attendance summary' })
  async getAttendanceSummary(@Query('date') date?: string) {
    return this.attendanceService.getAttendanceSummary(date);
  }

  @Post('leave')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Pengajuan Cuti / Izin / Sakit Resmi Staf' })
  @ApiResponse({ status: 201, description: 'Pengajuan izin berhasil dibuat' })
  async createLeaveRequest(@Body() dto: CreateLeaveRequestDto) {
    return this.attendanceService.createLeaveRequest(dto);
  }
}
