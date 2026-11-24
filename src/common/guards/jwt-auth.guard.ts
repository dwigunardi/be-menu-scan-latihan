import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthErrorCode, authError } from '../constants/auth-error-codes';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Turns passport's generic 401 into one with a machine-readable code. Errors thrown by
   * JwtStrategy.validate (e.g. ACCOUNT_DISABLED) already carry their own code and pass through.
   */
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false | null,
    info: unknown,
  ): TUser {
    if (err) {
      throw err;
    }
    if (!user) {
      const infoError = info as { name?: string; message?: string } | undefined;
      if (infoError?.name === 'TokenExpiredError') {
        throw authError(
          AuthErrorCode.TOKEN_EXPIRED,
          'Token akses sudah kedaluwarsa',
        );
      }
      if (!infoError || infoError.message === 'No auth token') {
        throw authError(
          AuthErrorCode.TOKEN_MISSING,
          'Token akses tidak ditemukan',
        );
      }
      throw authError(AuthErrorCode.TOKEN_INVALID, 'Token akses tidak valid');
    }
    return user;
  }
}
