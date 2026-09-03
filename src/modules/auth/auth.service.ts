import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EcdhService } from '../../common/crypto/ecdh.service';
import { HandshakeDto } from './dto/handshake.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardStaffDto } from './dto/onboard.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly ecdhService: EcdhService,
  ) {}

  /**
   * Perform ECDH Handshake to establish encrypted session
   */
  async handshake(dto: HandshakeDto) {
    const appSecret =
      this.configService.get<string>('app.APP_SECRET') ||
      this.configService.get<string>('APP_SECRET') ||
      'default_app_secret_16';
    const ttl =
      this.configService.get<number>('app.HANDSHAKE_SESSION_TTL') ||
      this.configService.get<number>('HANDSHAKE_SESSION_TTL') ||
      7200;

    const result = this.ecdhService.performHandshake(
      dto.clientPublicKey,
      dto.nonce,
      appSecret,
      ttl,
    );

    return {
      serverPublicKey: result.serverPublicKeyHex,
      handshakeToken: result.handshakeToken,
      expiresIn: result.expiresIn,
    };
  }

  /**
   * Staff/Admin Login with email and password
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Akun Anda telah dinonaktifkan. Hubungi admin.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.name,
      user.role,
      user.needsOnboarding,
    );

    // Hash refresh token before saving in DB for revocation tracking
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash },
    });

    this.logger.log({
      step: 'AUTH_LOGIN',
      userId: user.id,
      email: user.email,
      role: user.role,
      needsOnboarding: user.needsOnboarding,
      msg: `User ${user.email} (${user.role}) logged in successfully`,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        employeeId: user.employeeId,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        needsOnboarding: user.needsOnboarding,
      },
    };
  }

  /**
   * Complete mandatory first-login staff onboarding (change password & set 4-digit PIN)
   */
  async onboard(userId: string, dto: OnboardStaffDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Akun Anda telah dinonaktifkan. Hubungi admin.');
    }

    if (!user.needsOnboarding) {
      throw new BadRequestException('Akun ini sudah menyelesaikan proses onboarding sebelumnya.');
    }

    const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Password sementara saat ini tidak sesuai.');
    }

    const hashedNewPassword = await bcrypt.hash(dto.newPassword, 10);
    const hashedPin = await bcrypt.hash(dto.pinCode, 10);

    // Atomic update: new password, hashed pin, needsOnboarding = false
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedNewPassword,
        pinCode: hashedPin,
        needsOnboarding: false,
        refreshToken: null, // Revoke old session tokens
      },
    });

    // Generate fresh tokens with needsOnboarding: false
    const tokens = await this.generateTokens(
      updatedUser.id,
      updatedUser.email,
      updatedUser.name,
      updatedUser.role,
      false,
    );

    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: updatedUser.id },
      data: { refreshToken: refreshTokenHash },
    });

    this.logger.log({
      step: 'AUTH_ONBOARD_SUCCESS',
      userId: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      msg: `Staff ${updatedUser.email} successfully completed first-login onboarding`,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: updatedUser.id,
        employeeId: updatedUser.employeeId,
        email: updatedUser.email,
        name: updatedUser.name,
        phone: updatedUser.phone,
        role: updatedUser.role,
        needsOnboarding: false,
      },
    };
  }

  /**
   * Refresh Access & Refresh Tokens
   */
  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied. No active session.');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.name,
      user.role,
      user.needsOnboarding,
    );

    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash },
    });

    this.logger.log({
      step: 'AUTH_REFRESH',
      userId: user.id,
      role: user.role,
      msg: `Tokens refreshed for user ${user.email}`,
    });

    return tokens;
  }

  /**
   * Logout user by clearing refreshToken in database
   */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    this.logger.log({
      step: 'AUTH_LOGOUT',
      userId,
      msg: `User ${userId} logged out successfully`,
    });

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * Get authenticated user profile
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        employeeId: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        pinCode: true,
        needsOnboarding: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      employeeId: user.employeeId,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      pinCodeSet: Boolean(user.pinCode),
      needsOnboarding: user.needsOnboarding,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Helper: Generate Access and Refresh JWT Tokens
   */
  private async generateTokens(
    userId: string,
    email: string,
    name: string,
    role: UserRole,
    needsOnboarding = false,
  ) {
    const payload = { sub: userId, email, name, role, needsOnboarding };

    const accessSecret =
      this.configService.get<string>('app.JWT_ACCESS_SECRET') ||
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      'default_jwt_access_secret_16';
    const accessExpiresIn =
      this.configService.get<string>('app.JWT_ACCESS_EXPIRES_IN') ||
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ||
      '15m';

    const refreshSecret =
      this.configService.get<string>('app.JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'default_jwt_refresh_secret_16';
    const refreshExpiresIn =
      this.configService.get<string>('app.JWT_REFRESH_EXPIRES_IN') ||
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ||
      '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as any,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
