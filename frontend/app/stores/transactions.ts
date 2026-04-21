import { defineStore } from 'pinia';
import type {
  CreateTransactionPayload,
  Transaction,
  TransactionStage,
} from '~/types';
import { isPayoutReady } from '~/types';
import { withLoading } from './helpers';

export type {
  AgentRef,
  CommissionBreakdown,
  Transaction,
  TransactionStage,
} from '~/types';

export const useTransactionsStore = defineStore('transactions', {
  state: () => ({
    transactions: [] as Transaction[],
    current: null as Transaction | null,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    byStage: (state) => (stage: TransactionStage) =>
      state.transactions.filter((t) => t.stage === stage),

    counts: (state) => ({
      agreement: state.transactions.filter((t) => t.stage === 'agreement').length,
      earnest_money: state.transactions.filter((t) => t.stage === 'earnest_money').length,
      title_deed: state.transactions.filter((t) => t.stage === 'title_deed').length,
      completed: state.transactions.filter((t) => t.stage === 'completed').length,
    }),

    totalAgencyRevenue: (state): number =>
      state.transactions
        .filter(isPayoutReady)
        .reduce((sum, t) => sum + t.commissionBreakdown.agencyAmount, 0),
  },

  actions: {
    async fetchAll() {
      await withLoading(this, async () => {
        this.transactions = await useApi().get<Transaction[]>('/transactions');
      });
    },

    async fetchOne(id: string) {
      await withLoading(this, async () => {
        this.current = await useApi().get<Transaction>(`/transactions/${id}`);
      });
    },

    async create(payload: CreateTransactionPayload) {
      const api = useApi();
      const tx = await api.post<Transaction>('/transactions', payload);
      this.transactions.unshift(tx);
      return tx;
    },

    async updateStage(id: string, stage: TransactionStage) {
      const api = useApi();
      const updated = await api.patch<Transaction>(`/transactions/${id}/stage`, { stage });
      const idx = this.transactions.findIndex((t) => t._id === id);
      if (idx !== -1) this.transactions[idx] = updated;
      if (this.current?._id === id) this.current = updated;
      return updated;
    },

    async remove(id: string) {
      const api = useApi();
      await api.del(`/transactions/${id}`);
      this.transactions = this.transactions.filter((t) => t._id !== id);
      if (this.current?._id === id) this.current = null;
    },
  },
});
