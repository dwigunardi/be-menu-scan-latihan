import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshCookieService } from './refresh-cookie.service';
import { CookieCsrfGuard } from '../../common/guards/cookie-csrf.guard';
import { JsonBodyGuard } from '../../common/guards/json-body.guard';
import { SessionSupersededException } from './session-superseded.exception';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let refreshCookie: { read: jest.Mock; set: jest.Mock; clear: jest.Mock };
  const res = {} as any;

  const user = {
    id: 'u1',
    employeeId: 'KC-001',
    email: 'admin@menuscan.com',
    name: 'Admin',
    phone: '+6281234567890',
    role: UserRole.ADMIN,
    needsOnboarding: false,
  };

  beforeEach(async () => {
    const mockAuthService = {
      handshake: jest.fn(),
      login: jest.fn(),
      refreshTokens: jest.fn(),
      onboard: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
      verifyPin: jest.fn(),
      getHandoverCandidates: jest.fn(),
      handover: jest.fn(),
    };
    refreshCookie = { read: jest.fn(), set: jest.fn(), clear: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: RefreshCookieService, useValue: refreshCookie },
      ],
    })
      .overrideGuard(CookieCsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JsonBodyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handshake', () => {
    it('should call authService.handshake and return key exchange result', async () => {
      const dto = { clientPublicKey: 'client-pub-hex', nonce: '123456' };
      const expectedResponse = {
        serverPublicKey: 'server-pub-hex',
        handshakeToken: 'token-uuid',
        expiresIn: 3600,
      };

      authService.handshake.mockResolvedValue(expectedResponse);

      const result = await controller.handshake(dto);
      expect(result).toEqual(expectedResponse);
      expect(authService.handshake).toHaveBeenCalledWith(dto);
    });
  });

  describe('login', () => {
    it('puts the refresh token in the HttpOnly cookie, not in the body', async () => {
      const dto = { email: 'admin@menuscan.com', password: 'password123' };
      authService.login.mockResolvedValue({
        accessToken: 'at-123',
        refreshToken: 'rt-123',
        user,
      });

      const result = await controller.login(dto, res);

      expect(result).toEqual({ accessToken: 'at-123', user });
      expect(result).not.toHaveProperty('refreshToken');
      expect(refreshCookie.set).toHaveBeenCalledWith(res, 'rt-123');
      expect(authService.login).toHaveBeenCalledWith(dto);
    });
  });

  it('guards login with JsonBodyGuard (blocks cross-site form login CSRF)', () => {
    const guards = Reflect.getMetadata('__guards__', AuthController.prototype.login);
    expect(guards).toContain(JsonBodyGuard);
  });

  it('guards refresh and logout with CookieCsrfGuard', () => {
    expect(Reflect.getMetadata('__guards__', AuthController.prototype.refresh)).toContain(CookieCsrfGuard);
    expect(Reflect.getMetadata('__guards__', AuthController.prototype.logout)).toContain(CookieCsrfGuard);
  });

  describe('refresh', () => {
    const req = { cookies: { menuscan_rt: 'old-rt' } } as any;

    it('refreshes from the cookie and rotates it', async () => {
      refreshCookie.read.mockReturnValue('old-rt');
      authService.refreshTokens.mockResolvedValue({
        accessToken: 'new-at',
        refreshToken: 'new-rt',
      });

      const result = await controller.refresh(req, res);

      expect(refreshCookie.read).toHaveBeenCalledWith(req);
      expect(authService.refreshTokens).toHaveBeenCalledWith('old-rt');
      expect(result).toEqual({ accessToken: 'new-at' });
      expect(refreshCookie.set).toHaveBeenCalledWith(res, 'new-rt');
      expect(refreshCookie.clear).not.toHaveBeenCalled();
    });

    it('clears the cookie when the refresh is rejected (401)', async () => {
      refreshCookie.read.mockReturnValue('revoked-rt');
      authService.refreshTokens.mockRejectedValue(
        new UnauthorizedException('Invalid or revoked refresh token'),
      );

      await expect(controller.refresh(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshCookie.clear).toHaveBeenCalledWith(res);
      expect(refreshCookie.set).not.toHaveBeenCalled();
    });

    it('keeps the cookie when the request lost a race to a parallel refresh', async () => {
      refreshCookie.read.mockReturnValue('old-rt');
      authService.refreshTokens.mockRejectedValue(
        new SessionSupersededException('Session was revoked or refreshed elsewhere'),
      );

      await expect(controller.refresh(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshCookie.clear).not.toHaveBeenCalled();
    });

    it('keeps the cookie on a transient server error', async () => {
      refreshCookie.read.mockReturnValue('old-rt');
      authService.refreshTokens.mockRejectedValue(
        new InternalServerErrorException(),
      );

      await expect(controller.refresh(req, res)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(refreshCookie.clear).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the session of the cookie and always clears the cookie', async () => {
      const req = { headers: {}, cookies: { menuscan_rt: 'rt-123' } } as any;
      refreshCookie.read.mockReturnValue('rt-123');
      const expectedResponse = { success: true, message: 'Logged out successfully' };
      authService.logout.mockResolvedValue(expectedResponse);

      const result = await controller.logout(req, res);

      expect(result).toEqual(expectedResponse);
      expect(authService.logout).toHaveBeenCalledWith('rt-123');
      expect(refreshCookie.clear).toHaveBeenCalledWith(res);
    });

    it('ignores a Bearer access token (revocation is by the exact session cookie only)', async () => {
      const req = { headers: { authorization: 'Bearer at-123' }, cookies: {} } as any;
      refreshCookie.read.mockReturnValue(undefined);
      authService.logout.mockResolvedValue({ success: true, message: 'ok' });

      await controller.logout(req, res);

      expect(authService.logout).toHaveBeenCalledWith(undefined);
      expect(refreshCookie.clear).toHaveBeenCalledWith(res);
    });
  });

  describe('getMe', () => {
    it('should call authService.getMe with userId', async () => {
      const expectedProfile = {
        ...user,
        pinCodeSet: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      authService.getMe.mockResolvedValue(expectedProfile);

      const result = await controller.getMe('u1');
      expect(result).toEqual(expectedProfile);
      expect(authService.getMe).toHaveBeenCalledWith('u1');
    });
  });

  describe('onboard', () => {
    it('sets the refresh cookie and returns the session without the refresh token', async () => {
      const dto = {
        currentPassword: 'tempPassword123',
        newPassword: 'SecureNewPassword123!',
        pinCode: '7890',
      };
      authService.onboard.mockResolvedValue({
        accessToken: 'at-new',
        refreshToken: 'rt-new',
        user,
      });

      const result = await controller.onboard('u1', dto, res);

      expect(result).toEqual({ accessToken: 'at-new', user });
      expect(refreshCookie.set).toHaveBeenCalledWith(res, 'rt-new');
      expect(authService.onboard).toHaveBeenCalledWith('u1', dto);
    });
  });

  describe('verifyPin', () => {
    it('verifies the PIN of the JWT user, not one from the body', async () => {
      authService.verifyPin.mockResolvedValue({ valid: true });

      const result = await controller.verifyPin('u1', { pinCode: '2580' });

      expect(result).toEqual({ valid: true });
      expect(authService.verifyPin).toHaveBeenCalledWith('u1', {
        pinCode: '2580',
      });
    });
  });

  describe('handover', () => {
    it('lists candidates for the current user', async () => {
      authService.getHandoverCandidates.mockResolvedValue([]);

      await controller.getHandoverCandidates('u1');

      expect(authService.getHandoverCandidates).toHaveBeenCalledWith('u1');
    });

    it("sets the incoming staff's refresh cookie and returns their session", async () => {
      const dto = {
        incomingStaffId: '22222222-2222-4222-8222-222222222222',
        pinCode: '2580',
      };
      authService.handover.mockResolvedValue({
        accessToken: 'at-b',
        refreshToken: 'rt-b',
        user,
      });

      const result = await controller.handover('u1', dto, res);

      expect(authService.handover).toHaveBeenCalledWith('u1', dto);
      expect(result).toEqual({ accessToken: 'at-b', user });
      expect(refreshCookie.set).toHaveBeenCalledWith(res, 'rt-b');
    });
  });
});
