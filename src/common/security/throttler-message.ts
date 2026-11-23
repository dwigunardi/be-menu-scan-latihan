import { ExecutionContext } from '@nestjs/common';
import { ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Indonesian message for the global rate limiter (replaces "ThrottlerException: Too Many Requests").
 * `timeToBlockExpire` is in seconds, the same value sent in the `Retry-After` header.
 */
export function throttlerErrorMessage(
  _context: ExecutionContext,
  detail: ThrottlerLimitDetail,
): string {
  const seconds = Math.max(1, Math.ceil(detail.timeToBlockExpire));
  return `Terlalu banyak permintaan. Coba lagi dalam ${seconds} detik.`;
}
