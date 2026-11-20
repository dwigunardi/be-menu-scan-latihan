import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodResponse } from '../../common/decorators/zod-response.decorator';
import { ShiftsService } from './shifts.service';
import type { ShiftActor } from './shifts.service';
import {
  OpenShiftDto,
  CloseShiftDto,
  QueryShiftHistoryDto,
  ShiftItemResponseSchema,
  ShiftHistoryResponseSchema,
} from './dto/shift.dto';

@ApiTags('Admin Cashier Shifts')
@ApiBearerAuth('JWT-auth')
@Roles(UserRole.ADMIN, UserRole.CASHIER)
@Controller('admin/shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('current')
  @ZodResponse(ShiftItemResponseSchema)
  @ApiOperation({
    summary: 'Shift kasir yang sedang aktif (null jika laci kas tertutup)',
  })
  @ApiResponse({
    status: 200,
    description: 'Active shift with live totals, or null',
  })
  async getCurrentShift() {
    return this.shiftsService.getCurrentShift();
  }

  @Post('open')
  @HttpCode(HttpStatus.CREATED)
  @ZodResponse(ShiftItemResponseSchema)
  @ApiOperation({ summary: 'Buka shift kasir dengan kas modal awal' })
  @ApiResponse({ status: 201, description: 'Shift opened' })
  @ApiResponse({ status: 409, description: 'Another shift is still open' })
  async openShift(@Body() dto: OpenShiftDto, @CurrentUser() user: ShiftActor) {
    return this.shiftsService.openShift(dto, user);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ZodResponse(ShiftItemResponseSchema)
  @ApiOperation({
    summary: 'Tutup shift kasir, rekonsiliasi kas fisik & buat Z-Report',
  })
  @ApiResponse({
    status: 200,
    description: 'Shift closed with Z-Report snapshot',
  })
  @ApiResponse({
    status: 403,
    description: 'Only the opening cashier or an admin may close',
  })
  @ApiResponse({ status: 404, description: 'Shift not found' })
  @ApiResponse({ status: 409, description: 'Shift already closed' })
  async closeShift(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser() user: ShiftActor,
  ) {
    return this.shiftsService.closeShift(id, dto, user);
  }

  @Get()
  @ZodResponse(ShiftHistoryResponseSchema)
  @ApiOperation({
    summary: 'Riwayat shift kasir terpaginasi (filter tanggal buka & status)',
  })
  @ApiResponse({ status: 200, description: 'Paginated shift history' })
  async getShiftHistory(@Query() query: QueryShiftHistoryDto) {
    return this.shiftsService.getShiftHistory(query);
  }
}
