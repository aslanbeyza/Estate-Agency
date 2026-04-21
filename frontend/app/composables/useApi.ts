/**
 * Thin wrapper around `$fetch` that:
 *  - prefixes every request with the configured API base
 *  - attaches the JWT Bearer token from the auth token cookie (SSR-safe)
 *  - auto-logs the user out on `401` so a stale / revoked token doesn't
 *    leave the UI in a half-authenticated state
 *  - normalises the error to a message string (backend's error filter shape)
 *  - lets callers pass the path as `/agents`, `/transactions/:id`, etc.
 */
export function useApi() {
  const config = useRuntimeConfig();
  const base = String(config.public.apiBase ?? '').trim().replace(/\/$/, '');

  // Cookie read is cheap and `useCookie` is already reactive; reading it on
  // every request means freshly-set tokens (after login) are picked up
  // without refreshing the composable.
  const token = useCookie<string | null>('auth_token', {
    sameSite: 'lax',
    // 12h to match the backend default (`JWT_EXPIRES_IN`). Re-login rolls
    // the cookie; logout clears it. We deliberately don't use `httpOnly`
    // because the client-side `useApi` needs to attach the bearer.
    maxAge: 60 * 60 * 12,
  });

  function extractMessage(err: any): string {
    const data = err?.data;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(', ') : String(data.message);
    }
    return err?.message ?? 'Unexpected error';
  }

  async function request<T>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
    const headers = {
      ...(options?.headers ?? {}),
      ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}),
    };
    try {
      const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
      return (await $fetch(url, { ...options, headers })) as T;
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode;
      // A 401 means the token is either missing, expired, or the account
      // was deactivated. Clear local state and bounce to login — but only
      // on the client, because middleware handles SSR redirects.
      if (status === 401 && import.meta.client) {
        token.value = null;
        const auth = useCookie<unknown>('auth_user');
        auth.value = null;
        await navigateTo('/giris');
      }
      const message = extractMessage(err);
      const wrapped = new Error(message);
      (wrapped as any).status = status;
      throw wrapped;
    }
  }

  return {
    base,
    request,
    get:    <T>(path: string) => request<T>(path),
    post:   <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
    patch:  <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
    del:    <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  };
}
