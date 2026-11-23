import { SetMetadata } from '@nestjs/common';

export const IS_ALLOW_DURING_ONBOARDING_KEY = 'allowDuringOnboarding';

/**
 * Decorator to allow users with `needsOnboarding: true` to access the endpoint
 * (e.g. /auth/onboard, /auth/me). /auth/logout is @Public() and needs no exemption.
 */
export const AllowDuringOnboarding = () =>
  SetMetadata(IS_ALLOW_DURING_ONBOARDING_KEY, true);
