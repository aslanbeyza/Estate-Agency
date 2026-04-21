/**
 * Wire shape of every paginated list endpoint. Mirrors
 * `PaginatedResult<T>` in the backend; any list that adopts pagination
 * uses this exact type so store + components stay transport-agnostic.
 */
export interface Paginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}
