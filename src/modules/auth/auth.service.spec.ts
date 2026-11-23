import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, PIN_MAX_ATTEMPTS } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EcdhService } from '../../common/crypto/ecdh.service';
import { PinVerificationService } from '../../common/security/pin-verification.service';
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
    it('should refresh tokens when valid refresh token is provided', async () => {
      const hashedRefreshToken = await bcrypt.hash('valid-refresh-token', 10);
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshToken: hashedRefreshToken,
      });
      prismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.refreshTokens(
        'user-123',
        'valid-refresh-token',
      );

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(prismaService.user.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when refresh token hash does not match', async () => {
      const hashedRefreshToken = await bcrypt.hash('different-token', 10);
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshToken: hashedRefreshToken,
      });

      await expect(
        service.refreshTokens('user-123', 'invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should clear refresh token in database', async () => {
      prismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.logout('user-123');

      expect(result.success).toBe(true);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { refreshToken: null },
      });
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
});
