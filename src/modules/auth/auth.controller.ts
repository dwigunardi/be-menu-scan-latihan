import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RefreshCookieService } from './refresh-cookie.service';
import { CookieCsrfGuard } from '../../common/guards/cookie-csrf.guard';
import { JsonBodyGuard } from '../../common/guards/json-body.guard';
import { SessionSupersededException } from './session-superseded.exception';
import { HandshakeDto } from './dto/handshake.dto';
import { LoginDto } from './dto/login.dto';
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
  constructor(
    private readonly authService: AuthService,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  /** Moves the refresh token from the response body into the HttpOnly cookie. */
  private respondWithSession<T extends { refreshToken: string }>(
    res: Response,
    session: T,
  ): Omit<T, 'refreshToken'> {
    const { refreshToken, ...body } = session;
    this.refreshCookie.set(res, refreshToken);
    return body;
  }

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
  @UseGuards(JsonBodyGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin / Staff User Login',
    description: 'Returns { accessToken, user }; the refresh token is set as the HttpOnly cookie menuscan_rt.',
  })
  @ApiResponse({ status: 200, description: 'Login successful (Set-Cookie: menuscan_rt)' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondWithSession(res, await this.authService.login(dto));
  }

  @Public()
  @UseGuards(CookieCsrfGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh the access token using the HttpOnly refresh cookie',
    description:
      'Reads menuscan_rt (no body needed), rotates it, and returns { accessToken }. Requires an allowed Origin ' +
      'and Content-Type: application/json (CSRF). A rejected refresh clears the cookie.',
  })
  @ApiResponse({ status: 200, description: '{ accessToken } (Set-Cookie: rotated menuscan_rt)' })
  @ApiResponse({ status: 401, description: 'Missing, invalid, expired or revoked refresh cookie' })
  @ApiResponse({ status: 403, description: 'Origin not allowed or Content-Type is not application/json' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const session = await this.authService.refreshTokens(
        this.refreshCookie.read(req),
      );
      return this.respondWithSession(res, session);
    } catch (error) {
      // A dead session must not keep a cookie around. Keep it when the request merely lost a race to a
      // parallel refresh (the winner's Set-Cookie may already hold the new token) or on transient errors.
      if (
        error instanceof UnauthorizedException &&
        !(error instanceof SessionSupersededException)
      ) {
        this.refreshCookie.clear(res);
      }
      throw error;
    }
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
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondWithSession(
      res,
      await this.authService.onboard(userId, dto),
    );
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
  @ApiResponse({ status: 200, description: '{ accessToken, user } of the incoming staff (Set-Cookie: their menuscan_rt)' })
  @ApiResponse({ status: 400, description: 'Wrong PIN, same staff, or incoming staff without PIN / onboarding' })
  @ApiResponse({ status: 404, description: 'Incoming staff not found, inactive, or ADMIN' })
  @ApiResponse({ status: 409, description: 'Outgoing staff still has an open cash drawer shift (code SHIFT_STILL_OPEN)' })
  @ApiResponse({ status: 429, description: 'PIN locked (shared lockout) or rate limited' })
  async handover(
    @CurrentUser('id') userId: string,
    @Body() dto: HandoverDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondWithSession(
      res,
      await this.authService.handover(userId, dto),
    );
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

  @Public()
  @UseGuards(CookieCsrfGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout: revoke this session and clear the refresh cookie',
    description:
      'Revokes exactly the session whose refresh cookie is sent (only if it is still the current one), and always ' +
      'clears menuscan_rt. No access token needed. Requires an allowed Origin and Content-Type: application/json.',
  })
  @ApiResponse({ status: 200, description: 'Logged out (cookie cleared)' })
  @ApiResponse({ status: 403, description: 'Origin not allowed or Content-Type is not application/json' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.refreshCookie.read(req);
    this.refreshCookie.clear(res);
    return this.authService.logout(refreshToken);
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
