export type UserRole = 'admin' | 'agent'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
}

export interface LoginPayload {
  email: string
  password: string
}

export interface BootstrapAdminPayload {
  email: string
  password: string
  name: string
}

export interface AuthResponse {
  access_token: string
  user: AuthUser
}

/**
 * Condensed user ref returned by populate() from the backend on
 * `transaction.createdBy` and `transaction.stageHistory.by`. Matches the
 * fields selected in `TransactionsService.findAll/findOne`.
 */
export interface UserRef {
  _id: string
  id?: string
  name: string
  email: string
  role: UserRole
}
