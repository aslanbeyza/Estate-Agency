import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/user.schema';

/**
 * Declares the minimum role(s) required to reach a handler. Enforced by
 * `RolesGuard`. Routes without `@Roles(...)` only require that the user
 * be authenticated (the `JwtAuthGuard` handles that globally).
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
