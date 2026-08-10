import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EcdhService } from '../../common/crypto/ecdh.service';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: any;
  let jwtService: any;
  let configService: any;
  let ecdhService: any;

  const mockUser = {
    id: 'user-123',
    email: 'admin@menuscan.com',
    password: '',
    name: 'Admin MenuScan',
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
});
