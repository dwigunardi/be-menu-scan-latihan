import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Hashing for stored refresh tokens.
 *
 * Do NOT use bcrypt here: bcrypt only reads the first 72 bytes of its input, and the first ~110 bytes of
 * every refresh JWT for the same user are identical (header + start of the payload). With bcrypt, any
 * older or rotated-out token of the same user matched the stored hash, which made rotation and
 * "log in again to kill a stolen token" ineffective.
 *
 * Refresh tokens are long, high-entropy values, so a fast SHA-256 digest is the right tool (no
 * brute-force risk, unlike passwords), compared in constant time.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenMatches(
  token: string,
  storedHash: string,
): boolean {
  // Legacy bcrypt hashes ($2b$...) or garbage never match: those sessions simply have to log in again
  if (!/^[0-9a-f]{64}$/.test(storedHash)) return false;
  return timingSafeEqual(
    Buffer.from(hashRefreshToken(token), 'hex'),
    Buffer.from(storedHash, 'hex'),
  );
}
