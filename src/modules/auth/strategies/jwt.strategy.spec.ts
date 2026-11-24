import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configService: jest.Mocked<ConfigService>;
  let prismaService: jest.Mocked<PrismaService>;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('test_jwt_access_secret_123456789'),
    } as any;

    prismaService = {
      user: {
        findUnique: jest.fn(),
      },
    } as any;

    strategy = new JwtStrategy(configService, prismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should validate and return user when user exists in database', async () => {
    const payload: JwtPayload = {
      sub: 'user-uuid-1',
      email: 'admin@menuscan.com',
      name: 'Admin User',
      role: UserRole.ADMIN,
    };

    const principal = {
      id: 'user-uuid-1',
      email: 'admin@menuscan.com',
      name: 'Admin User',
      role: UserRole.ADMIN,
      needsOnboarding: true,
      createdAt: new Date(),
    };

    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      ...principal,
      isActive: true,
      deletedAt: null,
    });

    const result = await strategy.validate(payload);
    // The account status fields are checked, not exposed on request.user
    expect(result).toEqual(principal);
    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-uuid-1' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        needsOnboarding: true,
        createdAt: true,
        isActive: true,
        deletedAt: true,
      },
    });
  });

  it.each([
    ['deactivated', { isActive: false, deletedAt: null }],
    ['deleted', { isActive: true, deletedAt: new Date() }],
  ])('rejects a %s account immediately with code ACCOUNT_DISABLED', async (_label, status) => {
    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-uuid-1',
      email: 'admin@menuscan.com',
      name: 'Admin User',
      role: UserRole.ADMIN,
      needsOnboarding: false,
      createdAt: new Date(),
      ...status,
    });

    const error = await strategy
      .validate({ sub: 'user-uuid-1', email: 'a', name: 'b', role: UserRole.ADMIN })
      .catch((e) => e);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });

  it('should throw UnauthorizedException if user does not exist in database', async () => {
    const payload: JwtPayload = {
      sub: 'non-existent-user',
      email: 'admin@menuscan.com',
      name: 'Admin User',
      role: UserRole.ADMIN,
    };

    (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });
});
