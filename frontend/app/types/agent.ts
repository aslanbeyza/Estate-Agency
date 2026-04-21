export interface Agent {
  _id: string
  name: string
  email: string
  phone?: string
}

export type AgentRef = Pick<Agent, '_id' | 'name' | 'email'>

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
