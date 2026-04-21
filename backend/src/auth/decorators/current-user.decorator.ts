import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../users/user.schema';

/**
 * Shape attached to `req.user` by `JwtStrategy.validate(...)`. Kept
 * intentionally minimal: only what handlers and guards actually need to
 * make authorization decisions and write audit fields. The full user
 * document is a separate DB round-trip any handler can make if it wants.
 */
export interface AuthUser {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
}

/**
 * `@CurrentUser()` handler-param shortcut. Saves every handler from
 * `@Req() req: Request & { user: AuthUser }` boilerplate.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
