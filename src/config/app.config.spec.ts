import appConfig from './app.config';

describe('appConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/menuscan_db',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_super_secret_123',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_super_secret_123',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      APP_SECRET: 'test_app_secret_payload_encryption_123',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should register app configuration correctly', () => {
    const config = appConfig();
    expect(config).toBeDefined();
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe('postgresql://postgres:postgres@localhost:5432/menuscan_db');
  });
});
