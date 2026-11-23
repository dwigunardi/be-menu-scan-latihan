import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { HandshakeDto } from './dto/handshake.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { OnboardStaffDto } from './dto/onboard.dto';
import { VerifyPinDto, VerifyPinResponseSchema } from './dto/verify-pin.dto';
import { HandoverCandidatesResponseSchema, HandoverDto } from './dto/handover.dto';
import { ZodResponse } from '../../common/decorators/zod-response.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipEncryption } from '../../common/decorators/skip-encryption.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowDuringOnboarding } from '../../common/decorators/allow-during-onboarding.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @SkipEncryption()
  @Post('handshake')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'ECDH Key Exchange Handshake',
    description:
      'Exchanges ECDH public keys to establish a shared AES-256-GCM symmetric encryption session key.',
  })
  @ApiResponse({ status: 200, description: 'Handshake successful' })
  async handshake(@Body() dto: HandshakeDto) {
    return this.authService.handshake(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin / Staff User Login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh Access and Refresh Tokens' })
  @ApiResponse({ status: 200, description: 'Tokens renewed' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked refresh token' })
  async refresh(@Body() _dto: RefreshTokenDto, @Req() req: any) {
    return this.authService.refreshTokens(req.user.id, req.user.refreshToken);
  }

  @AllowDuringOnboarding()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('onboard')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Complete mandatory first-login staff onboarding',
    description:
      'Replaces temporary password with a secure personal password, sets hashed 4-digit clock-in PIN, and flips needsOnboarding to false in an atomic transaction.',
  })
  @ApiResponse({ status: 200, description: 'Onboarding completed successfully' })
  @ApiResponse({ status: 400, description: 'Weak password, trivial PIN, or already onboarded' })
  @ApiResponse({ status: 401, description: 'Current temporary password invalid' })
  async onboard(
    @CurrentUser('id') userId: string,
    @Body() dto: OnboardStaffDto,
  ) {
    return this.authService.onboard(userId, dto);
  }

  @Get('handover/candidates')
  @ZodResponse(HandoverCandidatesResponseSchema)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Staff who can take over this device in a shift handover',
    description:
      'Active, onboarded staff with a PIN, excluding ADMIN and the current user. Open to every logged-in staff role.',
  })
  @ApiResponse({ status: 200, description: '[{ id, employeeId, name, role, avatarUrl }]' })
  async getHandoverCandidates(@CurrentUser('id') userId: string) {
    return this.authService.getHandoverCandidates(userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('handover')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Shift handover: verify the incoming staff PIN and switch the session to them',
    description:
      'Revokes the current session and returns a new session for the incoming staff (same shape as login). ' +
      'The outgoing staff must close their cash drawer shift first.',
  })
  @ApiResponse({ status: 200, description: '{ accessToken, refreshToken, user } of the incoming staff' })
  @ApiResponse({ status: 400, description: 'Wrong PIN, same staff, or incoming staff without PIN / onboarding' })
  @ApiResponse({ status: 404, description: 'Incoming staff not found, inactive, or ADMIN' })
  @ApiResponse({ status: 409, description: 'Outgoing staff still has an open cash drawer shift (code SHIFT_STILL_OPEN)' })
  @ApiResponse({ status: 429, description: 'PIN locked (shared lockout) or rate limited' })
  async handover(
    @CurrentUser('id') userId: string,
    @Body() dto: HandoverDto,
  ) {
    return this.authService.handover(userId, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('verify-pin')
  @HttpCode(HttpStatus.OK)
  @ZodResponse(VerifyPinResponseSchema)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Verify the logged-in staff PIN (kiosk exit)',
    description:
      'Checks the PIN of the user in the JWT (not one from the body). Wrong PIN returns 200 { valid: false }. ' +
      'Locks PIN verification for 5 minutes after 5 consecutive failures.',
  })
  @ApiResponse({ status: 200, description: '{ valid: true } or { valid: false }' })
  @ApiResponse({ status: 400, description: 'PIN is not 4 digits' })
  @ApiResponse({ status: 429, description: 'Too many failed attempts (locked) or rate limited' })
  async verifyPin(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyPinDto,
  ) {
    return this.authService.verifyPin(userId, dto);
  }

  @AllowDuringOnboarding()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @AllowDuringOnboarding()
  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current logged-in user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }
}
