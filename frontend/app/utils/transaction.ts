import type { AgentRef, AgentRoleInTransaction } from '~/types'

/**
 * Presentation-only helpers for transactions.
 *
 * **Why this file is thin**: every business rule that used to live here —
 * "is this transaction payout-ready?", "is this the same-agent scenario?",
 * "what role does agent X play?", "what's agent X's share?" — has moved to
 * the backend. The server now ships `isPayoutReady` / `isSameAgent` as
 * virtuals on every transaction, and `GET /agents/:id/transactions` returns
 * the per-agent role and amount pre-computed. This means commission-rule
 * changes no longer require a frontend deploy.
 *
 * What stays here: UI strings and display formatting, which are genuinely a
 * frontend concern (locale, branding, accessibility copy).
 */

export type { AgentRoleInTransaction } from '~/types'

export const ROLE_LABEL: Record<AgentRoleInTransaction, string> = {
  listing: 'Portföy',
  selling: 'Satış',
  both: 'Portföy + Satış',
}

/**
 * Display label for an agent reference. Adds "(silindi)" when the agent has
 * been soft-deleted, so historical transactions make sense at a glance.
 */
export function agentLabel(ref?: AgentRef | null): string {
  if (!ref) return '—'
  return ref.deletedAt ? `${ref.name} (silindi)` : ref.name
}
