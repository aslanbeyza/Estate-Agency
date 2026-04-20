import { defineStore } from 'pinia';
import type { Agent, AgentEarnings } from '~/types';
import { withLoading } from './helpers';
export type { Agent, AgentEarnings };

export const useAgentsStore = defineStore('agents', {
  state: () => ({
    agents: [] as Agent[],
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchAll() {
      await withLoading(this, async () => {
        this.agents = await useApi().get<Agent[]>('/agents');
      });
    },

    async create(payload: { name: string; email: string; phone?: string }) {
      const api = useApi();
      const agent = await api.post<Agent>('/agents', payload);
      this.agents.unshift(agent);
      return agent;
    },

    async remove(id: string) {
      const api = useApi();
      await api.del(`/agents/${id}`);
      this.agents = this.agents.filter((a) => a._id !== id);
    },

    async earnings(id: string) {
      const api = useApi();
      return api.get<AgentEarnings>(`/agents/${id}/earnings`);
    },
  },
});
