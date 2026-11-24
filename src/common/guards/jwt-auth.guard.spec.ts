import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  it('should allow access if route is marked as @Public()', () => {
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const result = guard.canActivate(context);
    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });

  it('should delegate to super.canActivate if route is not public', () => {
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: { authorization: 'Bearer valid_token' },
        }),
      }),
    } as unknown as ExecutionContext;

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const superCanActivateSpy = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true as any);

    const result = guard.canActivate(context);
    expect(result).toBe(true);
    expect(superCanActivateSpy).toHaveBeenCalledWith(context);
  });

  describe('handleRequest (machine-readable 401 codes)', () => {
    const codeOf = (fn: () => unknown) => {
      try {
        fn();
      } catch (e: any) {
        return { status: e.getStatus(), code: e.getResponse().code };
      }
      return null;
    };

    it('returns the user when authentication succeeded', () => {
      const user = { id: 'u1' };
      expect(guard.handleRequest(null, user, undefined)).toBe(user);
    });

    it('TOKEN_EXPIRED for an expired access token (refresh and retry)', () => {
      const info = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
      expect(codeOf(() => guard.handleRequest(null, false, info))).toEqual({
        status: 401,
        code: 'TOKEN_EXPIRED',
      });
    });

    it('TOKEN_MISSING when no Bearer token was sent', () => {
      expect(codeOf(() => guard.handleRequest(null, false, new Error('No auth token')))).toEqual({
        status: 401,
        code: 'TOKEN_MISSING',
      });
    });

    it('TOKEN_INVALID for a malformed or wrongly signed token', () => {
      const info = Object.assign(new Error('invalid signature'), { name: 'JsonWebTokenError' });
      expect(codeOf(() => guard.handleRequest(null, false, info))).toEqual({
        status: 401,
        code: 'TOKEN_INVALID',
      });
    });

    it('passes through errors thrown by the strategy (e.g. ACCOUNT_DISABLED) unchanged', () => {
      const err = new Error('from strategy');
      expect(() => guard.handleRequest(err, false, undefined)).toThrow(err);
    });
  });
});
