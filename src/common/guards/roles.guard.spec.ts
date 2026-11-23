import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import {
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    const mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get(Reflector);
  });

  const createMockContext = (user?: any): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access if no roles are required on handler or class', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext({ id: '1', role: UserRole.CASHIER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if requiredRoles array is empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const context = createMockContext({ id: '1', role: UserRole.CASHIER });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user object is not present', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('User role not identified');
  });

  it('should throw ForbiddenException if user role is missing', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = createMockContext({ id: '1' }); // no role

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException if user role is not in requiredRoles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = createMockContext({ id: '1', role: UserRole.WAITER });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow access if user role matches one of requiredRoles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN, UserRole.CASHIER]);
    const context = createMockContext({ id: '1', role: UserRole.CASHIER });

    expect(guard.canActivate(context)).toBe(true);
  });

  describe('deny by default on admin routes (real metadata)', () => {
    @Controller('admin/tables')
    class AdminTablesController {
      @Delete(':id')
      remove() {}

      @Roles(UserRole.ADMIN)
      @Post()
      create() {}
    }

    @Controller()
    class MixedController {
      @Get('admin/orders')
      list() {}

      @Get('public/menus')
      publicMenus() {}

      @Public()
      @Get('admin/health')
      publicAdmin() {}
    }

    @Controller('auth')
    class AuthLikeController {
      @Get('me')
      me() {}
    }

    const realGuard = new RolesGuard(new Reflector());
    const contextFor = (cls: any, method: string, user: any) =>
      ({
        getHandler: () => cls.prototype[method],
        getClass: () => cls,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext;
    const kitchen = { id: 'k1', role: UserRole.KITCHEN };

    it('denies an admin route without @Roles (controller prefix)', () => {
      expect(() =>
        realGuard.canActivate(contextFor(AdminTablesController, 'remove', kitchen)),
      ).toThrow(ForbiddenException);
    });

    it('denies an admin route without @Roles (handler path)', () => {
      expect(() =>
        realGuard.canActivate(contextFor(MixedController, 'list', kitchen)),
      ).toThrow(ForbiddenException);
    });

    it('still enforces explicit @Roles on admin routes', () => {
      expect(() =>
        realGuard.canActivate(contextFor(AdminTablesController, 'create', kitchen)),
      ).toThrow(ForbiddenException);
      expect(
        realGuard.canActivate(
          contextFor(AdminTablesController, 'create', { id: 'a1', role: UserRole.ADMIN }),
        ),
      ).toBe(true);
    });

    it('allows non-admin routes without @Roles (auth, public)', () => {
      expect(realGuard.canActivate(contextFor(AuthLikeController, 'me', kitchen))).toBe(true);
      expect(
        realGuard.canActivate(contextFor(MixedController, 'publicMenus', undefined)),
      ).toBe(true);
    });

    it('allows an admin route explicitly marked @Public', () => {
      expect(
        realGuard.canActivate(contextFor(MixedController, 'publicAdmin', undefined)),
      ).toBe(true);
    });
  });
});
