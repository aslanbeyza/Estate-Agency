import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/user.schema';
import { AuthUser } from '../decorators/current-user.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Role check that runs **after** `JwtAuthGuard` has attached the user.
 * Handlers without `@Roles(...)` skip this guard entirely — authenticated
 * is enough. We throw `ForbiddenException` (not `UnauthorizedException`)
 * because the user is known; they just don't have the role.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      // Shouldn't happen if JwtAuthGuard ran first, but stay defensive —
      // a route misconfigured to skip auth shouldn't silently bypass RBAC.
      throw new ForbiddenException('Authentication required');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Requires role: ${required.join(' or ')} (you are ${user.role})`,
      );
    }
    return true;
  }
}
