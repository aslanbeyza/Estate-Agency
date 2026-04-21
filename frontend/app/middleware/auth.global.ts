import type { AuthUser } from '~/types'

/**
 * Global auth gate. Every page hit runs this on both server and client:
 *  - If the user has no token, they're bounced to `/giris`, keeping the
 *    original destination as `?redirect=` so we can send them back after
 *    login.
 *  - The login page itself is reachable without a token; otherwise the
 *    middleware would cause a redirect loop.
 *  - Already-authenticated users visiting `/giris` are forwarded to the
 *    dashboard — no reason to re-login while a valid session exists.
 *
 * Because middleware runs before rendering, this is the piece that makes
 * SSR meaningful: unauthenticated requests never get to render the
 * dashboard HTML at all, they get a 3xx to `/giris` instantly.
 */
export default defineNuxtRouteMiddleware((to) => {
  const token = useCookie<string | null>('auth_token')
  const user = useCookie<AuthUser | null>('auth_user')
  const authed = !!token.value && !!user.value
  const isLoginRoute = to.path === '/giris'

  if (!authed && !isLoginRoute) {
    return navigateTo({
      path: '/giris',
      query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : undefined,
    })
  }
  if (authed && isLoginRoute) {
    return navigateTo('/')
  }
})
