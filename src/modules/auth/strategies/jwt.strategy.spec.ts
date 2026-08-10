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

    const mockUser = {
      id: 'user-uuid-1',
      email: 'admin@menuscan.com',
      name: 'Admin User',
      role: UserRole.ADMIN,
      createdAt: new Date(),
    };

    (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const result = await strategy.validate(payload);
    expect(result).toEqual(mockUser);
    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-uuid-1' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });
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
