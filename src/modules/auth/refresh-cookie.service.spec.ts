import { JwtService } from '@nestjs/jwt';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  RefreshCookieService,
} from './refresh-cookie.service';

describe('RefreshCookieService', () => {
  const jwtService = new JwtService({});
  const config = (env: Record<string, string | undefined>) =>
    ({ get: jest.fn((key: string) => env[key]) }) as any;
  const res = () => ({ cookie: jest.fn(), clearCookie: jest.fn() }) as any;

  afterEach(() => jest.useRealTimers());

  it('sets an HttpOnly, SameSite=Strict cookie scoped to /api/v1/auth, living as long as the token', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-11-23T00:00:00.000Z'));
    const token = jwtService.sign(
      { sub: 'u1' },
      { secret: 'refresh-secret-123456', expiresIn: '7d' },
    );
    const r = res();

    new RefreshCookieService(
      config({ NODE_ENV: 'development' }),
      jwtService,
    ).set(r, token);

    expect(r.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    expect(REFRESH_COOKIE_PATH).toBe('/api/v1/auth');
  });

  it('is Secure in production', () => {
    const r = res();
    const token = jwtService.sign(
      { sub: 'u1' },
      { secret: 's'.repeat(16), expiresIn: '1h' },
    );

    new RefreshCookieService(
      config({ NODE_ENV: 'production' }),
      jwtService,
    ).set(r, token);

    expect(r.cookie.mock.calls[0][2]).toMatchObject({
      secure: true,
      sameSite: 'strict',
    });
  });

  it('forces Secure when SameSite=None (cross-site deployments)', () => {
    const r = res();
    const token = jwtService.sign(
      { sub: 'u1' },
      { secret: 's'.repeat(16), expiresIn: '1h' },
    );

    new RefreshCookieService(
      config({
        NODE_ENV: 'development',
        'app.REFRESH_COOKIE_SAMESITE': 'none',
      }),
      jwtService,
    ).set(r, token);

    expect(r.cookie.mock.calls[0][2]).toMatchObject({
      secure: true,
      sameSite: 'none',
    });
  });

  it('clears with the same attributes it was set with (otherwise browsers keep it)', () => {
    const r = res();

    new RefreshCookieService(
      config({ NODE_ENV: 'production' }),
      jwtService,
    ).clear(r);

    expect(r.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
  });

  it('reads the cookie, ignoring missing or empty values', () => {
    const service = new RefreshCookieService(config({}), jwtService);

    expect(
      service.read({ cookies: { [REFRESH_COOKIE_NAME]: 'rt' } } as any),
    ).toBe('rt');
    expect(
      service.read({ cookies: { [REFRESH_COOKIE_NAME]: '' } } as any),
    ).toBeUndefined();
    expect(service.read({ cookies: {} } as any)).toBeUndefined();
    expect(service.read({} as any)).toBeUndefined();
  });
});
