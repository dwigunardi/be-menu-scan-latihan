import { ForbiddenException } from '@nestjs/common';
import { CookieCsrfGuard } from './cookie-csrf.guard';

describe('CookieCsrfGuard', () => {
  const guard = new CookieCsrfGuard({
    get: jest.fn((key: string) =>
      key === 'app.FRONTEND_URL' ? 'https://app.kumpulcafe.id' : undefined,
    ),
  } as any);

  const contextFor = (origin: string | undefined, isJson: boolean) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: origin ? { origin } : {},
          originalUrl: '/api/v1/auth/refresh',
          is: (type: string) =>
            isJson && type === 'application/json' ? type : false,
        }),
      }),
    }) as any;

  it.each([
    'https://app.kumpulcafe.id',
    'http://localhost:3000',
    'http://localhost:3001',
  ])('allows a JSON request from the allowed origin %s', (origin) => {
    expect(guard.canActivate(contextFor(origin, true))).toBe(true);
  });

  it('rejects an unknown origin with 403', () => {
    expect(() =>
      guard.canActivate(contextFor('https://evil.example', true)),
    ).toThrow(ForbiddenException);
  });

  it('rejects a request without Origin with 403', () => {
    expect(() => guard.canActivate(contextFor(undefined, true))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a non-JSON body (e.g. a cross-site HTML form post) with 403', () => {
    expect(() =>
      guard.canActivate(contextFor('http://localhost:3000', false)),
    ).toThrow(ForbiddenException);
  });
});
