export interface Agent {
  _id: string
  name: string
  email: string
  phone?: string
  /**
   * ISO timestamp set when the agent is soft-deleted. `null` / undefined for
   * active agents. `AgentsStore.fetchAll()` already filters these out of the
   * main listing; this field is surfaced mainly for populated references on
   * historical transactions.
   */
  deletedAt?: string | null
}

export type AgentRef = Pick<Agent, '_id' | 'name' | 'email' | 'deletedAt'>

/** Monetary fields are integer kuruş (1 TRY = 100 kuruş). */
export interface AgentEarnings {
  agentId: string
  name: string
  email: string
  totalEarned: number
  completedTransactionCount: number
  asListingAgent: number
  asSellingAgent: number
}
