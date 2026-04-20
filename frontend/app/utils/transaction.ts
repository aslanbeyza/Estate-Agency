import type { CommissionBreakdown, Transaction } from '~/types'

export type AgentRoleInTransaction = 'listing' | 'selling' | 'both'

export type PayoutReady = Transaction & { commissionBreakdown: CommissionBreakdown }

/**
 * "Komisyon ödeme için hazır" — tamamlanmış + breakdown gelmiş işlem.
 * Type guard olduğu için filter sonrası commissionBreakdown non-null kabul edilir.
 */
export function isPayoutReady(
  tx: Pick<Transaction, 'stage' | 'commissionBreakdown'>,
): tx is PayoutReady {
  return tx.stage === 'completed' && !!tx.commissionBreakdown
}

export const ROLE_LABEL: Record<AgentRoleInTransaction, string> = {
  listing: 'Portföy',
  selling: 'Satış',
  both: 'Portföy + Satış',
}

function idOf(ref: Transaction['listingAgent'] | null | undefined): string | null {
  if (!ref) return null
  return (ref as any)._id ?? (ref as unknown as string) ?? null
}

export function isSameAgent(tx: Pick<Transaction, 'listingAgent' | 'sellingAgent'>): boolean {
  const l = idOf(tx.listingAgent)
  const s = idOf(tx.sellingAgent)
  return !!l && !!s && l === s
}

export function roleOfAgent(
  tx: Pick<Transaction, 'listingAgent' | 'sellingAgent'>,
  agentId: string,
): AgentRoleInTransaction | null {
  const isListing = idOf(tx.listingAgent) === agentId
  const isSelling = idOf(tx.sellingAgent) === agentId
  if (isListing && isSelling) return 'both'
  if (isListing) return 'listing'
  if (isSelling) return 'selling'
  return null
}

/**
 * Bir danışmanın bu işlemden hak ettiği komisyon miktarı.
 * commissionBreakdown yoksa (işlem tamamlanmamışsa) null döner.
 * Aynı danışman (both) senaryosunda backend listingAgentAmount'a tüm %50'yi koyar,
 * sellingAgentAmount = 0 olur; bu yüzden listing tarafını okumak yeterli.
 */
export function amountForAgent(
  tx: Pick<Transaction, 'listingAgent' | 'sellingAgent' | 'commissionBreakdown'>,
  agentId: string,
): number | null {
  if (!tx.commissionBreakdown) return null
  const role = roleOfAgent(tx, agentId)
  if (!role) return null
  if (role === 'selling') return tx.commissionBreakdown.sellingAgentAmount
  return tx.commissionBreakdown.listingAgentAmount
}
