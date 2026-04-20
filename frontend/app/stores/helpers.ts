/**
 * Store action'ları için ortak loading/error sarmalayıcısı.
 * `this` yerine store state'inin `loading` + `error` alanlarını doğrudan set eder.
 *
 * Kullanım:
 *   async fetchAll() {
 *     await withLoading(this, async () => {
 *       this.items = await useApi().get<Item[]>('/items')
 *     })
 *   }
 */
export interface LoadableState {
  loading: boolean
  error: string | null
}

export async function withLoading<T>(
  state: LoadableState,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  state.loading = true
  state.error = null
  try {
    return await fn()
  } catch (e: any) {
    state.error = e?.message ?? 'Bilinmeyen hata'
    return undefined
  } finally {
    state.loading = false
  }
}
