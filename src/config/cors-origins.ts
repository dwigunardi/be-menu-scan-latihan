import { ConfigService } from '@nestjs/config';

/**
 * Browser origins allowed to call the API with credentials. Shared by CORS (main.ts) and the
 * cookie CSRF guard, so both always agree on which sites may use the refresh cookie.
 */
export function getAllowedOrigins(configService: ConfigService): string[] {
  const frontendUrl =
    configService.get<string>('app.FRONTEND_URL') || 'http://localhost:3000';
  const isProduction =
    (configService.get<string>('app.NODE_ENV') ||
      configService.get<string>('NODE_ENV')) === 'production';
  // Local dev servers must never be trusted with the production refresh cookie
  const devOrigins = isProduction
    ? []
    : ['http://localhost:3000', 'http://localhost:3001'];
  return [...new Set([frontendUrl, ...devOrigins])];
}
