import { defineStore } from 'pinia';
import type {
  Agent,
  AgentEarnings,
  AgentStats,
  AgentTransactionView,
} from '~/types';
import { withLoading } from './helpers';
export type { Agent, AgentEarnings, AgentStats, AgentTransactionView };

export const useAgentsStore = defineStore('agents', {
  state: () => ({
    agents: [] as Agent[],
    /**
     * Server-aggregated stats for the agents page. Populated by `fetchStats()`
     * so the UI never has to iterate over the transaction collection to
     * derive counters or earnings.
     */
    stats: [] as AgentStats[],
    /** Cached agent-scoped transaction feeds, keyed by agent id. */
    transactions: {} as Record<string, AgentTransactionView[]>,
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchAll() {
      await withLoading(this, async () => {
        this.agents = await useApi().get<Agent[]>('/agents');
      });
    },

    async fetchStats() {
      await withLoading(this, async () => {
        this.stats = await useApi().get<AgentStats[]>('/agents/stats');
      });
    },

    async fetchTransactions(id: string) {
      const list = await useApi().get<AgentTransactionView[]>(
        `/agents/${id}/transactions`,
      );
      this.transactions[id] = list;
      return list;
    },

    async create(payload: { name: string; email: string; phone?: string }) {
      const api = useApi();
      const agent = await api.post<Agent>('/agents', payload);
      this.agents.unshift(agent);
      // Invalidate stats so the new agent shows up with zeroed counters.
      await this.fetchStats();
      return agent;
    },

    async remove(id: string) {
      const api = useApi();
      await api.del(`/agents/${id}`);
      this.agents = this.agents.filter((a) => a._id !== id);
      this.stats = this.stats.filter((s) => s._id !== id);
    },

    async earnings(id: string) {
      const api = useApi();
      return api.get<AgentEarnings>(`/agents/${id}/earnings`);
    },
  },
});
