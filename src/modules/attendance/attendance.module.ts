import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { PinVerificationService } from '../../common/security/pin-verification.service';

@Module({
  imports: [PrismaModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, PinVerificationService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
