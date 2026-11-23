import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Requires a JSON body. A cross-site HTML form can only send urlencoded/multipart/text bodies, and a
 * cross-site JSON request needs a CORS preflight that our CORS policy rejects, so this blocks login CSRF
 * (planting an attacker's session cookie in the victim's browser) while Swagger/curl keep working.
 */
@Injectable()
export class JsonBodyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.is('application/json')) {
      throw new UnsupportedMediaTypeException(
        'Content-Type harus application/json',
      );
    }
    return true;
  }
}
