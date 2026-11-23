import * as bcrypt from 'bcrypt';
import { hashRefreshToken, refreshTokenMatches } from './refresh-token-hash';

describe('refresh-token-hash', () => {
  // Two JWT-like tokens that share far more than bcrypt's 72-byte limit
  const prefix = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'a'.repeat(100);
  const current = prefix + '.current-signature';
  const older = prefix + '.older-signature';

  it('matches only the exact token', () => {
    const stored = hashRefreshToken(current);

    expect(refreshTokenMatches(current, stored)).toBe(true);
    expect(refreshTokenMatches(older, stored)).toBe(false);
  });

  it('is not fooled by a shared long prefix the way bcrypt is', async () => {
    // Documents why bcrypt must not be used for refresh tokens
    const bcryptHash = await bcrypt.hash(current, 10);
    expect(await bcrypt.compare(older, bcryptHash)).toBe(true);

    expect(refreshTokenMatches(older, hashRefreshToken(current))).toBe(false);
  });

  it('never matches a legacy bcrypt hash or malformed value', async () => {
    expect(refreshTokenMatches(current, await bcrypt.hash(current, 10))).toBe(
      false,
    );
    expect(refreshTokenMatches(current, '')).toBe(false);
    expect(refreshTokenMatches(current, 'not-a-hash')).toBe(false);
  });

  it('produces a 64-char hex SHA-256 digest', () => {
    expect(hashRefreshToken(current)).toMatch(/^[0-9a-f]{64}$/);
  });
});
