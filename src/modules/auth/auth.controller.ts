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
