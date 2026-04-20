/**
 * Thin wrapper around `$fetch` that:
 *  - prefixes every request with the configured API base
 *  - normalises the error to a message string (backend's error filter shape)
 *  - lets callers pass the path as `/agents`, `/transactions/:id`, etc.
 */
export function useApi() {
  const config = useRuntimeConfig();
  const base = config.public.apiBase as string;

  function extractMessage(err: any): string {
    const data = err?.data;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(', ') : String(data.message);
    }
    return err?.message ?? 'Unexpected error';
  }

  async function request<T>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
    try {
      return (await $fetch(`${base}${path}`, options)) as T;
    } catch (err: any) {
      const message = extractMessage(err);
      const wrapped = new Error(message);
      (wrapped as any).status = err?.status ?? err?.statusCode;
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
