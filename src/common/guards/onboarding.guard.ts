import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_ALLOW_DURING_ONBOARDING_KEY } from '../decorators/allow-during-onboarding.decorator';

@Injectable()
export class OnboardingGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const allowDuringOnboarding = this.reflector.getAllAndOverride<boolean>(
      IS_ALLOW_DURING_ONBOARDING_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowDuringOnboarding) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (user && user.needsOnboarding === true) {
      throw new ForbiddenException(
        'Akun Anda masih dalam status karantina onboarding. Harap selesaikan penggantian password dan pengaturan PIN pada endpoint /api/v1/auth/onboard terlebih dahulu.',
      );
    }

    return true;
  }
}
