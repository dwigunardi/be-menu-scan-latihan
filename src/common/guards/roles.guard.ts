import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      // Deny by default on staff routes: an `admin/*` handler without @Roles is a missing policy,
      // not an invitation for every logged-in role (e.g. KITCHEN deleting tables)
      if (this.isAdminRoute(context) && !this.isPublic(context)) {
        this.logger.warn({
          step: 'ROLES_POLICY_MISSING',
          handler: `${context.getClass()?.name}.${context.getHandler()?.name}`,
          msg: 'Admin route without @Roles denied by default',
        });
        throw new ForbiddenException(
          'Forbidden Resource: no role policy is defined for this endpoint',
        );
      }
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException(
        'Forbidden Resource: User role not identified',
      );
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Forbidden Resource: Access requires role [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  /** True when the route path (controller prefix + handler path) starts with `admin`. */
  private isAdminRoute(context: ExecutionContext): boolean {
    const toPaths = (target: unknown): string[] => {
      if (!target) return [''];
      const value = Reflect.getMetadata(PATH_METADATA, target) as
        string | string[] | undefined;
      if (value === undefined) return [''];
      return Array.isArray(value) ? value : [value];
    };

    const firstSegment = (path: string) => path.split('/').filter(Boolean)[0];

    return toPaths(context.getClass()).some((classPath) =>
      toPaths(context.getHandler()).some(
        (handlerPath) =>
          firstSegment(`${classPath}/${handlerPath}`) === 'admin',
      ),
    );
  }
}
