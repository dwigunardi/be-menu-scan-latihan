import { validateEnv } from './env.config';

describe('validateEnv', () => {
  const validConfig = {
    PORT: '3000',
    NODE_ENV: 'development',
    FRONTEND_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/menuscan_db?schema=public',
    JWT_ACCESS_SECRET: 'super-secret-jwt-access-key-minimum-32-chars',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'super-secret-jwt-refresh-key-minimum-32-chars',
    JWT_REFRESH_EXPIRES_IN: '7d',
    APP_SECRET: 'super-secret-app-handshake-key-minimum-32-chars',
    HANDSHAKE_SESSION_TTL: '7200',
    LOG_TO_FILE: 'false',
    LOG_FILE_PATH: './logs',
    LOG_RETENTION_DAYS: '14',
  };

  it('should successfully parse valid environment variables', () => {
    const result = validateEnv(validConfig);
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
    expect(result.DATABASE_URL).toBe(validConfig.DATABASE_URL);
    expect(result.JWT_ACCESS_SECRET).toBe(validConfig.JWT_ACCESS_SECRET);
  });

  it('should throw an error if required variable is missing', () => {
    const invalidConfig = { ...validConfig, DATABASE_URL: '' };
    expect(() => validateEnv(invalidConfig)).toThrow('Invalid Environment Variables Configuration');
  });

  it('should throw an error if secret is shorter than 16 characters', () => {
    const invalidConfig = { ...validConfig, JWT_ACCESS_SECRET: 'short' };
    expect(() => validateEnv(invalidConfig)).toThrow('JWT_ACCESS_SECRET must be at least 16 characters');
  });
});
