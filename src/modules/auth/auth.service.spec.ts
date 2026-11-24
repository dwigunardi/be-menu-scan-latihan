import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, PIN_MAX_ATTEMPTS } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EcdhService } from '../../common/crypto/ecdh.service';
import { PinVerificationService } from '../../common/security/pin-verification.service';
import { hashRefreshToken } from './refresh-token-hash';
import { SessionSupersededException } from './session-superseded.exception';
import {
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: any;
  let jwtService: any;
  let configService: any;
  let ecdhService: any;

  const mockUser = {
    id: 'user-123',
    employeeId: 'KC-001',
    email: 'admin@menuscan.com',
    password: '',
    name: 'Admin MenuScan',
    phone: '+6281234567890',
    role: 'ADMIN',
    pinCode: null,
    needsOnboarding: true,
    isActive: true,
    refreshToken: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    mockUser.password = await bcrypt.hash('password123', 10);
  });

  beforeEach(async () => {
    prismaService = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key.includes('SECRET')) return 'supersecretkey123456';
        if (key.includes('EXPIRES')) return '15m';
        if (key.includes('TTL')) return 7200;
        return null;
      }),
    };

    ecdhService = {
      performHandshake: jest.fn().mockReturnValue({
        serverPublicKeyHex: 'server-pub-hex',
        handshakeToken: 'handshake-token-uuid',
        expiresIn: 7200,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: EcdhService, useValue: ecdhService },
        PinVerificationService,
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handshake', () => {
    it('should call ecdhService.performHandshake and return handshake metadata', async () => {
      const result = await service.handshake({
        clientPublicKey: '04'.padEnd(130, 'a'),
        nonce: 'random_nonce_123456',
      });

      expect(result).toEqual({
        serverPublicKey: 'server-pub-hex',
        handshakeToken: 'handshake-token-uuid',
        expiresIn: 7200,
      });
      expect(ecdhService.performHandshake).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should authenticate user with valid credentials', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'admin@menuscan.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('admin@menuscan.com');
      expect(prismaService.user.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.login({
          email: 'admin@menuscan.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nonexistent@menuscan.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    beforeEach(() => {
      jwtService.verifyAsync = jest.fn().mockResolvedValue({ sub: 'user-123' });
    });

    it('verifies the cookie token, then rotates only the exact hash that was verified', async () => {
      const hashedRefreshToken = hashRefreshToken('valid-refresh-token');
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshToken: hashedRefreshToken,
      });
      prismaService.user.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const result = await service.refreshTokens('valid-refresh-token');

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-refresh-token', {
        secret: 'supersecretkey123456',
      });
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      const args = prismaService.user.updateMany.mock.calls[0][0];
      expect(args.where).toEqual({
        id: 'user-123',
        refreshToken: hashedRefreshToken,
      });
      expect(args.data.refreshToken).toEqual(expect.any(String));
      expect(args.data.refreshToken).not.toBe(hashedRefreshToken);
    });

    it('rejects a missing cookie with 401 without touching the database', async () => {
      await expect(service.refreshTokens(undefined)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired JWT with 401', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.refreshTokens('expired-rt')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('issues no tokens (401) when the session was revoked or rotated during the refresh', async () => {
      // e.g. a shift handover or logout cleared the hash between the read and the write
      const hashedRefreshToken = hashRefreshToken('valid-refresh-token');
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshToken: hashedRefreshToken,
      });
      prismaService.user.updateMany = jest.fn().mockResolvedValue({ count: 0 });

      await expect(
        service.refreshTokens('valid-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an older token of the same user even though both share a long common prefix', async () => {
      // Regression: bcrypt only compared the first 72 bytes, which are identical for every token of a user
      const prefix = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'x'.repeat(80);
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshToken: hashRefreshToken(prefix + 'CURRENT'),
      });

      await expect(service.refreshTokens(prefix + 'ROTATED-OUT')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a session whose stored hash is a legacy bcrypt hash (must log in again)', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshToken: await bcrypt.hash('valid-refresh-token', 10),
      });

      await expect(service.refreshTokens('valid-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues refresh tokens with a unique jti so two issued in the same second differ', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshToken: hashRefreshToken('valid-refresh-token'),
      });
      prismaService.user.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      await service.refreshTokens('valid-refresh-token');

      const refreshSignCall = jwtService.signAsync.mock.calls.find(
        (c: any[]) => c[0].jti,
      );
      expect(refreshSignCall[0].jti).toMatch(/^[0-9a-f-]{36}$/);
      // The access token carries no jti
      expect(jwtService.signAsync.mock.calls.filter((c: any[]) => c[0].jti)).toHaveLength(1);
    });

    it.each([
      ['deactivated', { isActive: false }],
      ['deleted', { deletedAt: new Date() }],
    ])('rejects refresh for %s staff (cookie must be cleared: plain 401)', async (_label, overrides) => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        ...overrides,
        refreshToken: hashRefreshToken('valid-refresh-token'),
      });

      const error = await service.refreshTokens('valid-refresh-token').catch((e) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error).not.toBeInstanceOf(SessionSupersededException);
    });

    it('marks a lost race (conditional update matched nothing) as superseded, not dead', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshToken: hashRefreshToken('valid-refresh-token'),
      });
      prismaService.user.updateMany = jest.fn().mockResolvedValue({ count: 0 });

      await expect(service.refreshTokens('valid-refresh-token')).rejects.toBeInstanceOf(
        SessionSupersededException,
      );
    });

    it('rejects (401) a validly signed token whose hash no longer matches (revoked or rotated)', async () => {
      const hashedRefreshToken = hashRefreshToken('different-token');
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshToken: hashedRefreshToken,
      });

      // Superseded: still a 401, but the controller keeps the cookie (a parallel refresh may have rotated it)
      await expect(service.refreshTokens('invalid-token')).rejects.toBeInstanceOf(
        SessionSupersededException,
      );
    });
  });

  describe('logout', () => {
    beforeEach(() => {
      prismaService.user.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    });

    it('revokes exactly the session of the presented cookie (hash must match), ignoring expiry', async () => {
      jwtService.verifyAsync = jest.fn().mockResolvedValue({ sub: 'user-123' });

      const result = await service.logout('rt-current');

      expect(result.success).toBe(true);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('rt-current', {
        secret: 'supersecretkey123456',
        ignoreExpiration: true,
      });
      expect(prismaService.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-123', refreshToken: hashRefreshToken('rt-current') },
        data: { refreshToken: null },
      });
    });

    it("does not touch the user's current session when the cookie is stale (late logout, old device)", async () => {
      jwtService.verifyAsync = jest.fn().mockResolvedValue({ sub: 'user-123' });
      // The stored hash belongs to a newer session, so the conditional update matches nothing
      prismaService.user.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.logout('rt-from-previous-session');

      expect(result.success).toBe(true);
      expect(prismaService.user.updateMany.mock.calls[0][0].where).toEqual({
        id: 'user-123',
        refreshToken: hashRefreshToken('rt-from-previous-session'),
      });
    });

    it('revokes nothing for an unverifiable token', async () => {
      jwtService.verifyAsync = jest.fn().mockRejectedValue(new Error('invalid signature'));

      await expect(service.logout('forged')).resolves.toMatchObject({ success: true });
      expect(prismaService.user.updateMany).not.toHaveBeenCalled();
    });

    it('succeeds without a cookie and revokes nothing', async () => {
      jwtService.verifyAsync = jest.fn();

      await expect(service.logout(undefined)).resolves.toMatchObject({ success: true });
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      expect(prismaService.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('getMe', () => {
    it('should return user profile without password', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'admin@menuscan.com',
        name: 'Admin MenuScan',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getMe('user-123');
      expect(result.id).toBe('user-123');
      expect(result.email).toBe('admin@menuscan.com');
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('onboard', () => {
    it('should successfully complete onboarding, update password and pin, and flip needsOnboarding to false', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.user.update.mockResolvedValue({
        ...mockUser,
        needsOnboarding: false,
      });

      const result = await service.onboard('user-123', {
        currentPassword: 'password123',
        newPassword: 'SecurePassword123!',
        pinCode: '7890',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.needsOnboarding).toBe(false);
      expect(prismaService.user.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException if user already completed onboarding', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        needsOnboarding: false,
      });

      await expect(
        service.onboard('user-123', {
          currentPassword: 'password123',
          newPassword: 'SecurePassword123!',
          pinCode: '7890',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if current temporary password is incorrect', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.onboard('user-123', {
          currentPassword: 'wrong-temporary-pwd',
          newPassword: 'SecurePassword123!',
          pinCode: '7890',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.onboard('nonexistent-user', {
          currentPassword: 'password123',
          newPassword: 'SecurePassword123!',
          pinCode: '7890',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyPin', () => {
    let pinHash: string;
    const pinUser = (overrides: Record<string, unknown> = {}) => ({
      id: 'user-123',
      pinCode: pinHash,
      isActive: true,
      pinFailedAttempts: 0,
      pinLockedUntil: null as Date | null,
      ...overrides,
    });

    beforeAll(async () => {
      pinHash = await bcrypt.hash('2580', 10);
    });

    it('returns valid true for the correct PIN of the JWT user', async () => {
      prismaService.user.findUnique.mockResolvedValue(pinUser());

      await expect(
        service.verifyPin('user-123', { pinCode: '2580' }),
      ).resolves.toEqual({ valid: true });
      expect(prismaService.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-123' } }),
      );
      // Nothing to reset when there were no failures
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });

    it('resets the failure counter after a correct PIN', async () => {
      prismaService.user.findUnique.mockResolvedValue(
        pinUser({ pinFailedAttempts: 3 }),
      );

      await service.verifyPin('user-123', { pinCode: '2580' });

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { pinFailedAttempts: 0, pinLockedUntil: null },
      });
    });

    it('returns valid false (never 401) and counts a wrong PIN atomically', async () => {
      prismaService.user.findUnique.mockResolvedValue(pinUser());
      prismaService.user.update.mockResolvedValue({ pinFailedAttempts: 1 });

      await expect(
        service.verifyPin('user-123', { pinCode: '1111' }),
      ).resolves.toEqual({ valid: false });
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { pinFailedAttempts: { increment: 1 } },
        select: { pinFailedAttempts: true },
      });
    });

    it(`locks for 5 minutes with 429 on the ${PIN_MAX_ATTEMPTS}th consecutive failure`, async () => {
      prismaService.user.findUnique.mockResolvedValue(
        pinUser({ pinFailedAttempts: PIN_MAX_ATTEMPTS - 1 }),
      );
      prismaService.user.update
        .mockResolvedValueOnce({ pinFailedAttempts: PIN_MAX_ATTEMPTS })
        .mockResolvedValueOnce({});
      const before = Date.now();

      const error = await service
        .verifyPin('user-123', { pinCode: '1111' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const lockArgs = prismaService.user.update.mock.calls[1][0];
      expect(lockArgs.data.pinFailedAttempts).toBe(0);
      const lockMs = lockArgs.data.pinLockedUntil.getTime() - before;
      expect(lockMs).toBeGreaterThanOrEqual(5 * 60_000 - 1000);
      expect(lockMs).toBeLessThanOrEqual(5 * 60_000 + 1000);
    });

    it('refuses with 429 while locked, without checking the PIN (even a correct one)', async () => {
      prismaService.user.findUnique.mockResolvedValue(
        pinUser({ pinLockedUntil: new Date(Date.now() + 3 * 60_000) }),
      );
      const error = await service
        .verifyPin('user-123', { pinCode: '2580' })
        .catch((e) => e);

      // A correct PIN is still refused: the PIN is not evaluated while locked
      expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(error.message).toContain('3 menit');
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });

    it('verifies again once the lock has expired', async () => {
      prismaService.user.findUnique.mockResolvedValue(
        pinUser({ pinLockedUntil: new Date(Date.now() - 1000) }),
      );

      await expect(
        service.verifyPin('user-123', { pinCode: '2580' }),
      ).resolves.toEqual({ valid: true });
      // Clears the stale lock
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { pinFailedAttempts: 0, pinLockedUntil: null },
      });
    });

    it.each([
      ['has no PIN yet', { pinCode: null }],
      ['is inactive', { isActive: false }],
    ])('returns valid false when the user %s', async (_label, overrides) => {
      prismaService.user.findUnique.mockResolvedValue(pinUser(overrides));

      await expect(
        service.verifyPin('user-123', { pinCode: '2580' }),
      ).resolves.toEqual({ valid: false });
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('handover', () => {
    let incomingPinHash: string;
    const incoming = (overrides: Record<string, unknown> = {}) => ({
      id: '22222222-2222-4222-8222-222222222222',
      employeeId: 'KC-007',
      email: 'sari@menuscan.com',
      name: 'Sari Kasir',
      phone: null,
      role: 'CASHIER',
      pinCode: incomingPinHash,
      isActive: true,
      deletedAt: null,
      needsOnboarding: false,
      pinFailedAttempts: 0,
      pinLockedUntil: null as Date | null,
      ...overrides,
    });
    const dto = (overrides: Record<string, unknown> = {}) => ({
      incomingStaffId: '22222222-2222-4222-8222-222222222222',
      pinCode: '2580',
      ...overrides,
    });

    beforeAll(async () => {
      incomingPinHash = await bcrypt.hash('2580', 10);
    });

    beforeEach(() => {
      prismaService.cashierShift = { findFirst: jest.fn().mockResolvedValue(null) };
      prismaService.$transaction = jest.fn().mockResolvedValue([]);
    });

    it('verifies the incoming PIN, revokes the outgoing session and returns the incoming session', async () => {
      prismaService.user.findUnique.mockResolvedValue(incoming());

      const result = await service.handover('user-123', dto({ notes: 'Ganti shift sore' }));

      expect(result.user).toMatchObject({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Sari Kasir',
        role: 'CASHIER',
      });
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBe('mock-jwt-token');
      // Tokens are issued for the INCOMING staff, not the outgoing one
      expect(jwtService.signAsync.mock.calls[0][0]).toMatchObject({
        sub: '22222222-2222-4222-8222-222222222222',
        role: 'CASHIER',
      });
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { refreshToken: null },
      });
      const incomingUpdate = prismaService.user.update.mock.calls.find(
        (c: any[]) => c[0].where.id === '22222222-2222-4222-8222-222222222222',
      )[0];
      expect(incomingUpdate.data.refreshToken).toEqual(expect.any(String));
      expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects a wrong PIN with 400 (never 401) and counts it toward the shared lockout', async () => {
      prismaService.user.findUnique.mockResolvedValue(incoming());
      prismaService.user.update.mockResolvedValue({ pinFailedAttempts: 1 });

      await expect(service.handover('user-123', dto({ pinCode: '1111' }))).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: '22222222-2222-4222-8222-222222222222' },
        data: { pinFailedAttempts: { increment: 1 } },
        select: { pinFailedAttempts: true },
      });
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('refuses with 429 while the incoming PIN is locked', async () => {
      prismaService.user.findUnique.mockResolvedValue(
        incoming({ pinLockedUntil: new Date(Date.now() + 60_000) }),
      );

      const error = await service.handover('user-123', dto()).catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('blocks with 409 SHIFT_STILL_OPEN while the outgoing staff has an open cash drawer shift', async () => {
      prismaService.cashierShift.findFirst.mockResolvedValue({ id: 'shift-1' });

      const error = await service.handover('user-123', dto()).catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.getResponse()).toMatchObject({ code: 'SHIFT_STILL_OPEN' });
      expect(prismaService.cashierShift.findFirst).toHaveBeenCalledWith({
        where: { staffId: 'user-123', status: 'OPEN' },
        select: { id: true },
      });
      // Checked before the PIN, so no PIN attempt is consumed
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects handing over to yourself with 400', async () => {
      await expect(
        service.handover('user-123', dto({ incomingStaffId: 'user-123' })),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['missing', null],
      ['inactive', { isActive: false }],
      ['soft-deleted', { deletedAt: new Date() }],
      ['an ADMIN', { role: 'ADMIN' }],
    ])('rejects an incoming staff that is %s with 404', async (_label, overrides) => {
      prismaService.user.findUnique.mockResolvedValue(
        overrides === null ? null : incoming(overrides),
      );

      await expect(service.handover('user-123', dto())).rejects.toThrow(NotFoundException);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['has not onboarded', { needsOnboarding: true }],
      ['has no PIN', { pinCode: null }],
    ])('rejects an incoming staff that %s with 400', async (_label, overrides) => {
      prismaService.user.findUnique.mockResolvedValue(incoming(overrides));

      await expect(service.handover('user-123', dto())).rejects.toThrow(BadRequestException);
    });
  });

  describe('getHandoverCandidates', () => {
    it('lists active, onboarded, non-admin staff with a PIN, excluding the current user', async () => {
      prismaService.user.findMany = jest.fn().mockResolvedValue([
        { id: 's1', employeeId: 'KC-002', name: 'Andi', role: 'KITCHEN', avatarUrl: null },
      ]);

      const result = await service.getHandoverCandidates('user-123');

      expect(result).toEqual([
        { id: 's1', employeeId: 'KC-002', name: 'Andi', role: 'KITCHEN', avatarUrl: null },
      ]);
      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { not: 'user-123' },
            isActive: true,
            deletedAt: null,
            needsOnboarding: false,
            pinCode: { not: null },
            role: { not: 'ADMIN' },
          },
          select: { id: true, employeeId: true, name: true, role: true, avatarUrl: true },
        }),
      );
    });
  });

  describe('machine-readable 401 codes', () => {
    const responseOf = async (promise: Promise<unknown>) =>
      promise.then(
        () => null,
        (e: any) => ({ status: e.getStatus(), ...e.getResponse() }),
      );

    it('login: unknown email -> INVALID_CREDENTIALS', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        responseOf(service.login({ email: 'nobody@x.com', password: 'whatever1' })),
      ).resolves.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    });

    it('login: wrong password -> INVALID_CREDENTIALS', async () => {
      prismaService.user.findUnique.mockResolvedValue({ ...mockUser, isActive: true });

      await expect(
        responseOf(service.login({ email: mockUser.email, password: 'wrong-password' })),
      ).resolves.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    });

    it('login: deactivated account -> ACCOUNT_DISABLED', async () => {
      prismaService.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        responseOf(service.login({ email: mockUser.email, password: 'password123' })),
      ).resolves.toMatchObject({ status: 401, code: 'ACCOUNT_DISABLED' });
    });

    it('onboard: wrong temporary password -> INVALID_TEMP_PASSWORD (not a token problem)', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: true,
        needsOnboarding: true,
      });

      await expect(
        responseOf(
          service.onboard('user-123', {
            currentPassword: 'not-the-temp-password',
            newPassword: 'NewPassw0rd99',
            pinCode: '3691',
          }),
        ),
      ).resolves.toMatchObject({ status: 401, code: 'INVALID_TEMP_PASSWORD' });
    });

    it('onboard: deactivated account -> ACCOUNT_DISABLED', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
        needsOnboarding: true,
      });

      await expect(
        responseOf(
          service.onboard('user-123', {
            currentPassword: 'password123',
            newPassword: 'NewPassw0rd99',
            pinCode: '3691',
          }),
        ),
      ).resolves.toMatchObject({ status: 401, code: 'ACCOUNT_DISABLED' });
    });
  });
});
