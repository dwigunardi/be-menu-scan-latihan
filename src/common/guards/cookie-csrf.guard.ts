import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { getAllowedOrigins } from '../../config/cors-origins';

/**
 * CSRF protection for endpoints authenticated by the refresh cookie (/auth/refresh, /auth/logout).
 * Browsers attach cookies automatically, so these requests must also prove they come from our FE:
 * - `Origin` must be one of the CORS-allowed origins;
 * - `Content-Type` must be application/json, which forces a CORS preflight that a plain HTML form
 *   from another site cannot pass.
 * SameSite=Strict on the cookie is the first layer; this guard is the second.
 */
@Injectable()
export class CookieCsrfGuard implements CanActivate {
  private readonly logger = new Logger(CookieCsrfGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const origin = req.headers.origin;
    const allowed = getAllowedOrigins(this.configService);

    if (!origin || !allowed.includes(origin)) {
      this.logger.warn({
        step: 'COOKIE_CSRF_ORIGIN_REJECTED',
        origin: origin ?? null,
        path: req.originalUrl,
        msg: 'Cookie-authenticated request from a missing or unknown Origin',
      });
      throw new ForbiddenException('Origin tidak diizinkan');
    }

    if (!req.is('application/json')) {
      throw new ForbiddenException('Content-Type harus application/json');
    }

    return true;
  }
}
