import { defineStore } from 'pinia'
import type { AuthResponse, AuthUser, LoginPayload, UserRole } from '~/types'

/**
 * Auth state is backed by two cookies:
 *   - `auth_token`  — the JWT; attached by `useApi` to every request.
 *   - `auth_user`   — the decoded user claims; lets us render name/role
 *                     without a round-trip on SSR.
 *
 * Keeping them in cookies (rather than localStorage) means SSR middleware
 * can see the user and redirect before a single byte of HTML is flushed.
 * The store is a thin reactive view over those cookies so components don't
 * have to `useCookie` directly.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    // Cookie-backed accessors are created lazily in actions so that every
    // SSR request sees its own request-scoped cookie rather than a cached
    // one from the module initialisation.
    user: null as AuthUser | null,
    token: null as string | null,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.token && !!state.user,
    role: (state): UserRole | null => state.user?.role ?? null,
    isAdmin: (state) => state.user?.role === 'admin',
    isAgent: (state) => state.user?.role === 'agent',
  },

  actions: {
    /** Reads the cookies into reactive state. Safe to call on SSR. */
    hydrate() {
      const token = useCookie<string | null>('auth_token')
      const user = useCookie<AuthUser | null>('auth_user')
      this.token = token.value ?? null
      this.user = user.value ?? null
    },

    async login(payload: LoginPayload) {
      const api = useApi()
      this.loading = true
      this.error = null
      try {
        const res = await api.post<AuthResponse>('/auth/login', payload)
        this.persistSession(res)
      } catch (err: any) {
        this.error = err?.message ?? 'Giriş başarısız'
        throw err
      } finally {
        this.loading = false
      }
    },

    /** Logs out locally (no server round-trip needed for a stateless JWT). */
    logout() {
      const token = useCookie<string | null>('auth_token')
      const user = useCookie<AuthUser | null>('auth_user')
      token.value = null
      user.value = null
      this.token = null
      this.user = null
    },

    persistSession(res: AuthResponse) {
      const token = useCookie<string | null>('auth_token', {
        sameSite: 'lax',
        maxAge: 60 * 60 * 12,
      })
      const user = useCookie<AuthUser | null>('auth_user', {
        sameSite: 'lax',
        maxAge: 60 * 60 * 12,
      })
      token.value = res.access_token
      user.value = res.user
      this.token = res.access_token
      this.user = res.user
    },
  },
})
