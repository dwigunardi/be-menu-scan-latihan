import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const mockAuthService = {
      handshake: jest.fn(),
      login: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

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
    it('should call authService.login and return auth tokens', async () => {
      const dto = { email: 'admin@menuscan.com', password: 'password123' };
      const expectedResponse = {
        accessToken: 'at-123',
        refreshToken: 'rt-123',
        user: { id: 'u1', email: 'admin@menuscan.com', name: 'Admin' },
      };

      authService.login.mockResolvedValue(expectedResponse);

      const result = await controller.login(dto);
      expect(result).toEqual(expectedResponse);
      expect(authService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('refresh', () => {
    it('should call authService.refreshTokens with user info from req', async () => {
      const req = {
        user: { id: 'u1', refreshToken: 'old-refresh-token' },
      };
      const expectedTokens = { accessToken: 'new-at', refreshToken: 'new-rt' };

      authService.refreshTokens.mockResolvedValue(expectedTokens);

      const result = await controller.refresh({ refreshToken: 'old-refresh-token' }, req);
      expect(result).toEqual(expectedTokens);
      expect(authService.refreshTokens).toHaveBeenCalledWith('u1', 'old-refresh-token');
    });
  });

  describe('logout', () => {
    it('should call authService.logout with userId', async () => {
      const expectedResponse = { success: true, message: 'Logged out successfully' };
      authService.logout.mockResolvedValue(expectedResponse);

      const result = await controller.logout('u1');
      expect(result).toEqual(expectedResponse);
      expect(authService.logout).toHaveBeenCalledWith('u1');
    });
  });

  describe('getMe', () => {
    it('should call authService.getMe with userId', async () => {
      const expectedProfile = {
        id: 'u1',
        email: 'admin@menuscan.com',
        name: 'Admin User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      authService.getMe.mockResolvedValue(expectedProfile);

      const result = await controller.getMe('u1');
      expect(result).toEqual(expectedProfile);
      expect(authService.getMe).toHaveBeenCalledWith('u1');
    });
  });
});
