import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EcdhService } from '../../common/crypto/ecdh.service';
import { PinVerificationService } from '../../common/security/pin-verification.service';
import { hashRefreshToken, refreshTokenMatches } from './refresh-token-hash';
import { SessionSupersededException } from './session-superseded.exception';
import { HandshakeDto } from './dto/handshake.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardStaffDto } from './dto/onboard.dto';
import { VerifyPinDto, VerifyPinResponse } from './dto/verify-pin.dto';
import { HandoverCandidate, HandoverDto } from './dto/handover.dto';

/** Error code for a handover attempted while the outgoing staff still has an open cash drawer shift. */
export const SHIFT_STILL_OPEN = 'SHIFT_STILL_OPEN';

export {
  PIN_MAX_ATTEMPTS,
  PIN_LOCK_MINUTES,
} from '../../common/security/pin-verification.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly ecdhService: EcdhService,
    private readonly pinVerification: PinVerificationService,
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
    const refreshTokenHash = hashRefreshToken(tokens.refreshToken);
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

    const refreshTokenHash = hashRefreshToken(tokens.refreshToken);
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
   * Refresh Access & Refresh Tokens from the refresh token in the HttpOnly cookie.
   * Verifies the JWT, matches it against the stored hash, then rotates it.
   */
  async refreshTokens(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: { sub?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.refreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    // Deactivated or deleted staff lose their session immediately, like at login
    if (!user || !user.refreshToken || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Access denied. No active session.');
    }

    if (!refreshTokenMatches(refreshToken, user.refreshToken)) {
      // Rotated by a parallel refresh or replaced by a newer login: 401, but keep the browser's cookie
      throw new SessionSupersededException('Invalid or revoked refresh token');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.name,
      user.role,
      user.needsOnboarding,
    );

    const refreshTokenHash = hashRefreshToken(tokens.refreshToken);
    // Conditional rotation: only replace the exact hash we verified. If a logout, shift handover or another
    // refresh changed it meanwhile (two bcrypt calls make that window ~100ms+), a plain update would
    // resurrect a revoked session or overwrite a newer one.
    const rotated = await this.prisma.user.updateMany({
      where: { id: user.id, refreshToken: user.refreshToken },
      data: { refreshToken: refreshTokenHash },
    });
    if (rotated.count === 0) {
      this.logger.warn({
        step: 'AUTH_REFRESH_SUPERSEDED',
        userId: user.id,
        msg: 'Refresh token was revoked or rotated during refresh; no tokens issued',
      });
      throw new SessionSupersededException(
        'Session was revoked or refreshed elsewhere',
      );
    }

    this.logger.log({
      step: 'AUTH_REFRESH',
      userId: user.id,
      role: user.role,
      msg: `Tokens refreshed for user ${user.email}`,
    });

    return tokens;
  }

  /**
   * Logout: revokes exactly the session whose refresh token is presented (the HttpOnly cookie), and nothing
   * else. With one session per user, revoking by user id would let a stale or late request (an old device,
   * a delayed logout after the user logged in again, a rotated-out or leaked token) kill the user's
   * current session. The controller always clears the cookie.
   */
  async logout(refreshToken: string | undefined) {
    let revokedUserId: string | null = null;

    if (refreshToken) {
      let sub: string | undefined;
      try {
        // Expiry is ignored: an expired token whose hash is still stored is still that exact session
        ({ sub } = await this.jwtService.verifyAsync<{ sub?: string }>(
          refreshToken,
          { secret: this.refreshSecret(), ignoreExpiration: true },
        ));
      } catch {
        sub = undefined; // unverifiable: nothing to revoke
      }

      if (sub) {
        const result = await this.prisma.user.updateMany({
          where: { id: sub, refreshToken: hashRefreshToken(refreshToken) },
          data: { refreshToken: null },
        });
        if (result.count > 0) revokedUserId = sub;
      }
    }

    this.logger.log({
      step: 'AUTH_LOGOUT',
      userId: revokedUserId,
      msg: revokedUserId
        ? `Session revoked for user ${revokedUserId}`
        : 'Logout without a current session cookie; cookie cleared only',
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
   * Verifies the logged-in user's own PIN (kiosk exit). A wrong PIN is `{ valid: false }`, never 401,
   * because 401 means an expired session to the FE. Lockout (429) is shared with clock-in/out, see
   * PinVerificationService.
   */
  async verifyPin(userId: string, dto: VerifyPinDto): Promise<VerifyPinResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        pinCode: true,
        isActive: true,
        pinFailedAttempts: true,
        pinLockedUntil: true,
      },
    });

    if (!user || !user.isActive || !user.pinCode) {
      return { valid: false };
    }

    const valid = await this.pinVerification.verify(
      { ...user, pinCode: user.pinCode },
      dto.pinCode,
      'KIOSK_EXIT',
    );
    return { valid };
  }

  /**
   * Staff who can take over this device in a shift handover: active, onboarded, PIN set, not ADMIN
   * (a 4-digit PIN must never open an admin session), excluding the current user.
   */
  async getHandoverCandidates(currentUserId: string): Promise<HandoverCandidate[]> {
    const staff = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        isActive: true,
        deletedAt: null,
        needsOnboarding: false,
        pinCode: { not: null },
        role: { not: UserRole.ADMIN },
      },
      select: { id: true, employeeId: true, name: true, role: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    });

    return staff.map((s) => ({
      ...s,
      role: s.role as HandoverCandidate['role'],
    }));
  }

  /**
   * Shift handover on a shared device: verifies the incoming staff's own PIN, revokes the outgoing
   * session, and issues a session for the incoming staff (same response shape as login).
   *
   * - The outgoing staff must close their cash drawer shift first (409 SHIFT_STILL_OPEN), so cash is
   *   reconciled per person.
   * - Wrong PIN is 400 (never 401, which means an expired session to the FE); the lockout (429) is
   *   shared with verify-pin and clock-in/out.
   */
  async handover(outgoingUserId: string, dto: HandoverDto) {
    if (dto.incomingStaffId === outgoingUserId) {
      throw new BadRequestException('Staf pengganti harus berbeda dari staf yang sedang bertugas.');
    }

    const openShift = await this.prisma.cashierShift.findFirst({
      where: { staffId: outgoingUserId, status: 'OPEN' },
      select: { id: true },
    });
    if (openShift) {
      throw new ConflictException({
        error: 'Conflict',
        code: SHIFT_STILL_OPEN,
        message:
          'Tutup shift kasir Anda terlebih dahulu (Z-Report) sebelum serah terima, agar kas laci tercatat per kasir.',
      });
    }

    const incoming = await this.prisma.user.findUnique({
      where: { id: dto.incomingStaffId },
    });

    if (
      !incoming ||
      !incoming.isActive ||
      incoming.deletedAt ||
      incoming.role === UserRole.ADMIN
    ) {
      throw new NotFoundException('Staf pengganti tidak ditemukan atau tidak dapat menerima serah terima.');
    }
    if (incoming.needsOnboarding || !incoming.pinCode) {
      throw new BadRequestException(
        'Staf pengganti belum menyelesaikan onboarding atau belum memiliki PIN.',
      );
    }

    const isPinValid = await this.pinVerification.verify(
      { ...incoming, pinCode: incoming.pinCode },
      dto.pinCode,
      'HANDOVER',
    );
    if (!isPinValid) {
      throw new BadRequestException('PIN staf pengganti salah.');
    }

    const tokens = await this.generateTokens(
      incoming.id,
      incoming.email,
      incoming.name,
      incoming.role,
      incoming.needsOnboarding,
    );
    const refreshTokenHash = hashRefreshToken(tokens.refreshToken);

    // Revoke the outgoing session and start the incoming one together
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: outgoingUserId },
        data: { refreshToken: null },
      }),
      this.prisma.user.update({
        where: { id: incoming.id },
        data: { refreshToken: refreshTokenHash },
      }),
    ]);

    this.logger.log({
      step: 'AUTH_HANDOVER',
      fromUserId: outgoingUserId,
      toUserId: incoming.id,
      toRole: incoming.role,
      notes: dto.notes,
      msg: `Shift handover to ${incoming.email} (${incoming.role})`,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: incoming.id,
        employeeId: incoming.employeeId,
        email: incoming.email,
        name: incoming.name,
        phone: incoming.phone,
        role: incoming.role,
        needsOnboarding: incoming.needsOnboarding,
      },
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

    const accessSecret = this.accessSecret();
    const accessExpiresIn =
      this.configService.get<string>('app.JWT_ACCESS_EXPIRES_IN') ||
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ||
      '15m';

    const refreshSecret = this.refreshSecret();
    const refreshExpiresIn =
      this.configService.get<string>('app.JWT_REFRESH_EXPIRES_IN') ||
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ||
      '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as any,
      }),
      // jti makes every refresh token unique, even when issued in the same second as the previous one
      this.jwtService.signAsync(
        { ...payload, jti: randomUUID() },
        {
          secret: refreshSecret,
          expiresIn: refreshExpiresIn as any,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private accessSecret(): string {
    return (
      this.configService.get<string>('app.JWT_ACCESS_SECRET') ||
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      'default_jwt_access_secret_16'
    );
  }

  private refreshSecret(): string {
    return (
      this.configService.get<string>('app.JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'default_jwt_refresh_secret_16'
    );
  }
}
