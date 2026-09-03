import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OnboardingGuard } from './onboarding.guard';

describe('OnboardingGuard', () => {
  let guard: OnboardingGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new OnboardingGuard(reflector);
  });

  it('should allow access if route is marked as @Public()', () => {
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true);

    const result = guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow access if route is marked as @AllowDuringOnboarding()', () => {
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false) // isPublic: false
      .mockReturnValueOnce(true); // allowDuringOnboarding: true

    const result = guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException if user has needsOnboarding === true and route is not allowed', () => {
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { id: 'u1', email: 'test@kumpul.cafe', needsOnboarding: true },
        }),
      }),
    } as unknown as ExecutionContext;

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false) // isPublic: false
      .mockReturnValueOnce(false); // allowDuringOnboarding: false

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow access if user has needsOnboarding === false', () => {
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { id: 'u1', email: 'test@kumpul.cafe', needsOnboarding: false },
        }),
      }),
    } as unknown as ExecutionContext;

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const result = guard.canActivate(context);
    expect(result).toBe(true);
  });
});
