import { UnauthorizedException } from '@nestjs/common';

/**
 * Machine-readable codes on auth 401s, sent as `code` in the error body (see GlobalExceptionFilter), so the
 * FE can tell "refresh the access token and retry" apart from "the user typed something wrong" without
 * parsing messages. The HTTP status stays 401 for all of them.
 */
export const AuthErrorCode = {
  /** No Bearer token on a protected route. */
  TOKEN_MISSING: 'TOKEN_MISSING',
  /** Access token expired: refresh it (cookie) and retry the request once. */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /** Access token malformed or wrongly signed: log in again. */
  TOKEN_INVALID: 'TOKEN_INVALID',
  /** The account behind the token or credentials is deactivated or deleted. */
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  /** Login: wrong email or password. Do NOT retry or refresh. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** Onboarding: wrong temporary password. Do NOT retry or refresh. */
  INVALID_TEMP_PASSWORD: 'INVALID_TEMP_PASSWORD',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

export function authError(
  code: AuthErrorCode,
  message: string,
): UnauthorizedException {
  return new UnauthorizedException({ error: 'Unauthorized', code, message });
}
