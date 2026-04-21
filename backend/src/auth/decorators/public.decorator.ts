import { SetMetadata } from '@nestjs/common';

/**
 * Opts a route (or entire controller) out of the globally registered
 * `JwtAuthGuard`. Used for login, health checks, Swagger docs and the
 * one-shot bootstrap endpoint. Prefer `@Public()` on specific handlers
 * over whole controllers so nothing becomes accidentally open when we
 * add new routes.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
