import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';
import { JwtPayload } from './jwt.strategy';

describe('JwtRefreshStrategy', () => {
  let strategy: JwtRefreshStrategy;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('test_jwt_refresh_secret_123456789'),
    } as any;

    strategy = new JwtRefreshStrategy(configService);
  });

  it('should validate and extract refresh token from request body', () => {
    const req = {
      body: {
        refreshToken: 'valid-refresh-token-123',
      },
    } as any;

    const payload: JwtPayload = {
      sub: 'user-uuid-1',
      email: 'admin@menuscan.com',
      name: 'Admin User',
    };

    const result = strategy.validate(req, payload);
    expect(result).toEqual({
      id: 'user-uuid-1',
      email: 'admin@menuscan.com',
      name: 'Admin User',
      refreshToken: 'valid-refresh-token-123',
    });
  });

  it('should validate and extract refresh token from Authorization header if body is empty', () => {
    const req = {
      body: {},
      get: jest.fn().mockReturnValue('Bearer header-refresh-token-456'),
    } as any;

    const payload: JwtPayload = {
      sub: 'user-uuid-1',
      email: 'admin@menuscan.com',
      name: 'Admin User',
    };

    const result = strategy.validate(req, payload);
    expect(result).toEqual({
      id: 'user-uuid-1',
      email: 'admin@menuscan.com',
      name: 'Admin User',
      refreshToken: 'header-refresh-token-456',
    });
  });

  it('should throw UnauthorizedException if refresh token cannot be found', () => {
    const req = {
      body: {},
      get: jest.fn().mockReturnValue(undefined),
    } as any;

    const payload: JwtPayload = {
      sub: 'user-uuid-1',
      email: 'admin@menuscan.com',
      name: 'Admin User',
    };

    expect(() => strategy.validate(req, payload)).toThrow(UnauthorizedException);
  });
});
