import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'menuscan_rt';
/** Sent only to the auth endpoints that need it (refresh, logout), never to the rest of the API. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

type SameSite = 'strict' | 'lax' | 'none';

/**
 * Writes and clears the HttpOnly refresh-token cookie. The refresh token never appears in a response
 * body, so page scripts (and therefore XSS) cannot read it.
 * See docs/security/refresh-token-httponly-cookie-plan.md.
 */
@Injectable()
export class RefreshCookieService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  read(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  set(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...this.baseOptions(),
      maxAge: this.maxAgeMs(refreshToken),
    });
  }

  clear(res: Response): void {
    // Attributes must match the ones used when setting, or browsers keep the cookie
    res.clearCookie(REFRESH_COOKIE_NAME, this.baseOptions());
  }

  private baseOptions(): CookieOptions {
    const sameSite = this.sameSite();
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      // Browsers reject SameSite=None without Secure; plain http://localhost cannot store Secure cookies
      secure: isProduction || sameSite === 'none',
      sameSite,
      path: REFRESH_COOKIE_PATH,
    };
  }

  private sameSite(): SameSite {
    const value =
      this.configService.get<string>('app.REFRESH_COOKIE_SAMESITE') ||
      this.configService.get<string>('REFRESH_COOKIE_SAMESITE');
    return value === 'lax' || value === 'none' ? value : 'strict';
  }

  /** Cookie lives exactly as long as the token itself (its `exp` claim). */
  private maxAgeMs(refreshToken: string): number {
    const payload = this.jwtService.decode<{ exp?: number } | null>(
      refreshToken,
    );
    if (!payload?.exp) return 0;
    return Math.max(0, payload.exp * 1000 - Date.now());
  }
}
