import { getAllowedOrigins } from './cors-origins';

describe('getAllowedOrigins', () => {
  const config = (env: Record<string, string>) =>
    ({ get: jest.fn((key: string) => env[key]) }) as any;

  it('includes the FE origin and local dev servers outside production', () => {
    expect(
      getAllowedOrigins(
        config({
          'app.FRONTEND_URL': 'http://localhost:3000',
          'app.NODE_ENV': 'development',
        }),
      ),
    ).toEqual(['http://localhost:3000', 'http://localhost:3001']);
  });

  it('only trusts FRONTEND_URL in production (no localhost with the refresh cookie)', () => {
    expect(
      getAllowedOrigins(
        config({
          'app.FRONTEND_URL': 'https://app.kumpulcafe.id',
          'app.NODE_ENV': 'production',
        }),
      ),
    ).toEqual(['https://app.kumpulcafe.id']);
  });
});
