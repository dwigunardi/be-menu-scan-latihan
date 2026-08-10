import {
  Injectable,
  UnauthorizedException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EcdhService } from '../../common/crypto/ecdh.service';
import { HandshakeDto } from './dto/handshake.dto';
import { LoginDto } from './dto/login.dto';

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
   * Admin Login with email and password
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.name);

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
      msg: `Admin user ${user.email} logged in successfully`,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
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

    const tokens = await this.generateTokens(user.id, user.email, user.name);

    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash },
    });

    this.logger.log({
      step: 'AUTH_REFRESH',
      userId: user.id,
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
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Helper: Generate Access and Refresh JWT Tokens
   */
  private async generateTokens(userId: string, email: string, name: string) {
    const payload = { sub: userId, email, name };

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
